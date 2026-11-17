import { env } from '../../config/env';
import { StorageProvider } from './provider';
import { LocalBucketProvider } from './local.provider';
import { S3BucketProvider } from './s3.provider';

let instance: StorageProvider | null = null;

export function storage(): StorageProvider {
  if (!instance) instance = env.STORAGE_DRIVER === 's3' ? new S3BucketProvider() : new LocalBucketProvider(env.STORAGE_ROOT);
  return instance;
}
/** Tests swap the provider (e.g. a temp dir or a failing fake). */
export function setStorage(p: StorageProvider | null) {
  instance = p;
}
export type { StorageProvider } from './provider';
