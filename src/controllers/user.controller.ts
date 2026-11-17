import { Request, Response } from 'express';
import { User, publicUser } from '../models/User';
import { Item } from '../models/Item';
import { Claim } from '../models/Claim';
import { AppError } from '../utils/AppError';
import { escapeRegex, paginate } from '../utils/pagination';
import { isAdmin } from '../middlewares/auth';
import { audit } from '../services/audit.service';
import { revokeAllForUser } from '../services/token.service';
import { assertAttachable, contentPath } from '../services/file.service';

export async function list(req: Request, res: Response) {
  const q = req.query as any;
  const filter: Record<string, any> = {};
  if (q.role) filter.role = q.role;
  if (q.status) filter.status = q.status;
  if (q.department) filter.department = q.department;
  if (q.q) {
    const rx = { $regex: escapeRegex(q.q), $options: 'i' };
    filter.$or = [{ fullName: rx }, { email: rx }, { studentId: rx }, { department: rx }];
  }
  const [rows, total] = await Promise.all([
    User.find(filter).sort({ role: 1, createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    User.countDocuments(filter),
  ]);
  const ids = rows.map((r) => r._id);
  const [reports, claims] = await Promise.all([
    Item.aggregate([{ $match: { reportedBy: { $in: ids }, deletedAt: null } }, { $group: { _id: '$reportedBy', n: { $sum: 1 } } }]),
    Claim.aggregate([{ $match: { claimantId: { $in: ids } } }, { $group: { _id: '$claimantId', n: { $sum: 1 } } }]),
  ]);
  const count = (arr: any[], id: unknown) => arr.find((a) => String(a._id) === String(id))?.n ?? 0;
  res.json(paginate(rows.map((u) => ({ ...publicUser(u), reportCount: count(reports, u._id), claimCount: count(claims, u._id) })), total, q.page, q.limit));
}

export async function getOne(req: Request, res: Response) {
  if (!isAdmin(req) && req.params.id !== req.user!.id) throw AppError.forbidden();
  const u = await User.findById(req.params.id).lean();
  if (!u) throw AppError.notFound('User');
  res.json({ user: { ...publicUser(u), avatar: u.avatarFileId ? contentPath(String(u.avatarFileId), req.user!.id) : null } });
}

export async function update(req: Request, res: Response) {
  const self = req.params.id === req.user!.id;
  const admin = isAdmin(req);
  if (!self && !admin) throw AppError.forbidden();
  const target = await User.findById(req.params.id);
  if (!target) throw AppError.notFound('User');
  const { role, status, avatarFileId, ...profile } = req.body;

  if ((role !== undefined || status !== undefined) && !admin) throw AppError.forbidden('Role and status are managed by administrators');
  const demoting = role === 'student' && target.role === 'admin';
  const deactivating = status === 'inactive' && target.status === 'active';
  if (self && (demoting || deactivating)) throw AppError.conflict('You cannot demote or deactivate your own account', 'SELF_LOCKOUT');
  if ((demoting || deactivating) && target.role === 'admin') {
    const activeAdmins = await User.countDocuments({ role: 'admin', status: 'active' });
    if (activeAdmins <= 1) throw AppError.conflict('The system must keep at least one active admin', 'LAST_ADMIN');
  }
  if (avatarFileId) await assertAttachable([avatarFileId], 'avatar', String(target._id), req.user!);

  Object.assign(target, profile);
  if (avatarFileId !== undefined) target.avatarFileId = avatarFileId ?? undefined;
  if (role !== undefined) target.role = role;
  if (status !== undefined) target.status = status;
  await target.save();
  if (deactivating) await revokeAllForUser(target._id);

  const changed = Object.keys(req.body);
  if (role !== undefined || status !== undefined) await audit(req, 'user.access_changed', 'user', target._id, { role, status, email: target.email });
  else await audit(req, 'user.profile_updated', 'user', target._id, { fields: changed });
  res.json({ user: { ...publicUser(target), avatar: target.avatarFileId ? contentPath(String(target.avatarFileId), req.user!.id) : null } });
}
