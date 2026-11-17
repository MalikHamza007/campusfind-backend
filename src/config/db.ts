import mongoose from 'mongoose';
import { env } from './env';

let memoryServer: { stop: () => Promise<unknown>; getUri: () => string } | null = null;

export async function connectDb(uri = env.MONGODB_URI): Promise<void> {
  mongoose.set('strictQuery', true);
  let target = uri;
  if (uri === 'memory') {
    if (env.isProd) throw new Error('MONGODB_URI=memory is not allowed in production');
    // Local convenience only: an in-memory replica set (transactions need a replica set).
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    const rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    memoryServer = rs;
    target = rs.getUri('campusfind');
    console.log('[db] using in-memory replica set (data is not persisted)');
  }
  await mongoose.connect(target, { serverSelectionTimeoutMS: 10000 });
  await mongoose.connection.syncIndexes();
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}

export function dbState(): 'up' | 'down' | 'connecting' {
  const s = mongoose.connection.readyState;
  return s === 1 ? 'up' : s === 2 ? 'connecting' : 'down';
}
