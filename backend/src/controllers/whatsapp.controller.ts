/**
 * WhatsApp configuration controller
 */

import { Response } from 'express';
import { config } from '../config';
import { adminClient } from '../database/supabase';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendTestMessage, sendMessageToCustomer } from '../whatsapp/whatsapp.service';
import {
  startQrSession,
  getQrSessionStatus,
  cancelQrSession,
  getBaileysConnectionStatus,
  disconnectBaileys,
  isWhatsAppWorkerEnabled,
} from '../whatsapp/qr.service';
import { logActivity } from '../services/log.service';

export async function getWhatsAppConfig(req: AuthRequest, res: Response): Promise<void> {
  if (config.demoMode) {
    res.json({
      success: true,
      data: {
        id: 'demo-wa',
        company_id: req.companyId,
        phone_number: '+905551234567',
        business_account_id: null,
        status: 'disconnected',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
    return;
  }

  const { data, error } = await adminClient
    .from('whatsapp_configs')
    .select('id, company_id, phone_number, business_account_id, status, created_at, updated_at')
    .eq('company_id', req.companyId)
    .single();

  if (error) {
    res.status(404).json({ success: false, error: 'WhatsApp yapılandırması bulunamadı' });
    return;
  }

  res.json({ success: true, data });
}

export async function updateWhatsAppConfig(req: AuthRequest, res: Response): Promise<void> {
  const { phone_number, business_account_id, access_token, webhook_verify_token } = req.body;

  const { data, error } = await adminClient
    .from('whatsapp_configs')
    .update({
      phone_number,
      business_account_id,
      access_token,
      webhook_verify_token,
      status: access_token ? 'connected' : 'disconnected',
    })
    .eq('company_id', req.companyId)
    .select('id, company_id, phone_number, business_account_id, status, created_at, updated_at')
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  await logActivity({
    userId: req.userId,
    companyId: req.companyId,
    action: 'whatsapp_config_updated',
    entityType: 'whatsapp_config',
    entityId: data.id,
  });

  res.json({ success: true, data });
}

export async function sendTest(req: AuthRequest, res: Response): Promise<void> {
  const { to_phone, message } = req.body;

  if (!to_phone || !message) {
    res.status(400).json({ success: false, error: 'Telefon numarası ve mesaj gerekli' });
    return;
  }

  const result = await sendTestMessage(req.companyId!, to_phone, message);

  if (!result.success) {
    res.status(400).json({ success: false, error: result.error || 'Mesaj gönderilemedi' });
    return;
  }

  res.json({ success: true, data: { sent: true }, message: 'Test mesajı gönderildi' });
}

export async function getWhatsAppStatus(req: AuthRequest, res: Response): Promise<void> {
  const companyId = req.companyId!;
  const baileys = await getBaileysConnectionStatus(companyId);

  if (baileys.connected) {
    res.json({
      success: true,
      data: {
        status: 'connected',
        phone_number: baileys.phone,
        is_configured: true,
        connection_type: 'qr',
        display_name: baileys.displayName,
      },
    });
    return;
  }

  if (config.demoMode) {
    res.json({
      success: true,
      data: {
        status: 'disconnected',
        phone_number: null,
        is_configured: false,
        connection_type: null,
      },
    });
    return;
  }

  const { data } = await adminClient
    .from('whatsapp_configs')
    .select('status, phone_number, business_account_id, access_token')
    .eq('company_id', companyId)
    .single();

  const isBaileys = data?.business_account_id?.startsWith('baileys:');
  const isCloudApi = !!(data?.access_token && data?.business_account_id && !isBaileys);

  res.json({
    success: true,
    data: {
      status: data?.status || 'disconnected',
      phone_number: data?.phone_number,
      is_configured: isBaileys || isCloudApi,
      connection_type: isBaileys ? 'qr' : isCloudApi ? 'api' : null,
    },
  });
}

export async function startQr(req: AuthRequest, res: Response): Promise<void> {
  if (config.isVercel && !isWhatsAppWorkerEnabled()) {
    res.status(503).json({
      success: false,
      error:
        'WhatsApp için Worker servisi gerekli. WHATSAPP_WORKER_URL ayarlayın — docs/WHATSAPP-WORKER.md',
    });
    return;
  }
  try {
    const session = await startQrSession(req.companyId!, req.userId);
    res.json({ success: true, data: session });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'QR başlatılamadı' });
  }
}

export async function getQrStatus(req: AuthRequest, res: Response): Promise<void> {
  const { sessionToken } = req.params;
  const session = await getQrSessionStatus(req.companyId!, sessionToken as string);

  if (!session) {
    res.status(404).json({ success: false, error: 'QR oturumu bulunamadı' });
    return;
  }

  res.json({ success: true, data: session });
}

export async function cancelQr(req: AuthRequest, res: Response): Promise<void> {
  await cancelQrSession(req.companyId!, req.params.sessionToken as string);
  res.json({ success: true, message: 'QR oturumu iptal edildi' });
}

export async function disconnectWhatsApp(req: AuthRequest, res: Response): Promise<void> {
  await disconnectBaileys(req.companyId!);

  if (!config.demoMode) {
    await adminClient
      .from('whatsapp_configs')
      .update({ status: 'disconnected', access_token: null, phone_number: null, business_account_id: null })
      .eq('company_id', req.companyId);
  }

  res.json({ success: true, message: 'WhatsApp bağlantısı kesildi' });
}
