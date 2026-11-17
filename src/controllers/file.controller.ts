import { Request, Response } from 'express';
import { FileObject, publicFile } from '../models/FileObject';
import { Item } from '../models/Item';
import { Claim } from '../models/Claim';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { paginate } from '../utils/pagination';
import { isAdmin } from '../middlewares/auth';
import { audit } from '../services/audit.service';
import { storage } from '../services/storage';
import { assertAttachable, canReadFile, contentPath, deleteFile, fileReferences, storeUpload, verifyFileToken } from '../services/file.service';
import { uploadSchema } from '../validators/file.validators';

export async function upload(req: Request, res: Response) {
  const { purpose } = uploadSchema.parse({ purpose: req.body?.purpose ?? req.query.purpose });
  if (!req.file) throw AppError.validation('Attach a file in the "file" field', [{ field: 'file', message: 'Required' }]);
  const f = await storeUpload(req.user!, req.file.originalname, req.file.buffer, purpose);
  await audit(req, 'file.uploaded', 'file', f._id, { purpose, mimeType: f.mimeType, size: f.size });
  res.status(201).json({ file: publicFile(f, { ...contentPath(String(f._id), req.user!.id), inUse: false }) });
}

export async function list(req: Request, res: Response) {
  const q = req.query as any;
  const filter: Record<string, unknown> = { deletingAt: null };
  if (!(isAdmin(req) && q.all === 'true')) filter.uploadedBy = req.user!.id;
  if (q.purpose) filter.purpose = q.purpose;
  const [rows, total] = await Promise.all([
    FileObject.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).populate('uploadedBy', 'fullName').lean(),
    FileObject.countDocuments(filter),
  ]);
  const ids = rows.map((r) => r._id);
  const [items, claims, users] = await Promise.all([
    Item.find({ imageFileIds: { $in: ids } }).select('imageFileIds code title').lean(),
    Claim.find({ evidenceFileIds: { $in: ids } }).select('evidenceFileIds status').lean(),
    User.find({ avatarFileId: { $in: ids } }).select('avatarFileId').lean(),
  ]);
  const usage = (id: string) => {
    const it = items.find((i) => i.imageFileIds.some((x) => String(x) === id));
    if (it) return { type: 'item', id: String(it._id), label: `${it.code} · ${it.title}` };
    const cl = claims.find((c) => c.evidenceFileIds.some((x) => String(x) === id));
    if (cl) return { type: 'claim', id: String(cl._id), label: `Claim (${cl.status})` };
    if (users.some((u) => String(u.avatarFileId) === id)) return { type: 'user', id: null, label: 'Profile photo' };
    return null;
  };
  res.json(paginate(rows.map((r) => { const u = usage(String(r._id)); return publicFile(r, { inUse: !!u, usedBy: u }); }), total, q.page, q.limit));
}

async function loadReadable(req: Request) {
  const f = await FileObject.findOne({ _id: req.params.id, deletingAt: null }).populate('uploadedBy', 'fullName').lean();
  if (!f || !(await canReadFile(f, req.user!))) throw AppError.notFound('File'); // 404, not 403: don't reveal existence
  return f;
}

export async function getOne(req: Request, res: Response) {
  const f = await loadReadable(req);
  const refs = await fileReferences(f._id);
  res.json({ file: publicFile(f, { inUse: refs.total > 0 }) });
}

/** Issue a fresh 60-second signed link for in-app preview/download. */
export async function signedUrl(req: Request, res: Response) {
  const f = await loadReadable(req);
  res.json(contentPath(String(f._id), req.user!.id));
}

