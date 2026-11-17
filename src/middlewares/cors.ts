import cors from 'cors';
import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

/** Strict allowlist CORS. Unknown browser origins get a clear JSON 403 (never `*` with credentials). */
export function corsGuard(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin && !env.corsOrigins.includes(origin)) {
    res.status(403).json({ error: { code: 'CORS_FORBIDDEN', message: `Origin ${origin} is not allowed` } });
    return;
  }
  next();
}

export const corsMiddleware = cors({
  origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin) ? origin || false : false),
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Disposition', 'Retry-After'],
  maxAge: 600,
  optionsSuccessStatus: 204,
});
