import { z } from 'zod';
import { CATEGORIES } from '../models/Item';
import { objectId, pageQuery } from './common';

export const geoSearchQuery = z.object({ q: z.string().trim().min(2, 'Type at least 2 characters').max(100) });
export const geoReverseQuery = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });
export const dashboardQuery = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  category: z.enum(CATEGORIES).optional(),
  location: z.string().trim().max(100).optional(),
  department: z.string().trim().max(80).optional(),
  reportType: z.enum(['lost', 'found']).optional(),
  granularity: z.enum(['day', 'week']).default('week'),
});
export const auditQuery = z.object({
  action: z.string().trim().max(60).optional(),
  entityType: z.string().trim().max(40).optional(),
  actorId: objectId.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  ...pageQuery,
});
