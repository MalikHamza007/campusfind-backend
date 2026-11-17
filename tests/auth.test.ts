import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, clearDb, makeUser, startDb, stopDb } from './helpers';
import { User } from '../src/models/User';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

const reg = (over: Record<string, unknown> = {}) => ({
  fullName: 'Ali Raza', email: 'ali.raza@campusfind.edu.pk', studentId: 'GSU-2023-CS-041', department: 'Computer Science', password: 'Str0ng!Pass', ...over,
});
const cookieOf = (res: request.Response) => (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('cf_rt='))!;

describe('registration', () => {
  it('creates an active student and never returns the hash', async () => {
    const res = await request(app).post('/api/auth/register').send(reg());
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ role: 'student', status: 'active', email: 'ali.raza@campusfind.edu.pk' });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });
  it('rejects a role field (no self-promotion)', async () => {
    const res = await request(app).post('/api/auth/register').send(reg({ role: 'admin' }));
    expect(res.status).toBe(422);
    expect(await User.countDocuments({ role: 'admin' })).toBe(0);
  });
  it('enforces university domain, password policy and uniqueness', async () => {
    expect((await request(app).post('/api/auth/register').send(reg({ email: 'x@gmail.com' }))).status).toBe(422);
    expect((await request(app).post('/api/auth/register').send(reg({ password: 'weakpass' }))).status).toBe(422);
    await request(app).post('/api/auth/register').send(reg());
    const dup = await request(app).post('/api/auth/register').send(reg({ studentId: 'GSU-2023-CS-042' }));
    expect(dup.status).toBe(409);
  });
});

describe('login / session', () => {
  it('rejects bad credentials with 401', async () => {
    await makeUser();
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@campusfind.edu.pk', password: 'Wrong!123a' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
  it('sets an HttpOnly SameSite=Lax refresh cookie scoped to /api/auth', async () => {
    const u = await makeUser();
    const c = u.cookie.find((x) => x.startsWith('cf_rt='))!;
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Lax/i);
    expect(c).toMatch(/Path=\/api\/auth/);
  });
  it('protects /me (401 without token, 200 with)', async () => {
    const u = await makeUser();
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(auth('garbage'))).status).toBe(401);
    const me = await request(app).get('/api/auth/me').set(auth(u.token));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(u.email);
  });
  it('rotates refresh tokens and detects reuse', async () => {
    const u = await makeUser();
    const first = u.cookie.find((x) => x.startsWith('cf_rt='))!;
    const r1 = await request(app).post('/api/auth/refresh').set('Cookie', first);
    expect(r1.status).toBe(200);
    expect(r1.body.accessToken).toBeTruthy();
    const second = cookieOf(r1);
    // replaying the old token revokes the whole family
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', first);
    expect(replay.status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', second)).status).toBe(401);
  });
  it('logout invalidates the server session', async () => {
    const u = await makeUser();
    const c = u.cookie.find((x) => x.startsWith('cf_rt='))!;
    expect((await request(app).post('/api/auth/logout').set(auth(u.token)).set('Cookie', c)).status).toBe(200);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', c)).status).toBe(401);
  });
  it('deactivated accounts lose access immediately', async () => {
    const u = await makeUser();
    await User.updateOne({ _id: u.id }, { status: 'inactive' });
    expect((await request(app).get('/api/auth/me').set(auth(u.token))).status).toBe(401);
  });
  it('changes password with current password check', async () => {
    const u = await makeUser();
    const bad = await request(app).patch('/api/auth/password').set(auth(u.token)).send({ currentPassword: 'nope', newPassword: 'N3w!Password' });
    expect(bad.status).toBe(422);
    const ok = await request(app).patch('/api/auth/password').set(auth(u.token)).send({ currentPassword: 'Str0ng!Pass', newPassword: 'N3w!Password' });
    expect(ok.status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: 'N3w!Password' })).status).toBe(200);
  });
});
