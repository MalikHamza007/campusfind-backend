import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { dbState } from './config/db';
import { corsGuard, corsMiddleware } from './middlewares/cors';
import { apiLimiter } from './middlewares/rateLimit';
import { errorHandler, notFound } from './middlewares/error';
import { router } from './routes';

export function createApp() {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(corsGuard);
  app.use(corsMiddleware);
  if (!env.isTest) app.use(morgan(env.isProd ? 'combined' : 'dev'));
  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    const db = dbState();
    res.status(db === 'up' ? 200 : 503).json({ status: db === 'up' ? 'ok' : 'degraded', db, uptime: Math.round(process.uptime()), time: new Date().toISOString() });
  });
  app.use('/api', apiLimiter, router);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
