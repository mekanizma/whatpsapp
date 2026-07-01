/**
 * Server entry point
 * Production (Coolify): API + frontend + Baileys QR aynı süreçte çalışır
 */

import app from './app';
import { config } from './config';
import { restoreBaileysSessions } from './whatsapp/qr.service';
import { recoverPendingKnowledgeIndexing } from './services/knowledge-index.service';

app.listen(config.port, '0.0.0.0', async () => {
  console.log(`🚀 Server running on port ${config.port}`);
  console.log(`📱 WhatsApp webhook: ${config.publicUrl || `http://localhost:${config.port}`}/webhook/whatsapp`);
  console.log(`🔧 Environment: ${config.nodeEnv}`);
  if (config.isCoolify) console.log('☁️  Platform: Coolify');

  try {
    await recoverPendingKnowledgeIndexing();
  } catch (err) {
    console.error('RAG indeks kurtarma hatası:', err);
  }

  if (!config.isVercel) {
    try {
      await restoreBaileysSessions();
      console.log('📲 Baileys oturumları kontrol edildi');
    } catch (err) {
      console.error('Baileys oturum yükleme hatası:', err);
    }
  }
});
