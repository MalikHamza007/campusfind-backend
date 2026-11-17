import { z } from 'zod';
import { FILE_PURPOSES } from '../models/FileObject';
import { objectId, pageQuery } from './common';

export const uploadSchema = z.object({ purpose: z.enum(FILE_PURPOSES, { error: 'purpose must be item_image, claim_evidence or avatar' }) });
export const listFilesQuery = z.object({ purpose: z.enum(FILE_PURPOSES).optional(), all: z.enum(['true', 'false']).optional(), ...pageQuery });
export const linkSchema = z.object({ entityType: z.enum(['item', 'claim', 'user']), entityId: objectId }).strict();
