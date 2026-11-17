import crypto from 'node:crypto';
import path from 'node:path';
import { ClientSession, Types } from 'mongoose';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { FileObject, FilePurpose } from '../models/FileObject';
import { Item } from '../models/Item';
import { Claim } from '../models/Claim';
import { User } from '../models/User';
import { storage } from './storage';
import { AuthUser } from '../middlewares/auth';

export const MB = 1024 * 1024;

export const PURPOSE_RULES: Record<FilePurpose, { mimes: string[]; maxBytes: number; label: string }> = {
  item_image: { mimes: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 5 * MB, label: 'Item images' },
  claim_evidence: { mimes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], maxBytes: 8 * MB, label: 'Claim evidence' },
  avatar: { mimes: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 2 * MB, label: 'Avatars' },
};
export const MAX_UPLOAD_BYTES = 8 * MB;

const EXT_FOR_MIME: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
};
const DANGEROUS_EXT = /^(exe|dll|bat|cmd|com|msi|sh|bash|ps1|js|mjs|cjs|php|phtml|py|pl|rb|jar|html?|xhtml|svg|svgz|xml|hta|scr|vbs|asp|aspx|jsp|cgi)$/i;

/** Detect the real type from magic bytes — the client-supplied Content-Type is ignored. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

/** Strip any path, control characters and unsafe characters; keep a readable, bounded name. */
export function sanitizeFileName(name: string): string {
  const base = path.basename(String(name ?? '').replace(/\\/g, '/'));
  const cleaned = base
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^\w.\- ()]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(-120);
  return cleaned || 'file';
}

export function validateUpload(originalName: string, buf: Buffer, purpose: FilePurpose): { mime: string; name: string } {
  const rules = PURPOSE_RULES[purpose];
  const name = sanitizeFileName(originalName);
  const parts = name.toLowerCase().split('.');
  if (parts.length < 2) throw new AppError(415, 'UNSUPPORTED_FILE', 'File must have an extension');
  const ext = parts[parts.length - 1];
  if (parts.slice(1, -1).some((p) => DANGEROUS_EXT.test(p)) || DANGEROUS_EXT.test(ext)) {
    throw new AppError(415, 'UNSUPPORTED_FILE', 'Executable, script, SVG/HTML and double-extension files are not allowed');
  }
  const mime = sniffMime(buf);
  if (!mime || !rules.mimes.includes(mime)) {
    throw new AppError(415, 'UNSUPPORTED_FILE', `${rules.label} must be ${rules.mimes.map((m) => m.split('/')[1].toUpperCase()).join(', ')}`);
  }
  if (!EXT_FOR_MIME[mime].includes(ext)) throw new AppError(415, 'UNSUPPORTED_FILE', 'File extension does not match its content');
  if (buf.length > rules.maxBytes) throw new AppError(413, 'FILE_TOO_LARGE', `${rules.label} must be ${rules.maxBytes / MB} MB or smaller`);
  if (buf.length === 0) throw new AppError(422, 'EMPTY_FILE', 'File is empty');
  return { mime, name };
}

/**
 * Upload pipeline: validate → put object (atomic .part + rename) → insert metadata.
 * If the DB insert fails the object is removed, so a failed upload never leaves an orphan behind.
 */
export async function storeUpload(user: AuthUser, originalName: string, buf: Buffer, purpose: FilePurpose) {
  const { mime, name } = validateUpload(originalName, buf, purpose);
  const now = new Date();
  const storedName = crypto.randomUUID();
  const key = `files/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${storedName}`;
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

  await storage().put(key, buf, mime);
  try {
    return await FileObject.create({
      originalName: name,
      storedName,
      relativePath: key,
      mimeType: mime,
      size: buf.length,
      sha256,
      purpose,
      uploadedBy: user.id,
    });
  } catch (err) {
    await storage().delete(key).catch(() => undefined);
    throw err;
  }
}

// ---------- 60-second signed links ----------
interface LinkPayload { f: string; u: string; exp: number }

