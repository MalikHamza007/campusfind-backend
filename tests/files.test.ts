import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app, auth, clearDb, JPG, makeUser, PDF, PNG, startDb, stopDb, upload, validItem } from './helpers';
import { FileObject } from '../src/models/FileObject';
import { env } from '../src/config/env';
import { setStorage, storage } from '../src/services/storage';
import { LocalBucketProvider } from '../src/services/storage/local.provider';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const bucketPath = (rel: string) => path.join(path.resolve(env.STORAGE_ROOT), rel);

describe('private bucket uploads', () => {
  it('stores the object under a random key outside any web root and never exposes the path', async () => {
    const s = await makeUser();
    const res = await upload(s.token, 'item_image');
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toMatch(/relativePath|storedName|files\/\d{4}/);
    const doc = await FileObject.findById(res.body.file.id).lean();
    expect(doc!.relativePath).toMatch(/^files\/\d{4}\/\d{2}\/[0-9a-f-]{36}$/);
    expect(fs.existsSync(bucketPath(doc!.relativePath))).toBe(true);
    expect(doc!.sha256).toHaveLength(64);
  });
  it('requires a session (401 without token)', async () => {
    const res = await request(app).post('/api/files').field('purpose', 'item_image').attach('file', PNG, 'a.png');
    expect(res.status).toBe(401);
  });
  it('rejects wrong magic bytes, renamed executables, SVG and double extensions (415)', async () => {
    const s = await makeUser();
    expect((await upload(s.token, 'item_image', Buffer.from('MZ\x90\x00 fake exe'), 'calc.png')).status).toBe(415);
    expect((await upload(s.token, 'item_image', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.svg')).status).toBe(415);
    expect((await upload(s.token, 'item_image', PNG, 'shell.php.png')).status).toBe(415);
    expect((await upload(s.token, 'item_image', PNG, 'photo.jpg')).status).toBe(415); // extension/content mismatch
    expect((await upload(s.token, 'item_image', PDF, 'receipt.pdf')).status).toBe(415); // PDF not allowed for images
    expect((await upload(s.token, 'claim_evidence', PDF, 'receipt.pdf')).status).toBe(201);
  });
  it('enforces per-purpose size limits (413)', async () => {
    const s = await makeUser();
    const big = Buffer.concat([JPG, Buffer.alloc(2.5 * 1024 * 1024)]);
    expect((await upload(s.token, 'avatar', big, 'me.jpg')).status).toBe(413);
    expect((await upload(s.token, 'item_image', big, 'item.jpg')).status).toBe(201);
    const huge = Buffer.concat([JPG, Buffer.alloc(9 * 1024 * 1024)]);
    expect((await upload(s.token, 'claim_evidence', huge, 'x.jpg')).status).toBe(413);
  });
  it('sanitizes path-traversal names', async () => {
    const s = await makeUser();
    const res = await upload(s.token, 'item_image', PNG, '../../etc/passwd.png');
    expect(res.status).toBe(201);
    expect(res.body.file.originalName).toBe('passwd.png');
  });
  it('rate-limits rapid uploads per user (11th → 429)', async () => {
    process.env.ENABLE_UPLOAD_LIMIT_IN_TESTS = 'true';
    try {
      const s = await makeUser();
      const codes: number[] = [];
      for (let i = 0; i < 11; i++) codes.push((await upload(s.token, 'item_image')).status);
      expect(codes.slice(0, 10).every((c) => c === 201)).toBe(true);
      expect(codes[10]).toBe(429);
    } finally {
      delete process.env.ENABLE_UPLOAD_LIMIT_IN_TESTS;
    }
  });
});

describe('60-second signed links', () => {
  it('streams with safe headers, then expires after 60s (fake clock)', async () => {
    const s = await makeUser();
    const file = (await upload(s.token, 'item_image')).body.file;
    const ok = await request(app).get(file.url);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toBe('image/png');
    expect(ok.headers['x-content-type-options']).toBe('nosniff');
    expect(ok.headers['cache-control']).toContain('no-store');
    expect(ok.headers['content-disposition']).toMatch(/^inline/);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 61_000);
    const expired = await request(app).get(file.url);
    expect(expired.status).toBe(410);
    expect(expired.body.error.code).toBe('LINK_EXPIRED');
  });
  it('rejects tampered or missing tokens and tokens for another file', async () => {
    const s = await makeUser();
    const a = (await upload(s.token, 'item_image')).body.file;
    const b = (await upload(s.token, 'item_image')).body.file;
    expect((await request(app).get(`/api/files/${a.id}/content`)).status).toBe(401);
    expect((await request(app).get(a.url.replace(/token=./, 'token=X'))).status).toBe(403);
    const tokenA = new URL('http://x' + a.url).searchParams.get('token');
    expect((await request(app).get(`/api/files/${b.id}/content?token=${encodeURIComponent(tokenA!)}`)).status).toBe(403);
  });
  it('claim evidence is private to claimant + admins', async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const admin = await makeUser('admin');
    const f = (await upload(owner.token, 'claim_evidence', PDF, 'receipt.pdf')).body.file;
    expect((await request(app).post(`/api/files/${f.id}/signed-url`).set(auth(other.token))).status).toBe(404);
    expect((await request(app).post(`/api/files/${f.id}/signed-url`).set(auth(admin.token))).status).toBe(200);
  });
  it('item images become visible to all students once attached to a report', async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const f = (await upload(owner.token, 'item_image')).body.file;
    expect((await request(app).post(`/api/files/${f.id}/signed-url`).set(auth(other.token))).status).toBe(404);
    await request(app).post('/api/items').set(auth(owner.token)).send(validItem({ imageFileIds: [f.id] }));
    const link = await request(app).post(`/api/files/${f.id}/signed-url`).set(auth(other.token));
    expect(link.status).toBe(200);
    expect((await request(app).get(link.body.url)).status).toBe(200);
  });
});

