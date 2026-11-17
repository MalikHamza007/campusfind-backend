import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import { env } from '../config/env';
import { RefreshToken } from '../models/RefreshToken';

export const REFRESH_COOKIE = 'cf_rt';

export function signAccessToken(user: { _id: unknown; role: string }): string {
  return jwt.sign({ sub: String(user._id), role: user.role }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function hashRefreshToken(token: string): string {
  return crypto.createHmac('sha256', env.REFRESH_TOKEN_PEPPER).update(token).digest('hex');
}

export async function issueRefreshToken(userId: unknown, req: Request): Promise<string> {
  const token = crypto.randomBytes(48).toString('base64url');
  await RefreshToken.create({
    userId: userId as any,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + env.REFRESH_TTL_DAYS * 864e5),
    userAgent: String(req.headers['user-agent'] ?? '').slice(0, 200),
    ip: req.ip,
  });
  return token;
}

export function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/api/auth',
    domain: env.COOKIE_DOMAIN || undefined,
    maxAge: env.REFRESH_TTL_DAYS * 864e5,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax', path: '/api/auth', domain: env.COOKIE_DOMAIN || undefined });
}

export async function revokeAllForUser(userId: unknown, exceptHash?: string) {
  await RefreshToken.updateMany(
    { userId, revokedAt: null, ...(exceptHash ? { tokenHash: { $ne: exceptHash } } : {}) } as any,
    { $set: { revokedAt: new Date() } },
  );
}
