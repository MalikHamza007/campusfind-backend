import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { User, Role } from '../models/User';

export interface AuthUser { id: string; role: Role; fullName: string; email: string }
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: AuthUser } }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(AppError.unauthorized());
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
  } catch {
    return next(new AppError(401, 'TOKEN_INVALID', 'Session expired, please sign in again'));
  }
  // Re-check the account on every request so deactivation/role changes take effect immediately.
  const user = await User.findById(payload.sub).select('role status fullName email').lean();
  if (!user || user.status !== 'active') return next(new AppError(401, 'ACCOUNT_INACTIVE', 'Account is not active'));
  req.user = { id: String(user._id), role: user.role as Role, fullName: user.fullName, email: user.email };
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    next();
  };
}

export const isAdmin = (req: Request) => req.user?.role === 'admin';