export function signFileToken(fileId: string, userId: string, ttlSeconds = env.FILE_LINK_TTL_SECONDS) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = Buffer.from(JSON.stringify({ f: fileId, u: userId, exp } satisfies LinkPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', env.FILE_LINK_SECRET).update(body).digest('base64url');
  return { token: `${body}.${sig}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function verifyFileToken(token: string, fileId: string): LinkPayload {
  const [body, sig] = String(token).split('.');
  if (!body || !sig) throw new AppError(403, 'LINK_INVALID', 'Invalid file link');
  const expected = crypto.createHmac('sha256', env.FILE_LINK_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new AppError(403, 'LINK_INVALID', 'Invalid file link');
  let payload: LinkPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new AppError(403, 'LINK_INVALID', 'Invalid file link');
  }
  if (payload.f !== fileId) throw new AppError(403, 'LINK_INVALID', 'Link does not match this file');
  if (payload.exp * 1000 < Date.now()) throw new AppError(410, 'LINK_EXPIRED', 'This file link has expired — request a new one');
  return payload;
}

export function contentPath(fileId: string, userId: string) {
  const { token, expiresAt } = signFileToken(fileId, userId);
  return { url: `/api/files/${fileId}/content?token=${encodeURIComponent(token)}`, expiresAt };
}

// ---------- access policy ----------
export async function canReadFile(file: any, user: { id: string; role: string }): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (String(file.uploadedBy?._id ?? file.uploadedBy) === user.id) return true;
  if (file.purpose === 'item_image') {
    // Item images are visible to any signed-in user once attached to a live report.
    return !!(await Item.exists({ imageFileIds: file._id, deletedAt: null }));
  }
  if (file.purpose === 'claim_evidence') {
    return !!(await Claim.exists({ evidenceFileIds: file._id, claimantId: user.id }));
  }
  if (file.purpose === 'avatar') {
    return !!(await User.exists({ _id: user.id, avatarFileId: file._id }));
  }
  return false;
}

export async function fileReferences(fileId: Types.ObjectId | string) {
  const [items, claims, users] = await Promise.all([
    Item.countDocuments({ imageFileIds: fileId }),
    Claim.countDocuments({ evidenceFileIds: fileId }),
    User.countDocuments({ avatarFileId: fileId }),
  ]);
  return { items, claims, users, total: items + claims + users };
}

/** Retry-safe delete: tombstone → delete object → delete row. A crash at any step can be re-run. */
export async function deleteFile(file: any) {
  const refs = await fileReferences(file._id);
  if (refs.total > 0) throw AppError.conflict('File is attached to a report, claim or profile and cannot be deleted', 'FILE_IN_USE');
  await FileObject.updateOne({ _id: file._id }, { $set: { deletingAt: new Date() } });
  await storage().delete(file.relativePath);
  await FileObject.deleteOne({ _id: file._id });
}

/**
 * Validate file ids before attaching them to an entity: they must exist, belong to `ownerId`
 * (admins may attach any), match the purpose, and not already be attached somewhere else.
 */
export async function assertAttachable(
  ids: string[],
  purpose: FilePurpose,
  ownerId: string,
  actor: AuthUser,
  opts: { exceptItemId?: string; exceptClaimId?: string; session?: ClientSession } = {},
) {
  if (!ids.length) return;
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) throw AppError.validation('Duplicate file ids');
  const files = await FileObject.find({ _id: { $in: unique }, deletingAt: null }).session(opts.session ?? null).lean();
  if (files.length !== unique.length) throw AppError.validation('One or more files do not exist');
  for (const f of files) {
    if (f.purpose !== purpose) throw AppError.validation(`File ${f.originalName} was uploaded for a different purpose`);
    if (actor.role !== 'admin' && String(f.uploadedBy) !== ownerId) throw AppError.forbidden('You can only attach files you uploaded');
  }
  if (purpose === 'item_image') {
    const used = await Item.exists({ imageFileIds: { $in: unique }, ...(opts.exceptItemId ? { _id: { $ne: opts.exceptItemId } } : {}) }).session(opts.session ?? null);
    if (used) throw AppError.conflict('An image is already attached to another report', 'FILE_IN_USE');
  }
  if (purpose === 'claim_evidence') {
    const used = await Claim.exists({ evidenceFileIds: { $in: unique }, ...(opts.exceptClaimId ? { _id: { $ne: opts.exceptClaimId } } : {}) }).session(opts.session ?? null);
    if (used) throw AppError.conflict('An evidence file is already attached to another claim', 'FILE_IN_USE');
  }
}
