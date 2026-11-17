import { Request, Response } from 'express';
import { Claim } from '../models/Claim';
import { Item } from '../models/Item';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { escapeRegex, paginate } from '../utils/pagination';
import { isAdmin } from '../middlewares/auth';
import { audit } from '../services/audit.service';
import { assertAttachable } from '../services/file.service';
import * as svc from '../services/claim.service';

const ITEM_FIELDS = 'code title category status locationName eventDate reportType description imageFileIds';
const PERSON_FIELDS = 'fullName email studentId department';

function populated(q: any) {
  return q
    .populate('foundItemId', ITEM_FIELDS)
    .populate('lostItemId', ITEM_FIELDS)
    .populate('claimantId', PERSON_FIELDS)
    .populate('reviewedBy', 'fullName department')
    .populate('assignedTo', 'fullName department')
    .populate('evidenceFileIds', 'originalName mimeType size');
}

async function loadSerialized(req: Request, id: string) {
  const c = await populated(Claim.findById(id)).lean();
  return svc.serializeClaim(c, req.user!);
}

export async function list(req: Request, res: Response) {
  const q = req.query as any;
  const filter: Record<string, any> = {};
  if (!isAdmin(req)) filter.claimantId = req.user!.id;
  if (q.status) filter.status = q.status;
  if (q.foundItemId) filter.foundItemId = q.foundItemId;
  if (q.assigned === 'me' && isAdmin(req)) filter.$and = [{ $or: [{ assignedTo: req.user!.id }, { reviewedBy: req.user!.id }] }];
  if (q.assigned === 'unassigned' && isAdmin(req)) { filter.assignedTo = null; filter.status = 'pending'; }
  if (q.q && isAdmin(req)) {
    const rx = { $regex: escapeRegex(q.q), $options: 'i' };
    const [items, users] = await Promise.all([
      Item.find({ $or: [{ title: rx }, { code: rx }] }).select('_id').lean(),
      User.find({ $or: [{ fullName: rx }, { email: rx }, { studentId: rx }] }).select('_id').lean(),
    ]);
    filter.$or = [{ foundItemId: { $in: items.map((i) => i._id) } }, { claimantId: { $in: users.map((u) => u._id) } }, { ownershipEvidence: rx }];
  }
  const [rows, total] = await Promise.all([
    populated(Claim.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit)).lean(),
    Claim.countDocuments(filter),
  ]);
  res.json(paginate(rows.map((c: any) => svc.serializeClaim(c, req.user!)), total, q.page, q.limit));
}

export async function getOne(req: Request, res: Response) {
  const c: any = await populated(Claim.findById(req.params.id)).lean();
  if (!c) throw AppError.notFound('Claim');
  if (!isAdmin(req) && String(c.claimantId?._id) !== req.user!.id) throw AppError.notFound('Claim'); // no IDOR leak
  res.json({ claim: svc.serializeClaim(c, req.user!) });
}

export async function create(req: Request, res: Response) {
  const claim = await svc.createClaim(req, req.user!, req.body);
  res.status(201).json({ claim: await loadSerialized(req, String(claim._id)) });
}

export async function update(req: Request, res: Response) {
  const claim = await Claim.findById(req.params.id);
  if (!claim) throw AppError.notFound('Claim');
  const admin = isAdmin(req);
  const own = String(claim.claimantId) === req.user!.id;
  if (!admin && !own) throw AppError.notFound('Claim');
  const { version, adminNote, ownershipEvidence, evidenceFileIds } = req.body;
  const $set: Record<string, unknown> = {};
  if (adminNote !== undefined) {
    if (!admin) throw AppError.forbidden('Only admins can add notes');
    $set.adminNote = adminNote;
  }
  if (ownershipEvidence !== undefined || evidenceFileIds !== undefined) {
    if (!own) throw AppError.forbidden('Only the claimant can change evidence');
    if (claim.status !== 'pending') throw AppError.conflict('Only pending claims can be edited', 'INVALID_STATE');
    if (ownershipEvidence !== undefined) $set.ownershipEvidence = ownershipEvidence;
    if (evidenceFileIds !== undefined) {
      await assertAttachable(evidenceFileIds, 'claim_evidence', req.user!.id, req.user!, { exceptClaimId: String(claim._id) });
      $set.evidenceFileIds = evidenceFileIds;
    }
  }
  if (!Object.keys($set).length) throw AppError.validation('Nothing to update');
  const updated = await Claim.findOneAndUpdate({ _id: claim._id, __v: version }, { $set, $inc: { __v: 1 } }, { returnDocument: 'after' });
  if (!updated) throw AppError.conflict('This claim was changed by someone else. Reload and try again.', 'STALE_VERSION');
  await audit(req, 'claim.updated', 'claim', claim._id, { fields: Object.keys($set) });
  res.json({ claim: await loadSerialized(req, String(claim._id)) });
}

export async function withdraw(req: Request, res: Response) {
  const c = await Claim.findById(req.params.id).lean();
  if (!c || String(c.claimantId) !== req.user!.id) throw AppError.notFound('Claim');
  await svc.withdrawClaim(req, String(req.params.id));
  res.json({ claim: await loadSerialized(req, String(req.params.id)) });
}

export async function assign(req: Request, res: Response) {
  await svc.assignClaim(req, String(req.params.id), req.body.version, req.body.staffId);
  res.json({ claim: await loadSerialized(req, String(req.params.id)) });
}

export async function approve(req: Request, res: Response) {
  await svc.approveClaim(req, String(req.params.id), req.body.version, req.body.adminNote);
  res.json({ claim: await loadSerialized(req, String(req.params.id)) });
}

export async function reject(req: Request, res: Response) {
  await svc.rejectClaim(req, String(req.params.id), req.body.version, req.body.adminNote);
  res.json({ claim: await loadSerialized(req, String(req.params.id)) });
}

export async function markReturned(req: Request, res: Response) {
  await svc.returnClaim(req, String(req.params.id), req.body.version, req.body.adminNote);
  res.json({ claim: await loadSerialized(req, String(req.params.id)) });
}

export async function remove(req: Request, res: Response) {
  await svc.deleteClaim(req, String(req.params.id));
  res.json({ ok: true, message: 'Claim deleted' });
}
