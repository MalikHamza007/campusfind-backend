import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campusfind-test-'));
Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://placeholder', // replaced by helpers.startDb()
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef0123456789',
  REFRESH_TOKEN_PEPPER: 'test-refresh-pepper-0123456789abcdef012345678',
  FILE_LINK_SECRET: 'test-file-link-secret-0123456789abcdef0123456',
  STORAGE_ROOT: path.join(root, 'bucket'),
  BCRYPT_ROUNDS: '4',
  ALLOWED_EMAIL_DOMAINS: 'campusfind.edu.pk',
  CORS_ORIGINS: 'http://localhost:4200,http://127.0.0.1:4200,https://vspark.learn2earntech.com',
  NOMINATIM_BASE_URL: 'https://nominatim.invalid',
  NOMINATIM_TIMEOUT_MS: '500',
});
