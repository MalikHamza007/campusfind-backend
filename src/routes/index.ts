import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { authLimiter, geoLimiter, uploadLimiter } from '../middlewares/rateLimit';
import { idParam } from '../validators/common';
import { changePasswordSchema, loginSchema, registerSchema } from '../validators/auth.validators';
import { createItemSchema, listItemsQuery, updateItemSchema } from '../validators/item.validators';
import { assignSchema, createClaimSchema, listClaimsQuery, rejectSchema, reviewSchema, updateClaimSchema } from '../validators/claim.validators';
import { listUsersQuery, updateUserSchema } from '../validators/user.validators';
import { linkSchema, listFilesQuery } from '../validators/file.validators';
import { auditQuery, dashboardQuery, geoReverseQuery, geoSearchQuery } from '../validators/misc.validators';
import { MAX_UPLOAD_BYTES } from '../services/file.service';
import * as auth from '../controllers/auth.controller';
import * as items from '../controllers/item.controller';
import * as claims from '../controllers/claim.controller';
import * as files from '../controllers/file.controller';
import * as users from '../controllers/user.controller';
import * as dash from '../controllers/dashboard.controller';
import * as misc from '../controllers/misc.controller';

// Memory storage: bytes are sniffed and validated BEFORE anything touches the bucket.
const uploader = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 4, parts: 6 } });
const id = validate(idParam, 'params');

export const router = Router();

router.get('/config', misc.publicConfig);

// ---- Auth ----
router.post('/auth/register', authLimiter, validate(registerSchema), auth.register);
router.post('/auth/login', authLimiter, validate(loginSchema), auth.login);
router.post('/auth/refresh', authLimiter, auth.refresh);
router.post('/auth/logout', (req, res, next) => (req.headers.authorization ? requireAuth(req, res, () => next()) : next()), auth.logout);
router.get('/auth/me', requireAuth, auth.me);
router.patch('/auth/password', requireAuth, authLimiter, validate(changePasswordSchema), auth.changePassword);

// ---- Items ----
router.get('/items', requireAuth, validate(listItemsQuery, 'query'), items.list);
router.get('/items/mine', requireAuth, validate(listItemsQuery, 'query'), items.mine);
router.get('/items/departments', requireAuth, items.departments);
router.post('/items', requireAuth, requireRole('student', 'admin'), validate(createItemSchema), items.create);
router.get('/items/:id', requireAuth, id, items.getOne);
router.patch('/items/:id', requireAuth, id, validate(updateItemSchema), items.update);
router.delete('/items/:id', requireAuth, id, items.remove);
router.post('/items/:id/restore', requireAuth, requireRole('admin'), id, items.restore);

// ---- Claims ----
router.get('/claims', requireAuth, validate(listClaimsQuery, 'query'), claims.list);
router.post('/claims', requireAuth, requireRole('student'), validate(createClaimSchema), claims.create);
router.get('/claims/:id', requireAuth, id, claims.getOne);
router.patch('/claims/:id', requireAuth, id, validate(updateClaimSchema), claims.update);
router.post('/claims/:id/withdraw', requireAuth, requireRole('student'), id, claims.withdraw);
router.post('/claims/:id/assign', requireAuth, requireRole('admin'), id, validate(assignSchema), claims.assign);
router.post('/claims/:id/approve', requireAuth, requireRole('admin'), id, validate(reviewSchema), claims.approve);
router.post('/claims/:id/reject', requireAuth, requireRole('admin'), id, validate(rejectSchema), claims.reject);
router.post('/claims/:id/return', requireAuth, requireRole('admin'), id, validate(reviewSchema), claims.markReturned);
router.delete('/claims/:id', requireAuth, requireRole('admin'), id, claims.remove);

// ---- Files (private bucket) ----
// Auth + per-user rate limit run BEFORE multer parses the body.
router.post('/files', requireAuth, uploadLimiter, uploader.single('file'), files.upload);
router.get('/files', requireAuth, validate(listFilesQuery, 'query'), files.list);
router.get('/files/:id', requireAuth, id, files.getOne);
router.post('/files/:id/signed-url', requireAuth, id, files.signedUrl);
router.get('/files/:id/content', id, files.content); // authorised by the 60-second signed token
router.post('/files/:id/link', requireAuth, id, validate(linkSchema), files.link);
router.delete('/files/:id', requireAuth, id, files.remove);

// ---- Users ----
router.get('/users', requireAuth, requireRole('admin'), validate(listUsersQuery, 'query'), users.list);
router.get('/users/:id', requireAuth, id, users.getOne);
router.patch('/users/:id', requireAuth, id, validate(updateUserSchema), users.update);

// ---- Map (OpenStreetMap Nominatim proxy) ----
router.get('/map/config', requireAuth, misc.geoConfig);
router.get('/map/search', requireAuth, geoLimiter, validate(geoSearchQuery, 'query'), misc.geoSearch);
router.get('/map/reverse', requireAuth, geoLimiter, validate(geoReverseQuery, 'query'), misc.geoReverse);

// ---- Dashboard & audit ----
router.get('/dashboard/stats', requireAuth, validate(dashboardQuery, 'query'), dash.stats);
router.get('/audit-logs', requireAuth, requireRole('admin'), validate(auditQuery, 'query'), misc.auditLogs);
