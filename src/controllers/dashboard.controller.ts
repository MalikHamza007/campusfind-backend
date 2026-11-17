import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Item, CATEGORIES } from '../models/Item';
import { Claim } from '../models/Claim';
import { User, isStaffRole } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { FileObject } from '../models/FileObject';
import { escapeRegex } from '../utils/pagination';
import { dbState } from '../config/db';
import { storage } from '../services/storage';
import { geoStats } from '../services/geo.service';
import { serializeItem } from '../services/item.service';
import { serializeClaim } from '../services/claim.service';

type Q = { dateFrom?: Date; dateTo?: Date; category?: string; location?: string; department?: string; reportType?: string; granularity: 'day' | 'week' };

async function itemMatch(q: Q, extra: Record<string, unknown> = {}) {
  const m: Record<string, any> = { deletedAt: null, ...extra };
  if (q.category) m.category = q.category;
  if (q.reportType) m.reportType = q.reportType;
  if (q.location) m.locationName = { $regex: escapeRegex(q.location), $options: 'i' };
  if (q.dateFrom || q.dateTo) {
    m.eventDate = {};
    if (q.dateFrom) m.eventDate.$gte = q.dateFrom;
    if (q.dateTo) m.eventDate.$lte = new Date(new Date(q.dateTo).getTime() + 864e5 - 1);
  }
  if (q.department) {
    const ids = await User.find({ department: q.department }).distinct('_id');
    m.reportedBy = { $in: ids };
  }
  return m;
}

const countBy = (match: object, field: string) => Item.aggregate([{ $match: match }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }, { $sort: { count: -1 } }]);

