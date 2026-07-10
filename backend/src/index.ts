/**
 * Server entry point
 * Production (Coolify): API + frontend + Baileys QR aynı süreçte çalışır
 */

import app from './app';
import { config } from './config';
import {
  restoreBaileysSessions,
  verifySessionsDirWritable,
  isSessionsDirVolumeMounted,
} from './whatsapp/qr.service';
import { recoverPendingKnowledgeIndexing } from './services/knowledge-index.service';
import { startResponseCacheCleanupSchedule } from './ai/ai-cache.service';
import { startActionCenterEmailSchedule } from './services/admin-action-center-email.service';
import { resolveAdminNotifyEmails } from './services/admin-email-notification.service';
import { isEmailConfigured } from './services/email.service';

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  process.exit(1);
});

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${config.port}`);
  console.log(`📱 WhatsApp webhook: ${config.publicUrl || `http://localhost:${config.port}`}/webhook/whatsapp`);
  console.log(`🔧 Environment: ${config.nodeEnv}`);
  if (config.isCoolify) console.log('☁️  Platform: Coolify');

  startResponseCacheCleanupSchedule();
  startActionCenterEmailSchedule();

  if (!isEmailConfigured()) {
    console.warn(
      '[Email] SMTP yapılandırılmamış — admin bildirim e-postaları gönderilmeyecek. ' +
        'SMTP_HOST, SMTP_USER, SMTP_PASS ve SMTP_FROM ayarlayın.'
    );
  } else {
    void resolveAdminNotifyEmails()
      .then((recipients) => {
        console.log(`[Email] SMTP aktif — bildirim alıcıları: ${recipients.join(', ')}`);
      })
      .catch((err) => {
        console.error('[Email] Bildirim alıcıları okunamadı:', err);
      });
  }

  // Ağır işleri health check sonrasına ertele (OOM / restart döngüsünü önler)
  setTimeout(() => {
    void runDeferredStartup();
  }, 3000);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  console.error('[FATAL] Server listen error:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} kullanımda. Coolify Port Exposes ayarını kontrol edin.`);
  }
  process.exit(1);
});

async function runDeferredStartup(): Promise<void> {
  try {
    await recoverPendingKnowledgeIndexing();
  } catch (err) {
    console.error('RAG indeks kurtarma hatası:', err);
  }

  if (!config.isVercel) {
    const sessionsCheck = verifySessionsDirWritable();
    if (sessionsCheck.ok) {
      const volumeMounted = isSessionsDirVolumeMounted(sessionsCheck.path);
      if (volumeMounted) {
        console.log(`📂 Sessions dizini hazır (kalıcı volume): ${sessionsCheck.path}`);
      } else if (config.nodeEnv === 'production' && config.isCoolify) {
        console.error(
          `❌ KRİTİK: ${sessionsCheck.path} kalıcı volume olarak mount edilmemiş — ` +
            'sunucu restart/deploy sonrası tüm WhatsApp hatları kopar. ' +
            'Coolify → Storages → Destination: /data/sessions, SESSIONS_DIR=/data/sessions'
        );
      } else {
        console.warn(`⚠️ Sessions dizini yazılabilir ama kalıcı volume değil: ${sessionsCheck.path}`);
      }
    } else {
      console.error(
        `❌ Sessions dizini yazılamıyor: ${sessionsCheck.path} — ${sessionsCheck.error}. ` +
          'Coolify → Storages → /data/sessions mount edin ve SESSIONS_DIR=/data/sessions ayarlayın.'
      );
    }

    try {
      await restoreBaileysSessions();
      console.log('📲 Baileys oturumları kontrol edildi');
    } catch (err) {
      console.error('Baileys oturum yükleme hatası:', err);
    }
  }
}
