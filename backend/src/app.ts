/**
 * Express application setup
 * Configures middleware, routes, and error handling
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import apiRoutes from './routes';
import { verifyWebhook, handleWebhook } from './controllers/webhook.controller';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

const app = express();

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || (config.isDev && /^http:\/\/localhost:\d+$/.test(origin))) {
      callback(null, true);
    } else if (origin === config.cors.origin) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isDev ? 1000 : 100,
  message: { success: false, error: 'Çok fazla istek gönderildi' },
});
app.use('/api', limiter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/webhook/whatsapp', verifyWebhook);
app.post('/webhook/whatsapp', handleWebhook);

app.use('/api/v1', apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
