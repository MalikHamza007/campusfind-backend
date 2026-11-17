import { Readable } from 'node:stream';

export interface StoredObjectStat { size: number; modifiedAt: Date }

/** Bucket-style object store. Controllers only ever talk to this interface — never to the filesystem. */
export interface StorageProvider {
  readonly driver: 'local' | 's3';
  /** Write-once put. Implementations must be atomic: a failed write leaves nothing behind. */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Readable>;
  stat(key: string): Promise<StoredObjectStat | null>;
  /** Idempotent: deleting a missing object is not an error. */
  delete(key: string): Promise<void>;
  /** Startup maintenance (e.g. sweep half-written objects). */
  init(): Promise<void>;
  usage(): Promise<{ objects: number; bytes: number }>;
}
