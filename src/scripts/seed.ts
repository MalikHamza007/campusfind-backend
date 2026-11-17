/**
 * Loads realistic CampusFind data: 15 users (1 super admin, 2 staff, 12 students), 40 items, 14 claims, 36 files, 55 audit entries.
 * Wipes existing CampusFind collections first (refused in production unless SEED_ALLOW_RESET=true).
 * Requires ADMIN_EMAIL, ADMIN_PASSWORD and SEED_STUDENT_PASSWORD; SEED_STAFF_PASSWORD (falls back to the student one).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose, { Types } from 'mongoose';
import { env } from '../config/env';
import { connectDb, disconnectDb } from '../config/db';
import { storage } from '../services/storage';
import { User } from '../models/User';
import { Item } from '../models/Item';
import { Claim } from '../models/Claim';
import { FileObject } from '../models/FileObject';
import { AuditLog } from '../models/AuditLog';
import { RefreshToken } from '../models/RefreshToken';
import { Counter } from '../models/Counter';
import { SUPER_ADMIN, STAFF, CLAIMS, FOUND, LOCATIONS, LOST, STUDENTS, SeedItem } from './seed-data';

const ASSETS = path.resolve(__dirname, '../../seed-assets');
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };

/** Insert raw documents (validated by Mongoose first) so historical timestamps are preserved. */
async function insertRaw(model: mongoose.Model<any>, docs: Record<string, unknown>[]) {
  const prepared = [];
  for (const d of docs) {
    const doc = new model(d);
    await doc.validate();
    prepared.push({ ...doc.toObject({ depopulate: true }), createdAt: d.createdAt, updatedAt: d.updatedAt ?? d.createdAt });
  }
  if (prepared.length) await model.collection.insertMany(prepared);
}

