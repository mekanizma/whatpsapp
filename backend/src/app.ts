/**
 * Express application setup
 * Configures middleware, routes, and error handling
 */

import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import apiRoutes from './routes';
import { verifyWebhook, handleWebhook } from './controllers/webhook.controller';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { applyApiRateLimit } from './middleware/rate-limit.middleware';

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

app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});
app.use('/api', applyApiRateLimit);

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
