import { Request, Response } from 'express';
import { AuditLog } from '../models/AuditLog';
import { paginate } from '../utils/pagination';
import { landmarks, reverseGeocode, searchPlaces } from '../services/geo.service';
import { env } from '../config/env';
import { CAMPUS_CENTER } from '../config/campus';
import { CATEGORIES } from '../models/Item';

export async function geoSearch(req: Request, res: Response) {
  res.json(await searchPlaces(String((req.query as any).q)));
}
export async function geoReverse(req: Request, res: Response) {
  const { lat, lng } = req.query as any;
  res.json(await reverseGeocode(lat, lng));
}
export function geoConfig(_req: Request, res: Response) {
  res.json({ university: env.UNIVERSITY_NAME, center: CAMPUS_CENTER, bounds: env.campusBounds, landmarks: landmarks() });
}
export function publicConfig(_req: Request, res: Response) {
  res.json({ university: env.UNIVERSITY_NAME, emailDomains: env.emailDomains, categories: CATEGORIES, campus: { center: CAMPUS_CENTER, bounds: env.campusBounds } });
}

export async function auditLogs(req: Request, res: Response) {
  const q = req.query as any;
  const filter: Record<string, any> = {};
  if (q.action) filter.action = { $regex: `^${q.action.replace(/[^a-z_.]/gi, '')}`, $options: 'i' };
  if (q.entityType) filter.entityType = q.entityType;
  if (q.actorId) filter.actorId = q.actorId;
  if (q.dateFrom || q.dateTo) {
    filter.createdAt = {};
    if (q.dateFrom) filter.createdAt.$gte = q.dateFrom;
    if (q.dateTo) filter.createdAt.$lte = new Date(new Date(q.dateTo).getTime() + 864e5 - 1);
  }
  const [rows, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).populate('actorId', 'fullName email role').lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json(
    paginate(
      rows.map((r: any) => ({ id: String(r._id), action: r.action, entityType: r.entityType, entityId: r.entityId ? String(r.entityId) : null, metadata: r.metadata ?? {}, ip: r.ip, actor: r.actorId ? { id: String(r.actorId._id), fullName: r.actorId.fullName, email: r.actorId.email, role: r.actorId.role } : null, createdAt: r.createdAt })),
      total, q.page, q.limit,
    ),
  );
}
