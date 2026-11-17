import { env } from '../config/env';
import { CAMPUS_LANDMARKS, insideCampus } from '../config/campus';
import { GeoCache } from '../models/GeoCache';

export interface GeoPlace {
  name: string;
  displayName: string;
  lat: number;
  lng: number;
  type: string;
  insideCampus: boolean;
  source: 'landmark' | 'nominatim';
}
export interface GeoResult<T> {
  data: T;
  source: 'live' | 'cache' | 'stale-cache' | 'fallback';
  warning?: string;
}

let lastCallAt = 0;
let chain: Promise<unknown> = Promise.resolve();
export const geoStats = { live: 0, cache: 0, stale: 0, fallback: 0, lastError: null as string | null, lastErrorAt: null as Date | null };

/** Nominatim usage policy: max 1 request/second. Serialise outgoing calls. */
function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    const wait = Math.max(0, lastCallAt + 1100 - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
    return fn();
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}

class UpstreamError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function callNominatim(pathAndQuery: string): Promise<any> {
  return throttle(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), env.NOMINATIM_TIMEOUT_MS);
    try {
      const res = await fetch(`${env.NOMINATIM_BASE_URL}${pathAndQuery}`, {
        headers: { 'User-Agent': env.NOMINATIM_USER_AGENT, Accept: 'application/json', 'Accept-Language': 'en' },
        signal: ctrl.signal,
      });
      if (res.status === 429) throw new UpstreamError(429, 'Map service rate limit reached');
      if (!res.ok) throw new UpstreamError(res.status, `Map service responded ${res.status}`);
      return await res.json();
    } catch (err: any) {
      if (err?.name === 'AbortError') throw new UpstreamError(504, 'Map service timed out');
      if (err instanceof UpstreamError) throw err;
      throw new UpstreamError(502, 'Map service unreachable');
    } finally {
      clearTimeout(timer);
    }
  });
}

/** Cache-first with TTL; on upstream failure serve stale cache, else the caller's fallback. */
async function cached<T>(key: string, fetcher: () => Promise<T>, fallback: () => T): Promise<GeoResult<T>> {
  const now = Date.now();
  const hit = await GeoCache.findOne({ key }).lean();
  if (hit && hit.expiresAt.getTime() > now) {
    geoStats.cache++;
    return { data: hit.payload as T, source: 'cache' };
  }
  try {
    const data = await fetcher();
    const ttl = env.GEO_CACHE_TTL_HOURS * 3600_000;
    await GeoCache.updateOne(
      { key },
      { $set: { payload: data, fetchedAt: new Date(now), expiresAt: new Date(now + ttl), staleUntil: new Date(now + ttl * 10) } },
      { upsert: true },
    );
    geoStats.live++;
    return { data, source: 'live' };
  } catch (err: any) {
    geoStats.lastError = err.message;
    geoStats.lastErrorAt = new Date();
    if (hit) {
      geoStats.stale++;
      return { data: hit.payload as T, source: 'stale-cache', warning: `${err.message}; showing saved results` };
    }
    geoStats.fallback++;
    return { data: fallback(), source: 'fallback', warning: `${err.message}; showing campus landmarks only` };
  }
}

function landmarkMatches(q: string): GeoPlace[] {
  const needle = q.toLowerCase();
  return CAMPUS_LANDMARKS.filter((l) => l.name.toLowerCase().includes(needle)).map((l) => ({
    name: l.name,
    displayName: `${l.name} — ${env.UNIVERSITY_NAME}`,
    lat: l.lat,
    lng: l.lng,
    type: l.type,
    insideCampus: true,
    source: 'landmark' as const,
  }));
}

function mapPlace(p: any): GeoPlace {
  const lat = Number(p.lat);
  const lng = Number(p.lon);
  return {
    name: String(p.name || String(p.display_name).split(',')[0]),
    displayName: String(p.display_name),
    lat,
    lng,
    type: String(p.type ?? p.category ?? 'place'),
    insideCampus: insideCampus(lat, lng),
    source: 'nominatim',
  };
}

export async function searchPlaces(q: string): Promise<GeoResult<GeoPlace[]>> {
  const b = env.campusBounds;
  const viewbox = `${b.minLng},${b.maxLat},${b.maxLng},${b.minLat}`;
  const key = `search:${q.toLowerCase()}`;
  const result = await cached<GeoPlace[]>(
    key,
    async () => {
      const raw = await callNominatim(`/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=5&countrycodes=pk&viewbox=${viewbox}`);
      return (Array.isArray(raw) ? raw : []).map(mapPlace);
    },
    () => [],
  );
  // Landmarks first (always available), then live results; in-campus results ranked higher.
  const live = result.data.sort((a, b2) => Number(b2.insideCampus) - Number(a.insideCampus));
  return { ...result, data: [...landmarkMatches(q), ...live].slice(0, 10) };
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeoResult<GeoPlace>> {
  // ~11 m precision cache key keeps nearby clicks on the same entry.
  const key = `reverse:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const nearest = () => {
    const l = [...CAMPUS_LANDMARKS].sort((a, c) => Math.hypot(a.lat - lat, a.lng - lng) - Math.hypot(c.lat - lat, c.lng - lng))[0];
    return {
      name: `Near ${l.name}`,
      displayName: `Near ${l.name} — ${env.UNIVERSITY_NAME}`,
      lat,
      lng,
      type: 'landmark',
      insideCampus: insideCampus(lat, lng),
      source: 'landmark' as const,
    };
  };
  return cached<GeoPlace>(
    key,
    async () => {
      const raw = await callNominatim(`/reverse?lat=${lat}&lon=${lng}&format=jsonv2&zoom=18`);
      if (!raw || raw.error) return nearest();
      return { ...mapPlace({ ...raw, lat, lon: lng }), lat, lng };
    },
    nearest,
  );
}

export function landmarks() {
  return CAMPUS_LANDMARKS;
}
