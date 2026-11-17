import { User, isStaffRole } from '../models/User';
import { ClientSession, Types } from 'mongoose';
import { Request } from 'express';
import { Claim } from '../models/Claim';
import { Item } from '../models/Item';
import { AppError } from '../utils/AppError';
import { withTransaction } from '../utils/txn';
import { audit } from './audit.service';
import { assertAttachable, contentPath } from './file.service';
import { AuthUser } from '../middlewares/auth';

/** Recompute a found item's status after a claim leaves the pending state. */
export async function settleFoundItem(foundItemId: Types.ObjectId | string, session: ClientSession) {
  const item = await Item.findById(foundItemId).session(session);
  if (!item || !['open', 'claim_pending'].includes(item.status)) return;
  const pending = await Claim.exists({ foundItemId, status: 'pending' }).session(session);
  const next = pending ? 'claim_pending' : 'open';
  if (item.status !== next) await Item.updateOne({ _id: item._id }, { $set: { status: next }, $inc: { __v: 1 } }, { session });
}

/** Conditional status transition with optimistic version check. */
async function transition(id: string, from: string, version: number, set: Record<string, unknown>, session: ClientSession): Promise<any> {
  const updated = await Claim.findOneAndUpdate({ _id: id, status: from, __v: version } as any, { $set: set, $inc: { __v: 1 } }, { returnDocument: 'after', session });
  if (updated) return updated;
  const current = await Claim.findById(id).session(session).lean();
  if (!current) throw AppError.notFound('Claim');
  if (current.status !== from) throw AppError.conflict(`Claim is already ${current.status}`, 'INVALID_STATE');
  throw AppError.conflict('This claim was changed by someone else. Reload and try again.', 'STALE_VERSION');
}

export async function createClaim(req: Request, user: AuthUser, body: { foundItemId: string; lostItemId?: string; ownershipEvidence: string; evidenceFileIds: string[] }) {
  return withTransaction(async (session) => {
    const found = await Item.findOne({ _id: body.foundItemId, deletedAt: null }).session(session);
    if (!found) throw AppError.notFound('Found item');
    if (found.reportType !== 'found') throw AppError.validation('Claims can only be made against found-item reports');
    if (String(found.reportedBy) === user.id) throw AppError.conflict('You cannot claim an item you reported as found', 'SELF_CLAIM');
    if (!['open', 'claim_pending'].includes(found.status)) throw AppError.conflict(`This item is ${found.status.replace('_', ' ')} and no longer accepts claims`, 'ITEM_NOT_CLAIMABLE');

    if (body.lostItemId) {
      const lost = await Item.findOne({ _id: body.lostItemId, deletedAt: null }).session(session);
      if (!lost || lost.reportType !== 'lost') throw AppError.validation('Linked report must be one of your lost-item reports');
      if (String(lost.reportedBy) !== user.id) throw AppError.forbidden('You can only link your own lost report');
      if (['returned', 'closed'].includes(lost.status)) throw AppError.conflict('The linked lost report is already closed', 'INVALID_STATE');
    }
    await assertAttachable(body.evidenceFileIds, 'claim_evidence', user.id, user, { session });

    let claim;
    try {
      [claim] = await Claim.create(
        [{ foundItemId: found._id, lostItemId: body.lostItemId, claimantId: user.id, ownershipEvidence: body.ownershipEvidence, evidenceFileIds: body.evidenceFileIds, status: 'pending', active: true }],
        { session },
      );
    } catch (err: any) {
      if (err?.code === 11000) throw AppError.conflict('You already have an active claim on this item', 'DUPLICATE_CLAIM');
      throw err;
    }
    if (found.status === 'open') await Item.updateOne({ _id: found._id }, { $set: { status: 'claim_pending' }, $inc: { __v: 1 } }, { session });
    await audit(req, 'claim.created', 'claim', claim._id, { foundItemId: String(found._id), code: found.code }, session);
    return claim;
  });
}

