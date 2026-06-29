/**
 * Server entry point
 * Production (Render): API + frontend + Baileys QR aynı süreçte çalışır
 */

import app from './app';
import { config } from './config';
import { restoreBaileysSessions } from './whatsapp/qr.service';

app.listen(config.port, '0.0.0.0', async () => {
  console.log(`🚀 Server running on port ${config.port}`);
  console.log(`📱 WhatsApp webhook: ${config.publicUrl || `http://localhost:${config.port}`}/webhook/whatsapp`);
  console.log(`🔧 Environment: ${config.nodeEnv}`);
  if (config.isRender) console.log('☁️  Platform: Render');

  if (!config.isVercel) {
    try {
      await restoreBaileysSessions();
      console.log('📲 Baileys oturumları kontrol edildi');
    } catch (err) {
      console.error('Baileys oturum yükleme hatası:', err);
    }
  }
});