async function timeline(match: object, unit: 'day' | 'week', dateField = 'eventDate') {
  return Item.aggregate([
    { $match: { ...match, [dateField]: { ...((match as any)[dateField] ?? {}), $ne: null } } },
    { $group: { _id: { $dateTrunc: { date: `$${dateField}`, unit, startOfWeek: 'monday' } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
}

/** Weekly counts for the last 8 weeks (oldest → newest) — KPI sparklines. */
async function sparkline(match: object, dateField = 'createdAt') {
  const now = Date.now();
  const week = 7 * 864e5;
  const rows = await Item.find({ ...match, [dateField]: { $gte: new Date(now - 8 * week) } }).select(dateField).lean();
  const out = new Array(8).fill(0);
  for (const r of rows as any[]) {
    const idx = 7 - Math.floor((now - new Date(r[dateField]).getTime()) / week);
    if (idx >= 0 && idx < 8) out[idx]++;
  }
  return out;
}

function mergeTimelines(a: any[], b: any[], ka: string, kb: string) {
  const map = new Map<string, any>();
  for (const r of a) map.set(new Date(r._id).toISOString(), { period: new Date(r._id).toISOString(), [ka]: r.count, [kb]: 0 });
  for (const r of b) {
    const k = new Date(r._id).toISOString();
    map.set(k, { period: k, [ka]: map.get(k)?.[ka] ?? 0, [kb]: r.count });
  }
  return [...map.values()].sort((x, y) => x.period.localeCompare(y.period));
}

async function activity(filter: object, limit: number) {
  const rows = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit).populate('actorId', 'fullName role').lean();
  return rows.map((r: any) => ({ id: String(r._id), action: r.action, entityType: r.entityType, entityId: r.entityId ? String(r.entityId) : null, metadata: r.metadata ?? {}, actor: r.actorId ? { id: String(r.actorId._id), fullName: r.actorId.fullName, role: r.actorId.role } : null, createdAt: r.createdAt }));
}

const ITEM_POP = 'fullName email studentId department';

export async function stats(req: Request, res: Response) {
  const q = req.query as unknown as Q;
  const user = req.user!;
  if (isStaffRole(user.role)) return res.json(await adminStats(req, q));
  return res.json(await studentStats(req, q));
}

async function adminStats(req: Request, q: Q) {
  const match = await itemMatch(q);
  const [byType, byStatus, byCatType, byLocation, reportsTl, returnsTl, pendingClaims, foundTotal, foundClaimed] = await Promise.all([
    countBy(match, 'reportType'),
    countBy(match, 'status'),
    Item.aggregate([{ $match: match }, { $group: { _id: { c: '$category', t: '$reportType' }, count: { $sum: 1 } } }]),
    countBy(match, 'locationName'),
    timeline(match, q.granularity),
    timeline({ ...match, returnedAt: { $ne: null } }, q.granularity, 'returnedAt'),
    Claim.countDocuments({ status: 'pending' }),
    Item.countDocuments({ ...match, reportType: 'found' }),
    Claim.distinct('foundItemId').then(async (ids) => Item.countDocuments({ ...match, reportType: 'found', _id: { $in: ids } })),
  ]);
  const n = (arr: any[], k: string) => arr.find((r) => r._id === k)?.count ?? 0;
  const [lostSpark, foundSpark, returnedSpark] = await Promise.all([
    sparkline({ ...match, reportType: 'lost' }),
    sparkline({ ...match, reportType: 'found' }),
    sparkline({ ...match, returnedAt: { $ne: null } }, 'returnedAt'),
  ]);

  const [queue, recentReturned, newest, audit] = await Promise.all([
    Claim.find({ status: 'pending' }).sort({ createdAt: 1 }).limit(6).populate('foundItemId', 'code title category status locationName eventDate reportType imageFileIds').populate('claimantId', ITEM_POP).lean(),
    Item.find({ ...match, status: 'returned' }).sort({ returnedAt: -1 }).limit(6).populate('reportedBy', ITEM_POP).lean(),
    Item.find(match).sort({ createdAt: -1 }).limit(6).populate('reportedBy', ITEM_POP).lean(),
    activity({}, 10),
  ]);
  const [usage, usersActive, usersTotal, fileCount] = await Promise.all([
    storage().usage().catch(() => ({ objects: -1, bytes: -1 })),
    User.countDocuments({ status: 'active' }),
    User.countDocuments({}),
    FileObject.countDocuments({}),
  ]);
  const matched = n(byStatus, 'matched');
  const returned = n(byStatus, 'returned');
  const [foundMatched, foundReturned] = await Promise.all([
    Item.countDocuments({ ...match, reportType: 'found', status: { $in: ['matched', 'returned'] } }),
    Item.countDocuments({ ...match, reportType: 'found', status: 'returned' }),
  ]);

  return {
    role: 'admin',
    kpis: {
      totalLost: { value: n(byType, 'lost'), trend: lostSpark },
      totalFound: { value: n(byType, 'found'), trend: foundSpark },
      openItems: { value: n(byStatus, 'open') },
      pendingClaims: { value: pendingClaims },
      matchedItems: { value: matched },
      returnedItems: { value: returned, trend: returnedSpark },
      recoveryRate: { value: foundTotal ? Math.round((foundReturned / foundTotal) * 100) : 0 },
    },
    charts: {
      lostVsFoundByCategory: CATEGORIES.map((c) => ({
        category: c,
        lost: byCatType.find((r) => r._id.c === c && r._id.t === 'lost')?.count ?? 0,
        found: byCatType.find((r) => r._id.c === c && r._id.t === 'found')?.count ?? 0,
      })),
      reportsAndReturns: mergeTimelines(reportsTl, returnsTl, 'reports', 'returns'),
      byStatus: byStatus.map((r) => ({ status: r._id, count: r.count })),
      byLocation: byLocation.slice(0, 8).map((r) => ({ location: r._id, count: r.count })),
      funnel: [
        { stage: 'Found reports', count: foundTotal },
        { stage: 'Claimed', count: foundClaimed },
        { stage: 'Matched', count: foundMatched },
        { stage: 'Returned', count: foundReturned },
      ],
    },
    tables: {
      pendingQueue: queue.map((c) => serializeClaim(c, req.user!)),
      recentlyReturned: recentReturned.map((i) => serializeItem(i, req.user!, { withImages: 'none' })),
      newestReports: newest.map((i) => serializeItem(i, req.user!)),
      activity: audit,
    },
    health: {
      db: dbState(),
      storage: { driver: storage().driver, ...usage, files: fileCount },
      externalApi: { name: 'OpenStreetMap Nominatim', ...geoStats },
      users: { active: usersActive, total: usersTotal },
      uptimeSeconds: Math.round(process.uptime()),
    },
  };
}

async function studentStats(req: Request, q: Q) {
  const me = new Types.ObjectId(req.user!.id);
  const campus = await itemMatch(q);
  const mine = await itemMatch(q, { reportedBy: me });
  const [myByType, myTl, openByCategory, campusByLocation, pendingClaims, returnedClaims, myReturnedItems, campusOpen] = await Promise.all([
    countBy(mine, 'reportType'),
    timeline(mine, q.granularity, 'eventDate'),
    countBy({ ...campus, status: 'open' }, 'category'),
    countBy(campus, 'locationName'),
    Claim.countDocuments({ claimantId: me, status: 'pending' }),
    Claim.countDocuments({ claimantId: me, status: 'returned' }),
    Item.countDocuments({ ...mine, status: 'returned' }),
    Item.countDocuments({ ...campus, status: { $in: ['open', 'claim_pending'] } }),
  ]);
  const n = (arr: any[], k: string) => arr.find((r) => r._id === k)?.count ?? 0;
  const [myRecent, myClaims, campusRecent, myActivity, openSpark] = await Promise.all([
    Item.find(mine).sort({ createdAt: -1 }).limit(5).populate('reportedBy', ITEM_POP).lean(),
    Claim.find({ claimantId: me }).sort({ createdAt: -1 }).limit(5).populate('foundItemId', 'code title category status locationName eventDate reportType imageFileIds').lean(),
    Item.find({ ...campus, status: { $in: ['open', 'claim_pending'] } }).sort({ createdAt: -1 }).limit(6).populate('reportedBy', ITEM_POP).lean(),
    activity({ actorId: me }, 8),
    sparkline({ ...campus, reportType: 'found' }),
  ]);
  return {
    role: 'student',
    kpis: {
      myLostReports: { value: n(myByType, 'lost') },
      myFoundReports: { value: n(myByType, 'found') },
      myPendingClaims: { value: pendingClaims },
      myReturnedItems: { value: myReturnedItems + returnedClaims },
      campusOpenItems: { value: campusOpen, trend: openSpark },
    },
    charts: {
      myReportsByType: [{ type: 'lost', count: n(myByType, 'lost') }, { type: 'found', count: n(myByType, 'found') }],
      campusOpenByCategory: CATEGORIES.map((c) => ({ category: c, count: n(openByCategory, c) })),
      myReportsTimeline: myTl.map((r) => ({ period: new Date(r._id).toISOString(), count: r.count })),
      campusByLocation: campusByLocation.slice(0, 8).map((r) => ({ location: r._id, count: r.count })),
    },
    tables: {
      myRecentReports: myRecent.map((i) => serializeItem(i, req.user!)),
      myClaims: myClaims.map((c) => serializeClaim(c, req.user!)),
      campusRecent: campusRecent.map((i) => serializeItem(i, req.user!)),
      activity: myActivity,
    },
  };
}
