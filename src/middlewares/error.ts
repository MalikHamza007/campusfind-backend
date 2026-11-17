import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import multer from 'multer';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.path}`));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong. Please try again.';
  let details: unknown;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Some fields are invalid';
    details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
  } else if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') { status = 413; code = 'FILE_TOO_LARGE'; message = 'File exceeds the size limit for this purpose'; }
    else { status = 400; code = 'UPLOAD_ERROR'; message = err.message; }
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400; code = 'INVALID_ID'; message = `Invalid ${err.path}`;
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 422; code = 'VALIDATION_ERROR'; message = 'Some fields are invalid';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err?.code === 11000) {
    status = 409; code = 'DUPLICATE'; message = 'A record with these details already exists';
    details = err.keyValue ? Object.keys(err.keyValue) : undefined;
  } else if (err?.type === 'entity.too.large') {
    status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body is too large';
  } else if (err?.type === 'entity.parse.failed') {
    status = 400; code = 'INVALID_JSON'; message = 'Malformed JSON body';
  }

  if (status >= 500 && !env.isTest) console.error('[error]', err);
  res.status(status).json({ error: { code, message, ...(details !== undefined ? { details } : {}) } });
}
