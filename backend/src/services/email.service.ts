/**
 * SMTP e-posta gönderimi
 */

import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';
import { config } from '../config';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!config.smtp.enabled) return null;

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: config.smtp.host ? { servername: config.smtp.host } : undefined,
    });
  }

  return transporter;
}

export function isEmailConfigured(): boolean {
  return config.smtp.enabled;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const transport = getTransporter();
  if (!transport) {
    console.warn('[Email] SMTP yapılandırılmamış — e-posta atlandı');
    return false;
  }

  const recipients = (Array.isArray(input.to) ? input.to : [input.to]).filter(Boolean);
  if (!recipients.length) {
    console.warn('[Email] Alıcı yok — e-posta atlandı');
    return false;
  }

  const from = config.smtp.fromName
    ? `"${config.smtp.fromName}" <${config.smtp.from}>`
    : config.smtp.from;

  const mail: Mail.Options = {
    from,
    to: recipients.join(', '),
    subject: input.subject,
    html: input.html,
    text: input.text,
  };

  try {
    await transport.sendMail(mail);
    console.log(`[Email] Gönderildi → ${recipients.join(', ')} | ${input.subject}`);
    return true;
  } catch (err) {
    console.error('[Email] Gönderim hatası:', err instanceof Error ? err.message : err);
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildMobileEmailHtml(options: {
  title: string;
  intro?: string;
  rows: Array<{ label: string; value: string }>;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const rowsHtml = options.rows
    .map(
      (row) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px;width:38%;vertical-align:top;">${escapeHtml(row.label)}</td>
          <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;vertical-align:top;">${escapeHtml(row.value)}</td>
        </tr>`
    )
    .join('');

  const ctaHtml =
    options.ctaLabel && options.ctaUrl
      ? `
        <p style="margin:24px 0 0;text-align:center;">
          <a href="${escapeHtml(options.ctaUrl)}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;font-weight:600;">
            ${escapeHtml(options.ctaLabel)}
          </a>
        </p>`
      : '';

  const introHtml = options.intro
    ? `<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.5;">${escapeHtml(options.intro)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(options.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:16px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:24px 20px;">
          <tr>
            <td>
              <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#111827;">${escapeHtml(options.title)}</h1>
              ${introHtml}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                ${rowsHtml}
              </table>
              ${ctaHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
