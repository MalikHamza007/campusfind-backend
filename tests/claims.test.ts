import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, clearDb, makeUser, startDb, stopDb, upload, validItem } from './helpers';
import { Item } from '../src/models/Item';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

const evidence = 'The calculator has my initials AR scratched on the back and a crack near the solar panel.';

async function scenario() {
  const finder = await makeUser();
  const owner = await makeUser();
  const admin = await makeUser('admin');
  const found = (await request(app).post('/api/items').set(auth(finder.token)).send(validItem({ reportType: 'found' }))).body.item;
  const lost = (await request(app).post('/api/items').set(auth(owner.token)).send(validItem())).body.item;
  return { finder, owner, admin, found, lost };
}

describe('claim workflow', () => {
  it('expected demo: lost calculator → found calculator → claim → approve → return', async () => {
    const { owner, admin, found, lost } = await scenario();
    const file = (await upload(owner.token, 'claim_evidence')).body.file;
    const c = await request(app).post('/api/claims').set(auth(owner.token)).send({ foundItemId: found.id, lostItemId: lost.id, ownershipEvidence: evidence, evidenceFileIds: [file.id] });
    expect(c.status).toBe(201);
    expect(c.body.claim.status).toBe('pending');
    expect((await Item.findById(found.id))!.status).toBe('claim_pending');

    const ap = await request(app).post(`/api/claims/${c.body.claim.id}/approve`).set(auth(admin.token)).send({ version: 0, adminNote: 'Initials verified' });
    expect(ap.status).toBe(200);
    expect(ap.body.claim.status).toBe('approved');
    expect((await Item.findById(found.id))!.status).toBe('matched');
    expect((await Item.findById(lost.id))!.status).toBe('matched');

    const ret = await request(app).post(`/api/claims/${c.body.claim.id}/return`).set(auth(admin.token)).send({ version: ap.body.claim.version });
    expect(ret.status).toBe(200);
    expect(ret.body.claim.status).toBe('returned');
    const f = await Item.findById(found.id);
    expect(f!.status).toBe('returned');
    expect(f!.returnedAt).toBeTruthy();
    expect((await Item.findById(lost.id))!.status).toBe('returned');
    // returned records are immutable
    expect((await request(app).patch(`/api/items/${found.id}`).set(auth(admin.token)).send({ title: 'Changed title', version: 5 })).status).toBe(409);
    expect((await request(app).delete(`/api/claims/${c.body.claim.id}`).set(auth(admin.token))).status).toBe(409);
  });

  it('rejects self-claims, duplicates, lost-report claims and other students’ lost reports', async () => {
    const { finder, owner, found, lost } = await scenario();
    const intruder = await makeUser();
    expect((await request(app).post('/api/claims').set(auth(finder.token)).send({ foundItemId: found.id, ownershipEvidence: evidence })).body.error.code).toBe('SELF_CLAIM');
    expect((await request(app).post('/api/claims').set(auth(intruder.token)).send({ foundItemId: lost.id, ownershipEvidence: evidence })).status).toBe(422);
    expect((await request(app).post('/api/claims').set(auth(intruder.token)).send({ foundItemId: found.id, lostItemId: lost.id, ownershipEvidence: evidence })).status).toBe(403);
    expect((await request(app).post('/api/claims').set(auth(owner.token)).send({ foundItemId: found.id, ownershipEvidence: evidence })).status).toBe(201);
    const dup = await request(app).post('/api/claims').set(auth(owner.token)).send({ foundItemId: found.id, ownershipEvidence: evidence });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_CLAIM');
    expect((await request(app).post('/api/claims').set(auth(owner.token)).send({ foundItemId: found.id, ownershipEvidence: 'too short' })).status).toBe(422);
  });

  it('only admins review; students only see their own claims (no IDOR)', async () => {
    const { owner, found } = await scenario();
    const other = await makeUser();
    const c = (await request(app).post('/api/claims').set(auth(owner.token)).send({ foundItemId: found.id, ownershipEvidence: evidence })).body.claim;
    expect((await request(app).post(`/api/claims/${c.id}/approve`).set(auth(owner.token)).send({ version: 0 })).status).toBe(403);
    expect((await request(app).get(`/api/claims/${c.id}`).set(auth(other.token))).status).toBe(404);
    expect((await request(app).get('/api/claims').set(auth(other.token))).body.total).toBe(0);
    expect((await request(app).get('/api/claims').set(auth(owner.token))).body.total).toBe(1);
  });

  it('allows only one approval even when two admins race', async () => {
    const { found } = await scenario();
    const a = await makeUser();
    const b = await makeUser();
    const admin = await makeUser('admin');
    const c1 = (await request(app).post('/api/claims').set(auth(a.token)).send({ foundItemId: found.id, ownershipEvidence: evidence })).body.claim;
    const c2 = (await request(app).post('/api/claims').set(auth(b.token)).send({ foundItemId: found.id, ownershipEvidence: evidence })).body.claim;
    const [r1, r2] = await Promise.all([
      request(app).post(`/api/claims/${c1.id}/approve`).set(auth(admin.token)).send({ version: 0 }),
      request(app).post(`/api/claims/${c2.id}/approve`).set(auth(admin.token)).send({ version: 0 }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
  });

  it('rejects stale versions on review', async () => {
    const { owner, admin, found } = await scenario();
    const c = (await request(app).post('/api/claims').set(auth(owner.token)).send({ foundItemId: found.id, ownershipEvidence: evidence })).body.claim;
    const res = await request(app).post(`/api/claims/${c.id}/approve`).set(auth(admin.token)).send({ version: 7 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STALE_VERSION');
  });

  it('reject requires a note and reopens the item when no pending claims remain', async () => {
    const { owner, admin, found } = await scenario();
    const c = (await request(app).post('/api/claims').set(auth(owner.token)).send({ foundItemId: found.id, ownershipEvidence: evidence })).body.claim;
    expect((await request(app).post(`/api/claims/${c.id}/reject`).set(auth(admin.token)).send({ version: 0 })).status).toBe(422);
    const r = await request(app).post(`/api/claims/${c.id}/reject`).set(auth(admin.token)).send({ version: 0, adminNote: 'Details do not match' });
    expect(r.body.claim.status).toBe('rejected');
    expect((await Item.findById(found.id))!.status).toBe('open');
  });

  it('claimant can withdraw a pending claim; item returns to open', async () => {
    const { owner, found } = await scenario();
    const c = (await request(app).post('/api/claims').set(auth(owner.token)).send({ foundItemId: found.id, ownershipEvidence: evidence })).body.claim;
    const w = await request(app).post(`/api/claims/${c.id}/withdraw`).set(auth(owner.token));
    expect(w.body.claim.status).toBe('withdrawn');
    expect((await Item.findById(found.id))!.status).toBe('open');
    expect((await request(app).post(`/api/claims/${c.id}/withdraw`).set(auth(owner.token))).status).toBe(409);
  });

  it('blocks deleting a report with an active claim and a found report edit once claimed', async () => {
    const { finder, owner, found } = await scenario();
    await request(app).post('/api/claims').set(auth(owner.token)).send({ foundItemId: found.id, ownershipEvidence: evidence });
    expect((await request(app).delete(`/api/items/${found.id}`).set(auth(finder.token))).body.error.code).toBe('ACTIVE_CLAIM');
    expect((await request(app).patch(`/api/items/${found.id}`).set(auth(finder.token)).send({ title: 'New title here', version: 1 })).status).toBe(409);
  });
  it('staff pick up claims; students see who is handling theirs', async () => {
    const { owner, admin, found } = await scenario();
    const c = (await request(app).post('/api/claims').set(auth(owner.token)).send({ foundItemId: found.id, ownershipEvidence: 'My initials A.R. are scratched on the back cover' })).body.claim;
    const queue = await request(app).get('/api/claims?assigned=unassigned').set(auth(admin.token));
    expect(queue.body.data.map((x: any) => x.id)).toContain(c.id);
    expect((await request(app).post(`/api/claims/${c.id}/assign`).set(auth(owner.token)).send({ version: 0 })).status).toBe(403);
    const other = await makeUser('admin');
    expect((await request(app).post(`/api/claims/${c.id}/assign`).set(auth(admin.token)).send({ version: 0, staffId: other.id })).status).toBe(403);
    const a = await request(app).post(`/api/claims/${c.id}/assign`).set(auth(admin.token)).send({ version: 0 });
    expect(a.status).toBe(200);
    expect(a.body.claim.assignedTo.id).toBe(admin.id);
    const mine = await request(app).get('/api/claims?assigned=me').set(auth(admin.token));
    expect(mine.body.total).toBe(1);
    const seen = await request(app).get(`/api/claims/${c.id}`).set(auth(owner.token));
    expect(seen.body.claim.assignedTo.fullName).toBeTruthy();
    expect(seen.body.claim.assignedTo.email).toBeUndefined();
  });
});
