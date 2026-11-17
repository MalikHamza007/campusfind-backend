import { env } from './config/env';
import { connectDb, disconnectDb } from './config/db';
import { storage } from './services/storage';
import { createApp } from './app';

async function main() {
  await storage().init(); // creates the private bucket (0700) and sweeps half-written .part files
  await connectDb();
  if (env.MONGODB_URI === 'memory') {
    // Local convenience: an in-memory database starts empty, so load the seed data automatically.
    const { runSeed } = await import('./scripts/seed');
    await runSeed({ connect: false });
  }
  const app = createApp();
  const server = app.listen(env.PORT, env.HOST, () => console.log(`[api] CampusFind listening on http://${env.HOST}:${env.PORT}/api (${env.NODE_ENV})`));
  const shutdown = async (sig: string) => {
    console.log(`[api] ${sig} received, shutting down`);
    server.close();
    await disconnectDb().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[api] failed to start:', err.message);
  process.exit(1);
});
