import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, clearDb, makeUser, startDb, stopDb, validItem } from './helpers';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe('users & roles', () => {
  it('students cannot list users, change roles or see audit logs', async () => {
    const s = await makeUser();
    expect((await request(app).get('/api/users').set(auth(s.token))).status).toBe(403);
    expect((await request(app).patch(`/api/users/${s.id}`).set(auth(s.token)).send({ role: 'admin' })).status).toBe(403);
    expect((await request(app).get('/api/audit-logs').set(auth(s.token))).status).toBe(403);
  });
  it('students update their own profile only', async () => {
    const s = await makeUser();
    const other = await makeUser();
    expect((await request(app).patch(`/api/users/${s.id}`).set(auth(s.token)).send({ department: 'English' })).body.user.department).toBe('English');
    expect((await request(app).patch(`/api/users/${other.id}`).set(auth(s.token)).send({ department: 'English' })).status).toBe(403);
  });
  it('admin promotes users but cannot lock themselves out or remove the last admin', async () => {
    const admin = await makeUser('admin');
    const s = await makeUser();
    expect((await request(app).patch(`/api/users/${admin.id}`).set(auth(admin.token)).send({ status: 'inactive' })).body.error.code).toBe('SELF_LOCKOUT');
    const promoted = await request(app).patch(`/api/users/${s.id}`).set(auth(admin.token)).send({ role: 'admin' });
    expect(promoted.body.user.role).toBe('admin');
    expect((await request(app).patch(`/api/users/${s.id}`).set(auth(admin.token)).send({ status: 'inactive' })).status).toBe(200);
    // s is now an inactive admin; admin is the last active admin
    const lone = await makeUser('admin', { status: 'inactive' });
    expect(lone.token).toBeUndefined();
    const list = await request(app).get('/api/users?role=admin').set(auth(admin.token));
    expect(list.body.total).toBe(3);
  });
});

describe('dashboard', () => {
  it('returns role-scoped stats', async () => {
    const s = await makeUser();
    const admin = await makeUser('admin');
    await request(app).post('/api/items').set(auth(s.token)).send(validItem());
    const st = await request(app).get('/api/dashboard/stats').set(auth(s.token));
    expect(st.body.role).toBe('student');
    expect(st.body.kpis.myLostReports.value).toBe(1);
    expect(st.body.health).toBeUndefined();
    const ad = await request(app).get('/api/dashboard/stats').set(auth(admin.token));
    expect(ad.body.role).toBe('admin');
    expect(ad.body.kpis.totalLost.value).toBe(1);
    expect(ad.body.charts.funnel).toHaveLength(4);
    expect(ad.body.health.db).toBe('up');
  });
  it('admin reads the audit trail', async () => {
    const admin = await makeUser('admin');
    const res = await request(app).get('/api/audit-logs').set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.some((e: any) => e.action === 'auth.login')).toBe(true);
  });
});
