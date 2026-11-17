import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app, auth, clearDb, makeUser, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  vi.unstubAllGlobals();
});

const place = { display_name: 'Main Library, Green Valley State University, Lahore, Pakistan', name: 'Main Library', lat: '31.5212', lon: '74.3521', type: 'library' };

describe('Nominatim proxy', () => {
  it('requires auth', async () => {
    expect((await request(app).get('/api/map/search?q=library')).status).toBe(401);
  });
  it('validates the query', async () => {
    const s = await makeUser();
    expect((await request(app).get('/api/map/search?q=a').set(auth(s.token))).status).toBe(422);
  });
  it('calls Nominatim with a User-Agent, then serves from cache', async () => {
    const s = await makeUser();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([place]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const live = await request(app).get('/api/map/search?q=central').set(auth(s.token));
    expect(live.status).toBe(200);
    expect(live.body.source).toBe('live');
    expect(live.body.data[0]).toMatchObject({ name: 'Main Library', insideCampus: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('format=jsonv2');
    expect(url).toContain('countrycodes=pk');
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/CampusFind/);
    const cached = await request(app).get('/api/map/search?q=central').set(auth(s.token));
    expect(cached.body.source).toBe('cache');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('falls back to campus landmarks on 429 / outage with a warning', async () => {
    const s = await makeUser();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('slow down', { status: 429 })));
    const res = await request(app).get('/api/map/search?q=library').set(auth(s.token));
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('fallback');
    expect(res.body.warning).toMatch(/rate limit/i);
    expect(res.body.data[0].source).toBe('landmark');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    const rev = await request(app).get('/api/map/reverse?lat=31.5199&lng=74.3489').set(auth(s.token));
    expect(rev.body.source).toBe('fallback');
    expect(rev.body.data.name).toBe('Near IT Lab 03');
  });
});
