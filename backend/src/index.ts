/**
 * Server entry point
 * Starts the Express application
 */

import app from './app';
import { config } from './config';
import { restoreBaileysSessions } from './whatsapp/qr.service';

app.listen(config.port, '0.0.0.0', async () => {
  console.log(`🚀 Server running on port ${config.port}`);
  console.log(`📱 WhatsApp webhook: http://localhost:${config.port}/webhook/whatsapp`);
  console.log(`🔧 Environment: ${config.nodeEnv}`);

  try {
    await restoreBaileysSessions();
    console.log('📲 Baileys oturumları kontrol edildi');
  } catch (err) {
    console.error('Baileys oturum yükleme hatası:', err);
  }
});