/** Stream from the private bucket. Accepts a signed link token (img/iframe) — no public URL exists. */
export async function content(req: Request, res: Response) {
  const token = String(req.query.token ?? '');
  if (!token) throw AppError.unauthorized('A signed file link is required');
  const payload = verifyFileToken(token, String(req.params.id));
  const viewer = await User.findById(payload.u).select('role status').lean();
  if (!viewer || viewer.status !== 'active') throw AppError.forbidden();
  const f = await FileObject.findOne({ _id: req.params.id, deletingAt: null }).lean();
  if (!f) throw AppError.notFound('File');
  if (!(await canReadFile(f, { id: String(viewer._id), role: viewer.role }))) throw AppError.forbidden();
  const stream = await storage().get(f.relativePath).catch(() => {
    throw AppError.notFound('File content');
  });
  const download = req.query.download === '1';
  const encoded = encodeURIComponent(f.originalName);
  res.setHeader('Content-Type', f.mimeType);
  res.setHeader('Content-Length', String(f.size));
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${f.originalName.replace(/"/g, '')}"; filename*=UTF-8''${encoded}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/** Attach an uploaded file to an entity (report image, claim evidence or profile photo). */
export async function link(req: Request, res: Response) {
  const f = await FileObject.findOne({ _id: req.params.id, deletingAt: null }).lean();
  if (!f) throw AppError.notFound('File');
  if (!isAdmin(req) && String(f.uploadedBy) !== req.user!.id) throw AppError.forbidden('You can only link your own files');
  const { entityType, entityId } = req.body;
  if (entityType === 'item') {
    if (f.purpose !== 'item_image') throw AppError.validation('Only item images can be linked to reports');
    const item = await Item.findOne({ _id: entityId, deletedAt: null });
    if (!item) throw AppError.notFound('Item');
    if (!isAdmin(req) && String(item.reportedBy) !== req.user!.id) throw AppError.forbidden();
    if (item.status === 'returned') throw AppError.conflict('Returned reports cannot be changed', 'ITEM_RETURNED');
    if (item.imageFileIds.length >= 5) throw AppError.conflict('Maximum 5 images per report', 'LIMIT_REACHED');
    await assertAttachable([String(f._id)], 'item_image', String(item.reportedBy), req.user!, { exceptItemId: String(item._id) });
    await Item.updateOne({ _id: item._id }, { $addToSet: { imageFileIds: f._id }, $inc: { __v: 1 } });
  } else if (entityType === 'claim') {
    if (f.purpose !== 'claim_evidence') throw AppError.validation('Only evidence files can be linked to claims');
    const claim = await Claim.findById(entityId);
    if (!claim || (!isAdmin(req) && String(claim.claimantId) !== req.user!.id)) throw AppError.notFound('Claim');
    if (claim.status !== 'pending') throw AppError.conflict('Only pending claims can receive evidence', 'INVALID_STATE');
    if (claim.evidenceFileIds.length >= 3) throw AppError.conflict('Maximum 3 evidence files per claim', 'LIMIT_REACHED');
    await assertAttachable([String(f._id)], 'claim_evidence', String(claim.claimantId), req.user!, { exceptClaimId: String(claim._id) });
    await Claim.updateOne({ _id: claim._id }, { $addToSet: { evidenceFileIds: f._id }, $inc: { __v: 1 } });
  } else {
    if (f.purpose !== 'avatar') throw AppError.validation('Only avatar images can be used as a profile photo');
    if (!isAdmin(req) && entityId !== req.user!.id) throw AppError.forbidden();
    await User.updateOne({ _id: entityId }, { $set: { avatarFileId: f._id } });
  }
  await audit(req, 'file.linked', 'file', f._id, { entityType, entityId });
  res.json({ ok: true, message: 'File linked' });
}

export async function remove(req: Request, res: Response) {
  const f = await FileObject.findOne({ _id: req.params.id, deletingAt: null }).lean();
  if (!f) throw AppError.notFound('File');
  if (!isAdmin(req) && String(f.uploadedBy) !== req.user!.id) throw AppError.forbidden('You can only delete your own files');
  await deleteFile(f);
  await audit(req, 'file.deleted', 'file', f._id, { originalName: f.originalName, purpose: f.purpose });
  res.json({ ok: true, message: 'File deleted' });
}