/** Staff picks up a pending claim (or a super admin hands it to a staff member). */
export async function assignClaim(req: Request, id: string, version: number, staffId?: string) {
  const target = staffId ?? req.user!.id;
  if (target !== req.user!.id && req.user!.role !== 'super_admin') throw AppError.forbidden('Only a super admin can assign claims to someone else');
  const staff = await User.findOne({ _id: target, status: 'active' }).select('role fullName').lean();
  if (!staff || !isStaffRole(staff.role)) throw AppError.validation('Claims can only be assigned to active staff');
  return withTransaction(async (session) => {
    const claim = await transition(id, 'pending', version, { assignedTo: target, assignedAt: new Date() }, session);
    await audit(req, 'claim.assigned', 'claim', claim._id, { assignedTo: target, staff: staff.fullName }, session);
    return claim;
  });
}

/** Whoever reviews an unassigned claim becomes its handler. */
const handler = (req: Request) => ({ reviewedBy: req.user!.id, reviewedAt: new Date() });

export async function approveClaim(req: Request, id: string, version: number, adminNote?: string) {
  return withTransaction(async (session) => {
    const claim = await transition(id, 'pending', version, { status: 'approved', adminNote, ...handler(req) }, session);
    const found = await Item.findOneAndUpdate(
      { _id: claim.foundItemId, status: { $in: ['open', 'claim_pending'] }, deletedAt: null },
      { $set: { status: 'matched' }, $inc: { __v: 1 } },
      { returnDocument: 'after', session },
    );
    if (!found) throw AppError.conflict('The found item is no longer available for matching', 'ITEM_NOT_CLAIMABLE');
    if (claim.lostItemId) await Item.updateOne({ _id: claim.lostItemId, status: { $in: ['open', 'claim_pending'] } }, { $set: { status: 'matched' }, $inc: { __v: 1 } }, { session });

    // Other pending claims on the same item are closed out — only one owner can be approved.
    const others = await Claim.find({ foundItemId: claim.foundItemId, status: 'pending', _id: { $ne: claim._id } }).session(session);
    for (const o of others) {
      await Claim.updateOne({ _id: o._id }, { $set: { status: 'rejected', active: false, adminNote: 'Another claim for this item was approved.', reviewedBy: req.user!.id, reviewedAt: new Date() }, $inc: { __v: 1 } }, { session });
      await audit(req, 'claim.auto_rejected', 'claim', o._id, { approvedClaimId: String(claim._id) }, session);
    }
    await audit(req, 'claim.approved', 'claim', claim._id, { foundItemId: String(claim.foundItemId), code: found.code }, session);
    return claim;
  }).catch((err) => {
    if (err?.code === 11000) throw AppError.conflict('Another claim for this item has already been approved', 'ALREADY_APPROVED');
    throw err;
  });
}

export async function rejectClaim(req: Request, id: string, version: number, adminNote: string) {
  return withTransaction(async (session) => {
    const claim = await transition(id, 'pending', version, { status: 'rejected', active: false, adminNote, ...handler(req) }, session);
    await settleFoundItem(claim.foundItemId, session);
    await audit(req, 'claim.rejected', 'claim', claim._id, { reason: adminNote }, session);
    return claim;
  });
}

export async function returnClaim(req: Request, id: string, version: number, adminNote?: string) {
  return withTransaction(async (session) => {
    const now = new Date();
    const set: Record<string, unknown> = { status: 'returned', active: false, returnedAt: now };
    if (adminNote) set.adminNote = adminNote;
    const claim = await transition(id, 'approved', version, set, session);
    const found = await Item.findOneAndUpdate({ _id: claim.foundItemId, status: 'matched' }, { $set: { status: 'returned', returnedAt: now }, $inc: { __v: 1 } }, { returnDocument: 'after', session });
    if (!found) throw AppError.conflict('Found item is not in the matched state', 'INVALID_STATE');
    if (claim.lostItemId) await Item.updateOne({ _id: claim.lostItemId }, { $set: { status: 'returned', returnedAt: now }, $inc: { __v: 1 } }, { session });
    await audit(req, 'claim.returned', 'claim', claim._id, { foundItemId: String(found._id), code: found.code }, session);
    await audit(req, 'item.returned', 'item', found._id, { code: found.code, claimId: String(claim._id) }, session);
    return claim;
  });
}

