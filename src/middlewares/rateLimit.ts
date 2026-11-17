import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env';

const json = (message: string) => ({ error: { code: 'RATE_LIMITED', message } });
const skip = () => env.isTest && process.env.ENABLE_RATE_LIMIT_IN_TESTS !== 'true';

export const apiLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false, message: json('Too many requests, slow down'), skip });
export const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: json('Too many sign-in attempts. Try again in a few minutes.'), skip });
/** Per-user upload limit (keyed by user id, applied after requireAuth). */
export const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.id ? `u:${req.user.id}` : ipKeyGenerator(req.ip ?? ''),
  message: json('Upload limit reached (10 per minute). Please wait a moment.'),
  skip: () => env.isTest && process.env.ENABLE_UPLOAD_LIMIT_IN_TESTS !== 'true',
});
export const geoLimiter = rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator: (req: any) => req.user?.id ? `g:${req.user.id}` : ipKeyGenerator(req.ip ?? ''), message: json('Too many location lookups, please wait'), skip });
