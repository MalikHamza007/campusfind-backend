import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { User, publicUser } from '../models/User';
import { RefreshToken } from '../models/RefreshToken';
import { AppError } from '../utils/AppError';
import { audit } from '../services/audit.service';
import {
  REFRESH_COOKIE, clearRefreshCookie, hashRefreshToken, issueRefreshToken, revokeAllForUser, setRefreshCookie, signAccessToken,
} from '../services/token.service';

// Constant-time-ish login: compare against a dummy hash when the user does not exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-#1A', 10);

export async function register(req: Request, res: Response) {
  const { fullName, email, studentId, department, phone, password } = req.body;
  const clash = await User.findOne({ $or: [{ email }, { studentId }] }).lean();
  if (clash) {
    const field = clash.email === email ? 'email' : 'studentId';
    throw new AppError(409, 'DUPLICATE', field === 'email' ? 'An account with this email already exists' : 'This student ID is already registered', [{ field, message: 'Already registered' }]);
  }
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  // Role is always server-controlled: public registration creates an active student.
  const user = await User.create({ fullName, email, studentId, department, phone, passwordHash, role: 'student', status: 'active' });
  await audit(req, 'user.registered', 'user', user._id, { email }, undefined, String(user._id));
  res.status(201).json({ user: publicUser(user) });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    await audit(req, 'auth.login_failed', 'user', user?._id, { email });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  if (user.status !== 'active') throw new AppError(403, 'ACCOUNT_INACTIVE', 'Your account has been deactivated. Contact the lost & found office.');
  user.lastLoginAt = new Date();
  await user.save();
  const refresh = await issueRefreshToken(user._id, req);
  setRefreshCookie(res, refresh);
  await audit(req, 'auth.login', 'user', user._id, {}, undefined, String(user._id));
  res.json({ accessToken: signAccessToken(user), user: publicUser(user) });
}

/** Rotates the refresh token. Re-use of a revoked token revokes every session for that user. */
export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw new AppError(401, 'NO_SESSION', 'No active session');
  const hash = hashRefreshToken(token);
  const record = await RefreshToken.findOne({ tokenHash: hash });
  if (!record) {
    clearRefreshCookie(res);
    throw new AppError(401, 'NO_SESSION', 'Session not found');
  }
  if (record.revokedAt) {
    await revokeAllForUser(record.userId);
    clearRefreshCookie(res);
    await audit(req, 'auth.refresh_reuse_detected', 'user', record.userId, {}, undefined, String(record.userId));
    throw new AppError(401, 'SESSION_REVOKED', 'Session was revoked, please sign in again');
  }
  if (record.expiresAt.getTime() < Date.now()) {
    clearRefreshCookie(res);
    throw new AppError(401, 'SESSION_EXPIRED', 'Session expired, please sign in again');
  }
  const user = await User.findById(record.userId);
  if (!user || user.status !== 'active') {
    await revokeAllForUser(record.userId);
    clearRefreshCookie(res);
    throw new AppError(401, 'ACCOUNT_INACTIVE', 'Account is not active');
  }
  const next = await issueRefreshToken(user._id, req);
  record.revokedAt = new Date();
  record.replacedBy = hashRefreshToken(next);
  await record.save();
  setRefreshCookie(res, next);
  res.json({ accessToken: signAccessToken(user), user: publicUser(user) });
}

export async function logout(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) await RefreshToken.updateOne({ tokenHash: hashRefreshToken(token), revokedAt: null }, { $set: { revokedAt: new Date() } });
  clearRefreshCookie(res);
  if (req.user) await audit(req, 'auth.logout', 'user', req.user.id);
  res.json({ ok: true });
}

export async function me(req: Request, res: Response) {
  const user = await User.findById(req.user!.id);
  if (!user) throw AppError.notFound('User');
  res.json({ user: publicUser(user) });
}

export async function changePassword(req: Request, res: Response) {
  const user = await User.findById(req.user!.id).select('+passwordHash');
  if (!user) throw AppError.notFound('User');
  if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Current password is incorrect', [{ field: 'currentPassword', message: 'Incorrect password' }]);
  }
  if (req.body.currentPassword === req.body.newPassword) throw AppError.validation('New password must differ from the current one', [{ field: 'newPassword', message: 'Choose a different password' }]);
  user.passwordHash = await bcrypt.hash(req.body.newPassword, env.BCRYPT_ROUNDS);
  await user.save();
  // Keep the current session, revoke every other one.
  const current = req.cookies?.[REFRESH_COOKIE];
  await revokeAllForUser(user._id, current ? hashRefreshToken(current) : undefined);
  await audit(req, 'user.password_changed', 'user', user._id);
  res.json({ ok: true });
}
