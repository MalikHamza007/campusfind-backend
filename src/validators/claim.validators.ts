import { z } from 'zod';
import { CLAIM_STATUSES } from '../models/Claim';
import { cleanText, objectId, optionalText, pageQuery } from './common';

export const createClaimSchema = z
  .object({
    foundItemId: objectId,
    lostItemId: objectId.optional().or(z.literal('').transform(() => undefined)).or(z.null().transform(() => undefined)),
    ownershipEvidence: cleanText(30, 2000, 'Ownership evidence'),
    evidenceFileIds: z.array(objectId).max(3, 'Maximum 3 evidence files per claim').default([]),
  })
  .strict();

export const updateClaimSchema = z
  .object({
    ownershipEvidence: cleanText(30, 2000, 'Ownership evidence').optional(),
    evidenceFileIds: z.array(objectId).max(3, 'Maximum 3 evidence files per claim').optional(),
    adminNote: optionalText(1000, 'Admin note'),
    version: z.coerce.number().int().min(0),
  })
  .strict();

export const reviewSchema = z.object({ adminNote: optionalText(1000, 'Admin note'), version: z.coerce.number().int().min(0) }).strict();
export const rejectSchema = z.object({ adminNote: cleanText(5, 1000, 'Rejection reason'), version: z.coerce.number().int().min(0) }).strict();

export const listClaimsQuery = z.object({
  status: z.enum(CLAIM_STATUSES).optional(),
  foundItemId: objectId.optional(),
  q: z.string().trim().max(100).optional(),
  ...pageQuery,
});
