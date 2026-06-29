/**
 * WhatsApp Worker sunucusu
 * Baileys QR + mesajlaşma — sürekli çalışan process (Railway, Render, VPS)
 *
 * Başlat: npm run worker
 */

import express from 'express';
import { config } from '../config';
import {
  startBaileysQrSession,
  getBaileysSession,
  cancelBaileysSession,
  disconnectBaileys,
  getBaileysConnectionStatus,
  sendBaileysMessage,
  restoreBaileysSessions,
} from '../whatsapp/baileys.manager';

const app = express();
app.use(express.json({ limit: '2mb' }));

function requireWorkerAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const secret = req.headers['x-worker-secret'];
  if (!config.whatsapp.workerSecret || secret !== config.whatsapp.workerSecret) {
    res.status(401).json({ success: false, error: 'Yetkisiz worker isteği' });
    return;
  }
  next();
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'whatsapp-worker',
    timestamp: new Date().toISOString(),
  });
});

app.post('/internal/qr/start', requireWorkerAuth, async (req, res) => {
  try {
    const { companyId, userId } = req.body;
    if (!companyId) {
      res.status(400).json({ success: false, error: 'companyId gerekli' });
      return;
    }
    const session = await startBaileysQrSession(companyId, userId);
    res.json({ success: true, data: session });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'QR başlatılamadı',
    });
  }
});

app.get('/internal/qr/:sessionToken/status', requireWorkerAuth, (req, res) => {
  const companyId = String(req.query.companyId || '');
  const sessionToken = String(req.params.sessionToken);
  const session = getBaileysSession(companyId, sessionToken);
  if (!session) {
    res.status(404).json({ success: false, error: 'Oturum bulunamadı' });
    return;
  }
  res.json({ success: true, data: session });
});

app.post('/internal/qr/cancel', requireWorkerAuth, async (req, res) => {
  try {
    const { companyId, sessionToken } = req.body;
    await cancelBaileysSession(companyId, sessionToken);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'İptal hatası',
    });
  }
});

app.post('/internal/disconnect', requireWorkerAuth, async (req, res) => {
  try {
    await disconnectBaileys(req.body.companyId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'Bağlantı kesilemedi',
    });
  }
});

app.get('/internal/status/:companyId', requireWorkerAuth, (req, res) => {
  const companyId = String(req.params.companyId);
  const status = getBaileysConnectionStatus(companyId);
  res.json({ success: true, data: status });
});

app.post('/internal/send', requireWorkerAuth, async (req, res) => {
  try {
    const { companyId, toPhone, message } = req.body;
    const result = await sendBaileysMessage(companyId, toPhone, message);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'Gönderim hatası',
    });
  }
});

const port = parseInt(process.env.PORT || process.env.WORKER_PORT || '3002', 10);

app.listen(port, '0.0.0.0', async () => {
  console.log(`📲 WhatsApp Worker port ${port}`);
  console.log(`🔧 Ortam: ${config.nodeEnv}`);

  try {
    await restoreBaileysSessions();
    console.log('✅ Baileys oturumları yüklendi');
  } catch (err) {
    console.error('Oturum yükleme hatası:', err);
  }
});