export async function runSeed({ connect = true } = {}) {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD || !env.SEED_STUDENT_PASSWORD) {
    throw new Error('Set ADMIN_EMAIL, ADMIN_PASSWORD and SEED_STUDENT_PASSWORD before seeding');
  }
  if (env.isProd && !env.SEED_ALLOW_RESET) throw new Error('Refusing to wipe a production database. Set SEED_ALLOW_RESET=true to confirm.');
  if (connect) await connectDb();
  await storage().init();
  const now = Date.now();
  const clamp = (t: number) => Math.min(t, now - 15 * 60_000);

  // ---- reset ----
  const oldFiles = await FileObject.find().select('relativePath').lean();
  for (const f of oldFiles) await storage().delete(f.relativePath).catch(() => undefined);
  const bucket = storage() as { clear?: () => Promise<void> };
  if (bucket.clear) await bucket.clear(); // also drops objects orphaned by earlier in-memory runs
  for (const m of [User, Item, Claim, FileObject, RefreshToken, Counter]) await m.collection.deleteMany({});
  await AuditLog.collection.deleteMany({}); // raw driver call; the model itself is append-only

  // ---- users ----
  const [adminHash, studentHash, staffHash] = await Promise.all([
    bcrypt.hash(env.ADMIN_PASSWORD, env.BCRYPT_ROUNDS),
    bcrypt.hash(env.SEED_STUDENT_PASSWORD, env.BCRYPT_ROUNDS),
    bcrypt.hash(env.SEED_STAFF_PASSWORD || env.SEED_STUDENT_PASSWORD, env.BCRYPT_ROUNDS),
  ]);
  const superId = new Types.ObjectId();
  const staffIds = STAFF.map(() => new Types.ObjectId());
  const reviewer = (i: number) => staffIds[i % staffIds.length];
  const studentIds = STUDENTS.map(() => new Types.ObjectId());
  const t0 = new Date('2026-08-25T09:00:00Z').getTime();
  await insertRaw(User, [
    { _id: superId, ...SUPER_ADMIN, email: env.ADMIN_EMAIL.toLowerCase(), passwordHash: adminHash, role: 'super_admin', status: 'active', createdAt: new Date(t0 - 45 * DAY) },
    ...STAFF.map((s, i) => ({ _id: staffIds[i], ...s, passwordHash: staffHash, role: 'admin', status: 'active', createdAt: new Date(t0 - (30 - i * 5) * DAY) })),
    ...STUDENTS.map((s, i) => ({ _id: studentIds[i], ...s, passwordHash: studentHash, role: 'student', status: i === 10 ? 'active' : 'active', createdAt: new Date(t0 + i * DAY) })),
  ]);

  // ---- files (objects written to the private bucket first, metadata second) ----
  const manifest = JSON.parse(fs.readFileSync(path.join(ASSETS, 'manifest.json'), 'utf8'));
  const fileDocs: Record<string, unknown>[] = [];
  async function addFile(name: string, purpose: string, owner: Types.ObjectId, at: number) {
    const buf = fs.readFileSync(path.join(ASSETS, name));
    const ext = name.split('.').pop()!;
    const d = new Date(at);
    const storedName = crypto.randomUUID();
    const key = `files/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${storedName}`;
    await storage().put(key, buf, MIME[ext]);
    const _id = new Types.ObjectId();
    const pretty = name.replace(/^item-[a-z0-9]+-/, 'photo-').replace(/^evidence-\d-/, '');
    fileDocs.push({ _id, originalName: pretty, storedName, relativePath: key, mimeType: MIME[ext], size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), purpose, uploadedBy: owner, createdAt: d });
    return _id;
  }

  // ---- items ----
  const all: SeedItem[] = [...FOUND, ...LOST];
  const itemIds: Record<string, Types.ObjectId> = {};
  const itemCreated: Record<string, number> = {};
  const itemDocs: Record<string, unknown>[] = [];
  let lostSeq = 1001;
  let foundSeq = 2001;
  const ordered = [...all].sort((a, b) => a.date.localeCompare(b.date));
  for (const it of ordered) {
    const id = new Types.ObjectId();
    itemIds[it.key] = id;
    const eventAt = new Date(`${it.date}T${String(8 + (it.title.length % 9)).padStart(2, '0')}:${String((it.description.length * 7) % 60).padStart(2, '0')}:00Z`).getTime();
    const createdAt = clamp(eventAt + (2 + (it.title.length % 5)) * HOUR);
    itemCreated[it.key] = createdAt;
    const reporter = studentIds[it.reporter];
    const images: Types.ObjectId[] = [];
    for (const name of manifest.items[it.key] ?? []) images.push(await addFile(name, 'item_image', reporter, createdAt - 10 * 60_000));
    const loc = LOCATIONS[it.location];
    const jitter = (n: number) => Number((n + ((it.title.length % 7) - 3) * 0.00008).toFixed(6));
    const coords = { lat: jitter(loc.lat), lng: jitter(loc.lng) };
    itemDocs.push({
      _id: id,
      code: it.type === 'lost' ? `CF-L-${lostSeq++}` : `CF-F-${foundSeq++}`,
      reportType: it.type,
      title: it.title,
      category: it.category,
      description: it.description,
      eventDate: new Date(eventAt),
      locationName: it.location,
      coordinates: coords,
      geo: { type: 'Point', coordinates: [coords.lng, coords.lat] },
      status: it.status,
      distinctiveFeatures: it.features,
      color: it.color,
      brand: it.brand,
      imageFileIds: images,
      reportedBy: reporter,
      deletedAt: null,
      createdAt: new Date(createdAt),
    });
  }

  // ---- claims ----
  const claimDocs: Record<string, unknown>[] = [];
  const logs: Record<string, unknown>[] = [];
  const log = (actor: Types.ObjectId, action: string, entityType: string, entityId: Types.ObjectId, at: number, metadata: Record<string, unknown> = {}) =>
    logs.push({ actorId: actor, action, entityType, entityId, metadata, ip: '10.20.4.' + ((at / 1000) % 200 | 0), createdAt: new Date(at) });
  const codeOf = (key: string) => (itemDocs.find((d) => d._id === itemIds[key]) as any).code;

  let evidenceIdx = 0;
  let claimNo = 0;
  for (const c of CLAIMS) {
    const staff = reviewer(claimNo++);
    const id = new Types.ObjectId();
    const createdAt = clamp(itemCreated[c.found] + c.daysAfter * DAY);
    const claimant = studentIds[c.claimant];
    const evidence: Types.ObjectId[] = [];
    for (let i = 0; i < c.evidenceFiles; i++) evidence.push(await addFile(manifest.evidence[evidenceIdx++].file, 'claim_evidence', claimant, createdAt - 5 * 60_000));
    const reviewedAt = ['approved', 'rejected', 'returned'].includes(c.status) ? clamp(createdAt + DAY) : undefined;
    const returnedAt = c.status === 'returned' ? clamp(createdAt + 2 * DAY) : undefined;
    claimDocs.push({
      _id: id,
      foundItemId: itemIds[c.found],
      lostItemId: c.lost ? itemIds[c.lost] : undefined,
      claimantId: claimant,
      ownershipEvidence: c.evidence,
      evidenceFileIds: evidence,
      status: c.status,
      active: ['pending', 'approved'].includes(c.status),
      adminNote: c.adminNote,
      // Every reviewed claim had a handler; about half of the pending queue is already picked up.
      assignedTo: reviewedAt || (c.status === 'pending' && claimNo % 2 === 0) ? staff : undefined,
      assignedAt: reviewedAt || (c.status === 'pending' && claimNo % 2 === 0) ? new Date(clamp(createdAt + 3 * HOUR)) : undefined,
      reviewedBy: reviewedAt ? staff : undefined,
      reviewedAt: reviewedAt ? new Date(reviewedAt) : undefined,
      returnedAt: returnedAt ? new Date(returnedAt) : undefined,
      withdrawnAt: c.status === 'withdrawn' ? new Date(clamp(createdAt + 6 * HOUR)) : undefined,
      createdAt: new Date(createdAt),
      updatedAt: new Date(returnedAt ?? reviewedAt ?? createdAt),
    });
    log(claimant, 'claim.created', 'claim', id, createdAt, { foundItemId: String(itemIds[c.found]), code: codeOf(c.found) });
    if (reviewedAt && c.status !== 'rejected') log(staff, 'claim.approved', 'claim', id, reviewedAt, { code: codeOf(c.found) });
    if (c.status === 'rejected') log(staff, 'claim.rejected', 'claim', id, reviewedAt!, { reason: c.adminNote });
    if (returnedAt) {
      log(staff, 'claim.returned', 'claim', id, returnedAt, { code: codeOf(c.found) });
      for (const key of [c.found, c.lost].filter(Boolean) as string[]) {
        const d = itemDocs.find((x) => x._id === itemIds[key])!;
        d.returnedAt = new Date(returnedAt);
      }
    }
    if (c.status === 'withdrawn') log(claimant, 'claim.withdrawn', 'claim', id, clamp(createdAt + 6 * HOUR));
  }

  // 26 most recent item reports in the activity log (older ones pre-date audit retention for this term)
  const recent = [...ordered].sort((a, b) => itemCreated[b.key] - itemCreated[a.key]).slice(0, 26);
  for (const it of recent) log(studentIds[it.reporter], `item.${it.type}_reported`, 'item', itemIds[it.key], itemCreated[it.key], { code: codeOf(it.key), title: it.title, category: it.category });

  // avatars + profile activity
  const av1 = await addFile(manifest.avatars[0], 'avatar', studentIds[0], t0 + 3 * DAY);
  const av2 = await addFile(manifest.avatars[1], 'avatar', studentIds[1], t0 + 4 * DAY);
  await User.collection.updateOne({ _id: studentIds[0] }, { $set: { avatarFileId: av1 } });
  await User.collection.updateOne({ _id: studentIds[1] }, { $set: { avatarFileId: av2 } });
  log(studentIds[0], 'user.profile_updated', 'user', studentIds[0], t0 + 3 * DAY, { fields: ['avatarFileId'] });
  log(studentIds[1], 'user.profile_updated', 'user', studentIds[1], t0 + 4 * DAY, { fields: ['avatarFileId'] });
  log(studentIds[3], 'user.profile_updated', 'user', studentIds[3], t0 + 9 * DAY, { fields: ['phone'] });
  log(studentIds[7], 'user.profile_updated', 'user', studentIds[7], t0 + 12 * DAY, { fields: ['department', 'phone'] });

  await insertRaw(FileObject, fileDocs);
  await insertRaw(Item, itemDocs);
  await insertRaw(Claim, claimDocs);
  await AuditLog.collection.insertMany(logs);
  await Counter.collection.insertMany([{ _id: 'item:lost' as any, seq: lostSeq - 1 }, { _id: 'item:found' as any, seq: foundSeq - 1 }]);
  await mongoose.connection.syncIndexes();

  const counts = {
    users: await User.countDocuments(),
    items: await Item.countDocuments(),
    claims: await Claim.countDocuments(),
    files: await FileObject.countDocuments(),
    refreshTokens: await RefreshToken.countDocuments(),
    auditLogs: await AuditLog.countDocuments(),
  };
  console.log('[seed] done', counts);
  return counts;
}

if (require.main === module) {
  runSeed()
    .then(() => disconnectDb())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('[seed] failed:', err.message);
      await disconnectDb().catch(() => undefined);
      process.exit(1);
    });
}
