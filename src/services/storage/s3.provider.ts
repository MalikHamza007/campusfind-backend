import { Readable } from 'node:stream';
import { StorageProvider, StoredObjectStat } from './provider';
import { env } from '../../config/env';

/**
 * Optional S3-compatible driver (MinIO on the VPS, Cloudflare R2, AWS S3). Enable with STORAGE_DRIVER=s3
 * after `npm i @aws-sdk/client-s3`. The bucket must be PRIVATE — objects are still only served through
 * the API's 60-second signed links.
 */
export class S3BucketProvider implements StorageProvider {
  readonly driver = 's3' as const;
  private sdk: any;
  private client: any;

  async init(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.sdk = require('@aws-sdk/client-s3');
    } catch {
      throw new Error('STORAGE_DRIVER=s3 requires `npm i @aws-sdk/client-s3`');
    }
    this.client = new this.sdk.S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT || undefined,
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    });
  }
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new this.sdk.PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType, IfNoneMatch: '*' }));
  }
  async get(key: string): Promise<Readable> {
    const out = await this.client.send(new this.sdk.GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return out.Body as Readable;
  }
  async stat(key: string): Promise<StoredObjectStat | null> {
    try {
      const out = await this.client.send(new this.sdk.HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
      return { size: out.ContentLength ?? 0, modifiedAt: out.LastModified ?? new Date() };
    } catch {
      return null;
    }
  }
  async delete(key: string): Promise<void> {
    await this.client.send(new this.sdk.DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  }
  async usage() {
    return { objects: -1, bytes: -1 };
  }
}
