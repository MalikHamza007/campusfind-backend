import { z } from 'zod';
import { ROLES } from '../models/User';
import { cleanText, objectId, pageQuery } from './common';
import { phoneRule } from './auth.validators';

export const updateUserSchema = z
  .object({
    fullName: cleanText(2, 80, 'Full name').optional(),
    department: cleanText(2, 80, 'Department').optional(),
    phone: phoneRule.or(z.null().transform(() => undefined)),
    avatarFileId: objectId.nullable().optional(),
    role: z.enum(ROLES).optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .strict();

export const listUsersQuery = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  department: z.string().trim().max(80).optional(),
  ...pageQuery,
});
