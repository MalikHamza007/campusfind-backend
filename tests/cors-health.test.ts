import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);

describe('health & CORS', () => {
  it('reports DB state', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
  });
  it('allows the production frontend origin with credentials (preflight)', async () => {
    const res = await request(app).options('/api/items').set('Origin', 'https://vspark.learn2earntech.com').set('Access-Control-Request-Method', 'PATCH').set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://vspark.learn2earntech.com');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-methods']).toContain('PATCH');
  });
  it('allows the vpsark frontend host too', async () => {
    const res = await request(app).options('/api/auth/register').set('Origin', 'https://vpsark.learn2earntech.com').set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://vpsark.learn2earntech.com');
  });
  it('allows localhost dev origin', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:4200');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:4200');
  });
  it('rejects unknown origins with JSON 403 and never uses *', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CORS_FORBIDDEN');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('returns JSON 404 envelope for unknown routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
  it('sets security headers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