describe('delete + failure cleanup', () => {
  it('blocks deleting a referenced file, deletes row + object when unused', async () => {
    const s = await makeUser();
    const other = await makeUser();
    const used = (await upload(s.token, 'item_image')).body.file;
    await request(app).post('/api/items').set(auth(s.token)).send(validItem({ imageFileIds: [used.id] }));
    expect((await request(app).delete(`/api/files/${used.id}`).set(auth(s.token))).body.error.code).toBe('FILE_IN_USE');
    const free = (await upload(s.token, 'item_image')).body.file;
    const key = (await FileObject.findById(free.id).lean())!.relativePath;
    expect((await request(app).delete(`/api/files/${free.id}`).set(auth(other.token))).status).toBe(403);
    expect((await request(app).delete(`/api/files/${free.id}`).set(auth(s.token))).status).toBe(200);
    expect(await FileObject.findById(free.id)).toBeNull();
    expect(fs.existsSync(bucketPath(key))).toBe(false);
  });
  it('removes the object if the metadata insert fails (no orphans)', async () => {
    const s = await makeUser();
    const before = await storage().usage();
    vi.spyOn(FileObject, 'create').mockRejectedValueOnce(new Error('db down'));
    const res = await upload(s.token, 'item_image');
    expect(res.status).toBe(500);
    expect((await storage().usage()).objects).toBe(before.objects);
    expect(await FileObject.countDocuments()).toBe(0);
  });
  it('writes nothing (no row, no .part) if the object write fails', async () => {
    const s = await makeUser();
    const real = storage();
    setStorage({ ...real, driver: 'local', init: real.init.bind(real), get: real.get.bind(real), stat: real.stat.bind(real), delete: real.delete.bind(real), usage: real.usage.bind(real), put: async () => { throw new Error('disk full'); } });
    try {
      expect((await upload(s.token, 'item_image')).status).toBe(500);
      expect(await FileObject.countDocuments()).toBe(0);
    } finally {
      setStorage(real);
    }
  });
  it('sweeps stale .part files on startup', async () => {
    const p = new LocalBucketProvider(env.STORAGE_ROOT);
    const dir = bucketPath('files/2026/01');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'abc.part'), 'half');
    expect(await p.sweepPartials()).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(path.join(dir, 'abc.part'))).toBe(false);
  });
  it('refuses keys that escape the bucket', async () => {
    const p = new LocalBucketProvider(env.STORAGE_ROOT);
    await expect(p.put('../outside', Buffer.from('x'))).rejects.toThrow();
  });
});
