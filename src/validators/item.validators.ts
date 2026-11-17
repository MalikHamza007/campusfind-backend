import { z } from 'zod';
import { CATEGORIES, ITEM_STATUSES, REPORT_TYPES } from '../models/Item';
import { cleanText, objectId, optionalText, pageQuery } from './common';
import { insideCampus } from '../config/campus';

const coordinates = z
  .object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) })
  .refine((c) => insideCampus(c.lat, c.lng), { message: 'Location must be inside the campus boundary' });

const eventDate = z.coerce
  .date({ error: 'Enter a valid date' })
  .refine((d) => d.getTime() <= Date.now() + 60_000, 'Event date cannot be in the future')
  .refine((d) => d.getTime() >= Date.now() - 366 * 864e5, 'Event date cannot be older than one year');

const itemFields = {
  title: cleanText(3, 120, 'Title'),
  category: z.enum(CATEGORIES, { error: 'Choose a category' }),
  description: cleanText(20, 2000, 'Description'),
  eventDate,
  locationName: cleanText(2, 160, 'Location name'),
  coordinates,
  distinctiveFeatures: optionalText(500, 'Distinctive features'),
  color: optionalText(40, 'Color'),
  brand: optionalText(60, 'Brand'),
  imageFileIds: z.array(objectId).max(5, 'Maximum 5 images per report').default([]),
};

export const createItemSchema = z
  .object({ reportType: z.enum(REPORT_TYPES), ...itemFields })
  .strict()
  .refine((v) => v.reportType !== 'found' || !!(v.distinctiveFeatures || v.color || v.brand), {
    message: 'Found reports need at least one distinguishing detail (features, color or brand)',
    path: ['distinctiveFeatures'],
  });

export const updateItemSchema = z
  .object({
    ...Object.fromEntries(Object.entries(itemFields).map(([k, v]) => [k, (v as z.ZodType).optional()])),
    version: z.coerce.number().int().min(0, 'version is required'),
    // Admin-only status override (closing stale reports). Ignored/forbidden for students.
    status: z.enum(['open', 'closed']).optional(),
  })
  .strict();

export const listItemsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  type: z.enum(REPORT_TYPES).optional(),
  category: z.enum(CATEGORIES).optional(),
  status: z.enum(ITEM_STATUSES).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  location: z.string().trim().max(100).optional(),
  near: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
    .optional(),
  radius: z.coerce.number().int().min(10).max(5000).optional(),
  includeDeleted: z.enum(['true', 'false']).optional(),
  reportedBy: objectId.optional(),
  sort: z.enum(['newest', 'oldest', 'eventDate', '-eventDate', 'title', 'status']).default('newest'),
  ...pageQuery,
});