export async function withdrawClaim(req: Request, id: string) {
  return withTransaction(async (session) => {
    const claim = await Claim.findById(id).session(session);
    if (!claim) throw AppError.notFound('Claim');
    if (String(claim.claimantId) !== req.user!.id) throw AppError.forbidden('Only the claimant can withdraw this claim');
    const updated = await transition(id, 'pending', claim.__v ?? 0, { status: 'withdrawn', active: false, withdrawnAt: new Date() }, session);
    await settleFoundItem(updated.foundItemId, session);
    await audit(req, 'claim.withdrawn', 'claim', updated._id, {}, session);
    return updated;
  });
}

export async function deleteClaim(req: Request, id: string) {
  return withTransaction(async (session) => {
    const claim = await Claim.findById(id).session(session);
    if (!claim) throw AppError.notFound('Claim');
    if (!['pending', 'rejected'].includes(claim.status)) throw AppError.conflict('Approved, returned and withdrawn claims are kept as audit records', 'CLAIM_IMMUTABLE');
    await Claim.deleteOne({ _id: claim._id }, { session });
    if (claim.status === 'pending') await settleFoundItem(claim.foundItemId, session);
    await audit(req, 'claim.deleted', 'claim', claim._id, { status: claim.status }, session);
    return claim;
  });
}

export function serializeClaim(c: any, viewer: AuthUser) {
  const item = (x: any) =>
    x && x._id
      ? { id: String(x._id), code: x.code, title: x.title, category: x.category, status: x.status, locationName: x.locationName, eventDate: x.eventDate, reportType: x.reportType, description: isStaffRole(viewer.role) ? x.description : undefined, imageFileIds: (x.imageFileIds ?? []).map(String) }
      : x ? { id: String(x) } : null;
  const person = (p: any) => (p && p._id ? { id: String(p._id), fullName: p.fullName, ...(isStaffRole(viewer.role) ? { email: p.email, studentId: p.studentId, department: p.department } : {}) } : p ? { id: String(p) } : null);
  return {
    id: String(c._id),
    foundItem: item(c.foundItemId),
    lostItem: item(c.lostItemId),
    claimant: person(c.claimantId),
    ownershipEvidence: c.ownershipEvidence,
    evidenceFileIds: (c.evidenceFileIds ?? []).map((f: any) => String(f?._id ?? f)),
    evidence: (c.evidenceFileIds ?? [])
      .filter((f: any) => f && f._id)
      .map((f: any) => ({ id: String(f._id), originalName: f.originalName, mimeType: f.mimeType, size: f.size, ...contentPath(String(f._id), viewer.id) })),
    status: c.status,
    adminNote: c.adminNote ?? null,
    reviewedBy: person(c.reviewedBy),
    // Students see who is handling their claim (name + office only).
    assignedTo: c.assignedTo && c.assignedTo._id ? { id: String(c.assignedTo._id), fullName: c.assignedTo.fullName, department: c.assignedTo.department } : c.reviewedBy && c.reviewedBy._id ? { id: String(c.reviewedBy._id), fullName: c.reviewedBy.fullName, department: c.reviewedBy.department } : null,
    assignedAt: c.assignedAt ?? null,
    reviewedAt: c.reviewedAt ?? null,
    returnedAt: c.returnedAt ?? null,
    withdrawnAt: c.withdrawnAt ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    version: c.__v ?? 0,
  };
}
