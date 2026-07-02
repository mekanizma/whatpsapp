/**
 * Express application setup
 * Configures middleware, routes, and error handling
 */

import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import apiRoutes from './routes';
import { verifyWebhook, handleWebhook } from './controllers/webhook.controller';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

const app = express();

// API yanıtlarında ETag/304 önbelleği frontend JSON parse hatalarına yol açar
app.set('etag', false);

if (!config.isDev) {
  app.set('trust proxy', 1);
}

app.use(helmet({
  contentSecurityPolicy: config.serveFrontend ? false : undefined,
}));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (config.isDev && /^http:\/\/localhost:\d+$/.test(origin)) {
      callback(null, true);
      return;
    }
    if (config.cors.origins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('CORS not allowed'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

/** QR / durum sorguları sık poll edilir — genel API limitine dahil edilmez */
function isLightPollingRequest(req: express.Request): boolean {
  const path = (req.path || req.url?.split('?')[0] || '').replace(/\/+$/, '');
  return (
    /^\/v1\/whatsapp\/qr\/[^/]+\/status$/.test(path) ||
    /^\/v1\/whatsapp\/status$/.test(path)
  );
}

const pollingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isDev ? 5000 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Çok fazla istek gönderildi' },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isDev ? 2000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isLightPollingRequest(req),
  message: { success: false, error: 'Çok fazla istek gönderildi' },
});

app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});
app.use('/api', (req, res, next) => {
  if (isLightPollingRequest(req)) {
    pollingLimiter(req, res, next);
    return;
  }
  apiLimiter(req, res, next);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/webhook/whatsapp', verifyWebhook);
app.post('/webhook/whatsapp', handleWebhook);

app.use('/api/v1', apiRoutes);

if (config.serveFrontend) {
  const frontendDist = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist, { index: false, maxAge: '1d' }));
    app.get('*', (req, res, next) => {
      if (
        req.path.startsWith('/api') ||
        req.path.startsWith('/webhook') ||
        req.path === '/health'
      ) {
        next();
        return;
      }
      res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
        if (err) next(err);
      });
    });
  }
}

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
