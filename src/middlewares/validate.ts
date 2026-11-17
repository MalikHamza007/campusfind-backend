import { NextFunction, Request, Response } from 'express';
import { ZodType } from 'zod';

/** Validates and REPLACES req.body / req.query with the parsed (trimmed, coerced, stripped) value. */
export const validate =
  (schema: ZodType, where: 'body' | 'query' | 'params' = 'body') =>
  (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.parse(req[where]);
    if (where === 'query') Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true });
    else (req as any)[where] = parsed;
    next();
  };
