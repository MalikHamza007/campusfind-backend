import { z } from 'zod';
import { Types } from 'mongoose';

export const objectId = z.string().trim().refine((v) => Types.ObjectId.isValid(v) && /^[a-f\d]{24}$/i.test(v), 'Invalid id');
export const idParam = z.object({ id: objectId });
export const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
};
/** Trim, collapse control characters, strip angle brackets (text is always rendered as text, this is defence in depth). */
export const cleanText = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} is required` })
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[<>]/g, '').trim())
    .pipe(z.string().min(min, `${label} must be at least ${min} characters`).max(max, `${label} must be at most ${max} characters`));
export const optionalText = (max: number, label: string) =>
  z
    .string()
    .transform((s) => s.replace(/[<>]/g, '').trim())
    .pipe(z.string().max(max, `${label} must be at most ${max} characters`))
    .optional()
    .or(z.literal('').transform(() => undefined));
