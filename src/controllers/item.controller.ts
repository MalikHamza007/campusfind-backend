import { Request, Response } from 'express';
import { Item } from '../models/Item';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { escapeRegex, paginate } from '../utils/pagination';
import { withTransaction } from '../utils/txn';
import { audit } from '../services/audit.service';
import { assertAttachable } from '../services/file.service';
import { hasActiveClaim, nextItemCode, serializeItem } from '../services/item.service';
import { isAdmin } from '../middlewares/auth';

const SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  eventDate: { eventDate: 1 },
  '-eventDate': { eventDate: -1 },
  title: { title: 1 },
  status: { status: 1, createdAt: -1 },
};
const REPORTER_FIELDS = 'fullName email studentId department';

async function buildFilter(req: Request, extra: Record<string, unknown> = {}) {
  const q = req.query as any;
  const filter: Record<string, any> = { ...extra };
  if (!(isAdmin(req) && q.includeDeleted === 'true')) filter.deletedAt = null;
  if (q.type) filter.reportType = q.type;
  if (q.category) filter.category = q.category;
  if (q.status) filter.status = q.status;
  if (q.reportedBy && isAdmin(req)) filter.reportedBy = q.reportedBy;
  if (q.dateFrom || q.dateTo) {
    filter.eventDate = {};
    if (q.dateFrom) filter.eventDate.$gte = q.dateFrom;
    if (q.dateTo) filter.eventDate.$lte = new Date(new Date(q.dateTo).getTime() + 864e5 - 1);
  }
  if (q.location) filter.locationName = { $regex: escapeRegex(q.location), $options: 'i' };
  if (q.q) {
    const rx = { $regex: escapeRegex(q.q), $options: 'i' };
    filter.$or = [{ title: rx }, { description: rx }, { brand: rx }, { locationName: rx }, { code: rx }, { color: rx }];
  }
  if (q.near) {
    const [lat, lng] = String(q.near).split(',').map(Number);
    filter.geo = { $geoWithin: { $centerSphere: [[lng, lat], (q.radius ?? 300) / 6378100] } };
  }
  return filter;
}

async function listWith(req: Request, res: Response, extra: Record<string, unknown> = {}) {
  const q = req.query as any;
  const filter = await buildFilter(req, extra);
  const [rows, total] = await Promise.all([
    Item.find(filter).sort(SORTS[q.sort] ?? SORTS.newest).skip((q.page - 1) * q.limit).limit(q.limit).populate('reportedBy', REPORTER_FIELDS).lean(),
    Item.countDocuments(filter),
  ]);
  res.json(paginate(rows.map((r) => serializeItem(r, req.user!)), total, q.page, q.limit));
}

export const list = (req: Request, res: Response) => listWith(req, res);
export const mine = (req: Request, res: Response) => listWith(req, res, { reportedBy: req.user!.id });

export async function getOne(req: Request, res: Response) {
  const item = await Item.findById(req.params.id).populate('reportedBy', REPORTER_FIELDS).lean();
  if (!item || (item.deletedAt && !isAdmin(req))) throw AppError.notFound('Item');
  res.json({ item: serializeItem(item, req.user!, { withImages: 'all' }) });
}

export async function create(req: Request, res: Response) {
  const b = req.body;
  await assertAttachable(b.imageFileIds, 'item_image', req.user!.id, req.user!);
  const item = await withTransaction(async (session) => {
    const code = await nextItemCode(b.reportType, session);
    const [doc] = await Item.create(
      [{ ...b, code, status: 'open', reportedBy: req.user!.id, geo: { type: 'Point', coordinates: [b.coordinates.lng, b.coordinates.lat] } }],
      { session },
    );
    await audit(req, `item.${b.reportType}_reported`, 'item', doc._id, { code, title: b.title, category: b.category }, session);
    return doc;
  });
  const populated = await Item.findById(item._id).populate('reportedBy', REPORTER_FIELDS).lean();
  res.status(201).json({ item: serializeItem(populated, req.user!, { withImages: 'all' }) });
}

async function loadEditable(req: Request) {
  const item = await Item.findById(req.params.id);
  if (!item || item.deletedAt) throw AppError.notFound('Item');
  const owner = String(item.reportedBy) === req.user!.id;
  if (!owner && !isAdmin(req)) throw AppError.forbidden('You can only change your own reports');
  if (item.status === 'returned') throw AppError.conflict('Returned reports are permanent records and cannot be changed', 'ITEM_RETURNED');
  return { item, owner };
}

export async function update(req: Request, res: Response) {
  const { item } = await loadEditable(req);
  const { version, status, ...changes } = req.body as Record<string, any>;
  if (!isAdmin(req)) {
    if (status) throw AppError.forbidden('Status is managed by the lost & found office');
    if (item.reportType === 'found' && item.status !== 'open') throw AppError.conflict('Found reports can only be edited while unclaimed', 'ITEM_CLAIMED');
  }
  if (status && (await hasActiveClaim(item._id))) throw AppError.conflict('Resolve active claims before changing the status', 'ACTIVE_CLAIM');
  if (changes.imageFileIds) await assertAttachable(changes.imageFileIds, 'item_image', String(item.reportedBy), req.user!, { exceptItemId: String(item._id) });
  const reportType = item.reportType;
  const next = { ...item.toObject(), ...changes };
  if (reportType === 'found' && !(next.distinctiveFeatures || next.color || next.brand)) {
    throw AppError.validation('Found reports need at least one distinguishing detail', [{ field: 'distinctiveFeatures', message: 'Add features, color or brand' }]);
  }
  const $set: Record<string, unknown> = { ...changes };
  if (status) $set.status = status;
  if (changes.coordinates) $set.geo = { type: 'Point', coordinates: [changes.coordinates.lng, changes.coordinates.lat] };
  const updated = await Item.findOneAndUpdate({ _id: item._id, __v: version, deletedAt: null }, { $set, $inc: { __v: 1 } }, { returnDocument: 'after' }).populate('reportedBy', REPORTER_FIELDS).lean();
  if (!updated) throw AppError.conflict('This report was changed by someone else. Reload and try again.', 'STALE_VERSION');
  await audit(req, 'item.updated', 'item', item._id, { code: item.code, fields: Object.keys($set) });
  res.json({ item: serializeItem(updated, req.user!, { withImages: 'all' }) });
}

export async function remove(req: Request, res: Response) {
  const { item } = await loadEditable(req);
  if (await hasActiveClaim(item._id)) throw AppError.conflict('This report has an active or approved claim and cannot be deleted', 'ACTIVE_CLAIM');
  await Item.updateOne({ _id: item._id }, { $set: { deletedAt: new Date(), deletedBy: req.user!.id }, $inc: { __v: 1 } });
  await audit(req, 'item.deleted', 'item', item._id, { code: item.code, title: item.title });
  res.json({ ok: true, id: String(item._id), message: 'Report deleted' });
}

/** Admin: restore a soft-deleted report. */
export async function restore(req: Request, res: Response) {
  const item = await Item.findOneAndUpdate({ _id: req.params.id, deletedAt: { $ne: null } }, { $set: { deletedAt: null }, $unset: { deletedBy: 1 }, $inc: { __v: 1 } }, { returnDocument: 'after' }).populate('reportedBy', REPORTER_FIELDS).lean();
  if (!item) throw AppError.notFound('Deleted item');
  await audit(req, 'item.restored', 'item', item._id, { code: item.code });
  res.json({ item: serializeItem(item, req.user!) });
}

export async function departments(_req: Request, res: Response) {
  res.json({ data: (await User.distinct('department')).sort() });
}
