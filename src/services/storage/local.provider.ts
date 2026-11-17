import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { StorageProvider, StoredObjectStat } from './provider';

/**
 * Private bucket on the VPS disk. STORAGE_ROOT lives outside the repo and any web root, mode 0700.
 * Keys look like files/2026/11/<uuid>; no user-supplied names ever reach the disk.
 */
export class LocalBucketProvider implements StorageProvider {
  readonly driver = 'local' as const;
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolveKey(key: string): string {
    if (!/^[a-z0-9/_-]+$/i.test(key) || key.includes('..')) throw new Error('Invalid storage key');
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error('Storage key escapes bucket root');
    return full;
  }

  async init(): Promise<void> {
    await fsp.mkdir(this.root, { recursive: true, mode: 0o700 });
    await fsp.chmod(this.root, 0o700).catch(() => undefined);
    await this.sweepPartials();
  }

  /** Remove `.part` files left behind by a crash mid-upload. */
  async sweepPartials(): Promise<number> {
    let removed = 0;
    const walk = async (dir: string): Promise<void> => {
      const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else if (e.name.endsWith('.part')) {
          await fsp.rm(p, { force: true });
          removed++;
        }
      }
    };
    await walk(this.root);
    return removed;
  }

  /** Destructive: remove every object (used only by the seed reset). */
  async clear(): Promise<void> {
    await fsp.rm(path.join(this.root, 'files'), { recursive: true, force: true });
  }

  async put(key: string, body: Buffer): Promise<void> {
    const full = this.resolveKey(key);
    await fsp.mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
    const part = `${full}.part`;
    try {
      // 'wx' = write-once: never overwrite an existing object.
      await fsp.writeFile(part, body, { flag: 'wx', mode: 0o600 });
      await fsp.rename(part, full);
    } catch (err) {
      await fsp.rm(part, { force: true });
      throw err;
    }
  }

  async get(key: string): Promise<Readable> {
    const full = this.resolveKey(key);
    await fsp.access(full);
    return fs.createReadStream(full);
  }

  async stat(key: string): Promise<StoredObjectStat | null> {
    try {
      const s = await fsp.stat(this.resolveKey(key));
      return { size: s.size, modifiedAt: s.mtime };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await fsp.rm(this.resolveKey(key), { force: true });
  }

  async usage(): Promise<{ objects: number; bytes: number }> {
    let objects = 0;
    let bytes = 0;
    const walk = async (dir: string): Promise<void> => {
      const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else if (!e.name.endsWith('.part')) {
          objects++;
          bytes += (await fsp.stat(p)).size;
        }
      }
    };
    await walk(this.root);
    return { objects, bytes };
  }
}
