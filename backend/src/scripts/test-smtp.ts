/**
 * SMTP bağlantı ve gönderim testi
 * Kullanım: npx tsx src/scripts/test-smtp.ts [alici@email.com]
 */

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import net from 'net';
import tls from 'tls';

dotenv.config();

const host = process.env.SMTP_HOST?.trim() || '';
const user = process.env.SMTP_USER?.trim() || '';
const pass = process.env.SMTP_PASS || '';
const to = (process.argv[2] || process.env.ADMIN_NOTIFY_EMAILS || 'info@mekanizma.com')
  .split(',')[0]
  .trim()
  .toLowerCase();

async function probePort(port: number, secure: boolean): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      socket.destroy();
      console.log(`  port ${port} (${secure ? 'SSL' : 'plain'}): TIMEOUT`);
      resolve();
    }, 8000);

    const onConnect = () => {
      clearTimeout(timeout);
      console.log(`  port ${port} (${secure ? 'SSL' : 'plain'}): OPEN`);
      socket.destroy();
      resolve();
    };

    const socket = secure
      ? tls.connect({ host, port, servername: host, rejectUnauthorized: false }, onConnect)
      : net.connect({ host, port }, onConnect);

    socket.on('error', (err) => {
      clearTimeout(timeout);
      console.log(`  port ${port} (${secure ? 'SSL' : 'plain'}): ${err.message}`);
      resolve();
    });
  });
}

async function trySend(label: string, options: nodemailer.TransportOptions): Promise<boolean> {
  console.log(`\n--- ${label} ---`);
  const transport = nodemailer.createTransport({
    ...options,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  try {
    const verified = await transport.verify();
    console.log('verify:', verified ? 'OK' : 'failed');

    const info = await transport.sendMail({
      from: `"Waai Sistem" <${user}>`,
      to,
      subject: `Waai SMTP test (${label}) ${new Date().toLocaleString('tr-TR')}`,
      text: `Test e-postası — ${label}\nZaman: ${new Date().toISOString()}`,
      html: `<p>Test e-postası — <strong>${label}</strong></p><p>Zaman: ${new Date().toLocaleString('tr-TR')}</p>`,
    });

    console.log('messageId:', info.messageId);
    console.log('response:', info.response);
    console.log('accepted:', JSON.stringify(info.accepted));
    console.log('rejected:', JSON.stringify(info.rejected));
    return (info.accepted?.length || 0) > 0;
  } catch (err) {
    const e = err as Error & { code?: string; response?: string; responseCode?: number };
    console.error('HATA:', e.message);
    if (e.code) console.error('code:', e.code);
    if (e.response) console.error('smtp response:', e.response);
    if (e.responseCode) console.error('smtp code:', e.responseCode);
    return false;
  } finally {
    transport.close();
  }
}

async function main(): Promise<void> {
  console.log('SMTP host:', host);
  console.log('SMTP user:', user);
  console.log('Alıcı:', to);

  if (!host || !user || !pass) {
    console.error('SMTP_HOST, SMTP_USER, SMTP_PASS gerekli');
    process.exit(1);
  }

  console.log('\nPort taraması:');
  await probePort(465, true);
  await probePort(587, false);
  await probePort(25, false);

  const attempts: Array<[string, nodemailer.TransportOptions]> = [
    [
      '465 SSL',
      { host, port: 465, secure: true, auth: { user, pass }, tls: { servername: host } },
    ],
    [
      '587 STARTTLS',
      {
        host,
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user, pass },
        tls: { servername: host },
      },
    ],
  ];

  for (const [label, opts] of attempts) {
    const ok = await trySend(label, opts);
    if (ok) {
      console.log(`\n✓ Gönderim başarılı (${label}) → ${to}`);
      return;
    }
  }

  console.error('\n✗ Hiçbir yöntemle gönderilemedi');
  process.exit(1);
}

void main();
