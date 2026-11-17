import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, clearDb, makeUser, startDb, stopDb, upload, validItem } from './helpers';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe('item reports CRUD', () => {
  it('creates a lost report with a CF-L code, status open', async () => {
    const s = await makeUser();
    const res = await request(app).post('/api/items').set(auth(s.token)).send(validItem());
    expect(res.status).toBe(201);
    expect(res.body.item).toMatchObject({ reportType: 'lost', status: 'open', isMine: true });
    expect(res.body.item.code).toMatch(/^CF-L-\d{4}$/);
  });
  it('validates date, campus bounds, found-item details and server-controlled fields', async () => {
    const s = await makeUser();
    const post = (b: object) => request(app).post('/api/items').set(auth(s.token)).send(b);
    expect((await post(validItem({ eventDate: new Date(Date.now() + 3 * 864e5).toISOString() }))).status).toBe(422);
    expect((await post(validItem({ eventDate: '2020-01-01' }))).status).toBe(422);
    expect((await post(validItem({ coordinates: { lat: 24.86, lng: 67.0 } }))).status).toBe(422);
    expect((await post(validItem({ reportType: 'found', color: undefined, brand: undefined }))).status).toBe(422);
    expect((await post(validItem({ status: 'returned' }))).status).toBe(422);
    expect((await post(validItem({ reportedBy: s.id }))).status).toBe(422);
    expect((await post(validItem({ description: 'short' }))).status).toBe(422);
  });
  it('lists with search, filters and pagination', async () => {
    const s = await makeUser();
    await request(app).post('/api/items').set(auth(s.token)).send(validItem());
    await request(app).post('/api/items').set(auth(s.token)).send(validItem({ title: 'Black Leather Wallet', category: 'wallet', locationName: 'Cafeteria', reportType: 'found' }));
    const all = await request(app).get('/api/items?limit=1').set(auth(s.token));
    expect(all.body).toMatchObject({ total: 2, totalPages: 2, limit: 1 });
    const q = await request(app).get('/api/items?q=wallet').set(auth(s.token));
    expect(q.body.data.map((i: any) => i.title)).toEqual(['Black Leather Wallet']);
    const f = await request(app).get('/api/items?type=lost&category=calculator&location=lab').set(auth(s.token));
    expect(f.body.total).toBe(1);
    expect((await request(app).get('/api/items?limit=500').set(auth(s.token))).status).toBe(422);
  });
  it('blocks other students from editing/deleting (ownership) but allows admins', async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const admin = await makeUser('admin');
    const item = (await request(app).post('/api/items').set(auth(owner.token)).send(validItem())).body.item;
    expect((await request(app).patch(`/api/items/${item.id}`).set(auth(other.token)).send({ title: 'Hijacked title', version: 0 })).status).toBe(403);
    expect((await request(app).delete(`/api/items/${item.id}`).set(auth(other.token))).status).toBe(403);
    const ok = await request(app).patch(`/api/items/${item.id}`).set(auth(admin.token)).send({ title: 'Casio calculator (grey)', version: 0 });
    expect(ok.status).toBe(200);
    expect(ok.body.item.version).toBe(1);
  });
  it('rejects stale versions and reportType edits', async () => {
    const s = await makeUser();
    const item = (await request(app).post('/api/items').set(auth(s.token)).send(validItem())).body.item;
    expect((await request(app).patch(`/api/items/${item.id}`).set(auth(s.token)).send({ title: 'First edit title', version: 0 })).status).toBe(200);
    const stale = await request(app).patch(`/api/items/${item.id}`).set(auth(s.token)).send({ title: 'Second edit title', version: 0 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('STALE_VERSION');
    expect((await request(app).patch(`/api/items/${item.id}`).set(auth(s.token)).send({ reportType: 'found', version: 1 })).status).toBe(422);
  });
  it('soft-deletes (hidden from students, visible to admin with includeDeleted)', async () => {
    const s = await makeUser();
    const admin = await makeUser('admin');
    const item = (await request(app).post('/api/items').set(auth(s.token)).send(validItem())).body.item;
    expect((await request(app).delete(`/api/items/${item.id}`).set(auth(s.token))).status).toBe(200);
    expect((await request(app).get(`/api/items/${item.id}`).set(auth(s.token))).status).toBe(404);
    const adm = await request(app).get('/api/items?includeDeleted=true').set(auth(admin.token));
    expect(adm.body.data[0].deletedAt).toBeTruthy();
  });
  it('masks ID numbers on ID-card reports for other students and hides reporter contact', async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const item = (
      await request(app).post('/api/items').set(auth(owner.token)).send(validItem({ reportType: 'found', category: 'id_card', title: 'University ID Card', description: 'ID card found with number 3520212345671 printed on the back side.' }))
    ).body.item;
    const seen = (await request(app).get(`/api/items/${item.id}`).set(auth(other.token))).body.item;
    expect(seen.description).not.toContain('3520212345671');
    expect(seen.description).toContain('671');
    expect(seen.reporter.email).toBeUndefined();
    const own = (await request(app).get(`/api/items/${item.id}`).set(auth(owner.token))).body.item;
    expect(own.description).toContain('3520212345671');
  });
  it('only attaches images the reporter uploaded for item_image', async () => {
    const s = await makeUser();
    const other = await makeUser();
    const theirs = (await upload(other.token, 'item_image')).body.file;
    const evidence = (await upload(s.token, 'claim_evidence')).body.file;
    expect((await request(app).post('/api/items').set(auth(s.token)).send(validItem({ imageFileIds: [theirs.id] }))).status).toBe(403);
    expect((await request(app).post('/api/items').set(auth(s.token)).send(validItem({ imageFileIds: [evidence.id] }))).status).toBe(422);
    const mine = (await upload(s.token, 'item_image')).body.file;
    const ok = await request(app).post('/api/items').set(auth(s.token)).send(validItem({ imageFileIds: [mine.id] }));
    expect(ok.status).toBe(201);
    expect(ok.body.item.images[0].url).toContain('/content?token=');
  });
});
