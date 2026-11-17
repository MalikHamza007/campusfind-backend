import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:4200,http://127.0.0.1:4200,https://vspark.learn2earntech.com'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  REFRESH_TOKEN_PEPPER: z.string().min(32, 'REFRESH_TOKEN_PEPPER must be at least 32 chars'),
  ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: bool.default(false),
  COOKIE_DOMAIN: z.string().optional().default(''),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  UNIVERSITY_NAME: z.string().default('Green Valley State University'),
  ALLOWED_EMAIL_DOMAINS: z.string().default('campusfind.edu.pk'),
  CAMPUS_BOUNDS: z.string().default('31.4900,74.3000,31.5500,74.4000'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_ROOT: z.string().default('./storage'),
  FILE_LINK_SECRET: z.string().min(32, 'FILE_LINK_SECRET must be at least 32 chars'),
  FILE_LINK_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  S3_ENDPOINT: z.string().optional().default(''),
  S3_REGION: z.string().optional().default('auto'),
  S3_BUCKET: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),

  NOMINATIM_BASE_URL: z.string().url().default('https://nominatim.openstreetmap.org'),
  NOMINATIM_USER_AGENT: z.string().default('CampusFind/1.0 (university lost-and-found)'),
  NOMINATIM_TIMEOUT_MS: z.coerce.number().int().positive().default(6000),
  GEO_CACHE_TTL_HOURS: z.coerce.number().positive().default(72),

  ADMIN_EMAIL: z.string().optional().default(''),
  ADMIN_PASSWORD: z.string().optional().default(''),
  SEED_STUDENT_PASSWORD: z.string().optional().default(''),
  SEED_ALLOW_RESET: bool.default(false),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // Fail fast with a readable message; never print the values themselves.
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

const e = parsed.data;
const [minLat, minLng, maxLat, maxLng] = e.CAMPUS_BOUNDS.split(',').map((n) => Number(n.trim()));

export const env = {
  ...e,
  isProd: e.NODE_ENV === 'production',
  isTest: e.NODE_ENV === 'test',
  corsOrigins: e.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  emailDomains: e.ALLOWED_EMAIL_DOMAINS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  campusBounds: { minLat, minLng, maxLat, maxLng },
};
export type Env = typeof env;
