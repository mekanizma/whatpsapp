/**
 * WhatsApp configuration & multi-account controller
 */

import { Response } from 'express';
import { config } from '../config';
import { AuthRequest, isDemoSession } from '../middleware/auth.middleware';
import { sendTestMessage, disconnectAccount } from '../whatsapp/whatsapp.service';
import {
  startQrSession,
  getQrSessionStatus,
  cancelQrSession,
  getBaileysConnectionStatus,
  isBaileysReconnecting,
} from '../whatsapp/qr.service';
import { logActivity } from '../services/log.service';
import {
  listWhatsAppAccounts,
  createWhatsAppAccount,
  updateWhatsAppAccount,
  deleteWhatsAppAccount,
  getWhatsAppAccount,
  getDefaultWhatsAppAccount,
  getCompanyPlanType,
  getWhatsAppLineLimit,
  countWhatsAppAccounts,
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from '../services/whatsapp-account.service';

async function ensureDefaultAccount(companyId: string) {
  const existing = await getDefaultWhatsAppAccount(companyId);
  if (existing) return existing;
  return createWhatsAppAccount(companyId);
}

async function enrichAccountStatus(
  account: Awaited<ReturnType<typeof listWhatsAppAccounts>>[number]
) {
  const live = await getBaileysConnectionStatus(account.id);
  const reconnecting = isBaileysReconnecting(account.id);
  const liveStatus = live.connected
    ? 'connected'
    : reconnecting
      ? 'reconnecting'
      : account.status;

  return {
    ...account,
    status: liveStatus,
    live_connected: live.connected,
    reconnecting,
    profile_name: live.displayName || account.profile_name,
    phone_number: live.phone || account.phone_number,
  };
}

// ─── Multi-account endpoints ───────────────────────────────────────────────

export async function listAccounts(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.json({
      success: true,
      data: {
        accounts: [{
          id: 'demo-wa',
          company_id: req.companyId,
          label: 'Demo WhatsApp',
          phone_number: '+905551234567',
          profile_name: null,
          status: 'disconnected',
          is_active: true,
          is_default: true,
          departments: [],
          connection_type: null,
        }],
        limit: 1,
        used: 1,
        plan_type: 'starter',
        supports_qr: false,
        supports_cloud_api: true,
      },
    });
    return;
  }

  const companyId = req.companyId!;
  const [accounts, planType] = await Promise.all([
    listWhatsAppAccounts(companyId),
    getCompanyPlanType(companyId),
  ]);

  const enriched = await Promise.all(
    accounts.map(async (account) => {
      if (account.connection_type === 'qr') {
        return enrichAccountStatus(account);
      }
      return { ...account, live_connected: account.status === 'connected', reconnecting: false };
    })
  );

  const safeAccounts = enriched.map((account) => ({
    ...account,
    business_account_id:
      account.connection_type === 'api' ? account.business_account_id : null,
  }));

  const listPayload: Record<string, unknown> = {
    accounts: safeAccounts,
    limit: getWhatsAppLineLimit(planType),
    used: accounts.length,
    plan_type: planType,
    supports_qr: !config.isVercel,
    supports_cloud_api: true,
    webhook_url: config.publicUrl ? `${config.publicUrl}/webhook/whatsapp` : null,
  };

  if (req.role === 'company_admin' || req.role === 'super_admin') {
    listPayload.webhook_verify_token = config.whatsapp.verifyToken;
  }

  res.json({ success: true, data: listPayload });
}

export async function createAccount(req: AuthRequest, res: Response): Promise<void> {
  try {
    const account = await createWhatsAppAccount(req.companyId!, req.body.label);
    await logActivity({
      userId: req.userId,
      companyId: req.companyId,
      action: 'whatsapp_account_created',
      entityType: 'whatsapp_account',
      entityId: account.id,
    });
    res.status(201).json({ success: true, data: account });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hesap oluşturulamadı' });
  }
}

export async function updateAccount(req: AuthRequest, res: Response): Promise<void> {
  const accountId = req.params.accountId as string;
  const { label, is_active, is_default, department_ids } = req.body;

  try {
    const account = await updateWhatsAppAccount(req.companyId!, accountId, {
      label,
      is_active,
      is_default,
      department_ids,
    });
    await logActivity({
      userId: req.userId,
      companyId: req.companyId,
      action: 'whatsapp_account_updated',
      entityType: 'whatsapp_account',
      entityId: accountId,
    });
    res.json({ success: true, data: account });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Güncellenemedi' });
  }
}

export async function removeAccount(req: AuthRequest, res: Response): Promise<void> {
  const accountId = req.params.accountId as string;
  try {
    const account = await getWhatsAppAccount(req.companyId!, accountId);
    if (!account) {
      res.status(404).json({ success: false, error: 'WhatsApp hesabı bulunamadı' });
      return;
    }
    await disconnectAccount(accountId, req.companyId!);
    await deleteWhatsAppAccount(req.companyId!, accountId);
    await logActivity({
      userId: req.userId,
      companyId: req.companyId,
      action: 'whatsapp_account_deleted',
      entityType: 'whatsapp_account',
      entityId: accountId,
    });
    res.json({ success: true, message: 'WhatsApp hesabı silindi' });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Silinemedi' });
  }
}

export async function getAccountStatus(req: AuthRequest, res: Response): Promise<void> {
  const accountId = req.params.accountId as string;
  const account = await getWhatsAppAccount(req.companyId!, accountId);
  if (!account) {
    res.status(404).json({ success: false, error: 'WhatsApp hesabı bulunamadı' });
    return;
  }

  const isBaileys = account.business_account_id?.startsWith('baileys:');
  const isCloudApi = !!(account.access_token && account.business_account_id && !isBaileys);

  if (isBaileys) {
    const baileys = await getBaileysConnectionStatus(accountId);
    const reconnecting = isBaileysReconnecting(accountId);
    res.json({
      success: true,
      data: {
        status: baileys.connected ? 'connected' : reconnecting ? 'reconnecting' : account.status,
        phone_number: baileys.phone || account.phone_number,
        profile_name: baileys.displayName || account.profile_name,
        is_configured: true,
        connection_type: 'qr',
        reconnecting,
        is_active: account.is_active,
        last_synced_at: account.last_synced_at,
      },
    });
    return;
  }

  res.json({
    success: true,
    data: {
      status: account.status,
      phone_number: account.phone_number,
      profile_name: account.profile_name,
      is_configured: isCloudApi,
      connection_type: isCloudApi ? 'api' : null,
      reconnecting: false,
      is_active: account.is_active,
      last_synced_at: account.last_synced_at,
    },
  });
}

export async function startAccountQr(req: AuthRequest, res: Response): Promise<void> {
  if (config.isVercel) {
    res.status(400).json({
      success: false,
      error: 'Vercel ortamında Meta WhatsApp Cloud API kullanın.',
    });
    return;
  }

  const accountId = req.params.accountId as string;
  const account = await getWhatsAppAccount(req.companyId!, accountId);
  if (!account) {
    res.status(404).json({ success: false, error: 'WhatsApp hesabı bulunamadı' });
    return;
  }

  const isCloudApi =
    !!account.access_token &&
    !!account.business_account_id &&
    !account.business_account_id.startsWith('baileys:');
  if (isCloudApi) {
    res.status(400).json({
      success: false,
      error: 'Bu hat Meta Cloud API ile bağlı. QR kullanmak için önce Cloud API bağlantısını kesin.',
    });
    return;
  }

  try {
    const session = await startQrSession(accountId, req.companyId!, req.userId);
    res.json({ success: true, data: session });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'QR başlatılamadı' });
  }
}

export async function getAccountQrStatus(req: AuthRequest, res: Response): Promise<void> {
  const accountId = req.params.accountId as string;
  const { sessionToken } = req.params;
  const session = await getQrSessionStatus(req.companyId!, accountId, sessionToken as string);

  if (!session) {
    res.status(404).json({ success: false, error: 'QR oturumu bulunamadı' });
    return;
  }

  res.json({ success: true, data: session });
}

export async function cancelAccountQr(req: AuthRequest, res: Response): Promise<void> {
  const accountId = req.params.accountId as string;
  await cancelQrSession(accountId, req.companyId!, req.params.sessionToken as string);
  res.json({ success: true, message: 'QR oturumu iptal edildi' });
}

export async function disconnectAccountHandler(req: AuthRequest, res: Response): Promise<void> {
  const accountId = req.params.accountId as string;
  const account = await getWhatsAppAccount(req.companyId!, accountId);
  if (!account) {
    res.status(404).json({ success: false, error: 'WhatsApp hesabı bulunamadı' });
    return;
  }

  await disconnectAccount(accountId, req.companyId!);
  await logActivity({
    userId: req.userId,
    companyId: req.companyId,
    action: 'whatsapp_disconnected',
    entityType: 'whatsapp_account',
    entityId: accountId,
  });
  res.json({ success: true, message: 'WhatsApp bağlantısı kesildi' });
}

export async function updateAccountCloudConfig(req: AuthRequest, res: Response): Promise<void> {
  const accountId = req.params.accountId as string;
  const companyId = req.companyId!;
  const { phone_number, business_account_id, access_token, webhook_verify_token } = req.body;

  const existing = await getWhatsAppAccount(companyId, accountId);
  if (!existing) {
    res.status(404).json({ success: false, error: 'WhatsApp hesabı bulunamadı' });
    return;
  }

  const trimmedPhone = typeof phone_number === 'string' ? phone_number.trim() : '';
  const trimmedPhoneNumberId =
    typeof business_account_id === 'string' ? business_account_id.trim() : '';
  const trimmedToken = typeof access_token === 'string' ? access_token.trim() : '';

  if (!trimmedToken) {
    res.status(400).json({ success: false, error: 'Access Token gerekli' });
    return;
  }
  if (!trimmedPhoneNumberId) {
    res.status(400).json({ success: false, error: 'Phone Number ID gerekli' });
    return;
  }
  if (!trimmedPhone) {
    res.status(400).json({ success: false, error: 'İş telefonu gerekli' });
    return;
  }

  try {
    if (existing.business_account_id?.startsWith('baileys:')) {
      await disconnectAccount(accountId, companyId);
    }

    const account = await updateWhatsAppAccount(companyId, accountId, {
      phone_number: trimmedPhone,
      business_account_id: trimmedPhoneNumberId,
      access_token: trimmedToken,
      webhook_verify_token,
      status: 'connected',
    });

    await logActivity({
      userId: req.userId,
      companyId,
      action: 'whatsapp_cloud_api_connected',
      entityType: 'whatsapp_account',
      entityId: accountId,
    });

    const { access_token: _, webhook_verify_token: __, ...safe } = account;
    res.json({ success: true, data: safe });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Güncellenemedi' });
  }
}

export async function sendAccountTest(req: AuthRequest, res: Response): Promise<void> {
  const accountId = req.params.accountId as string;
  const { to_phone, message } = req.body;

  if (!to_phone || !message) {
    res.status(400).json({ success: false, error: 'Telefon numarası ve mesaj gerekli' });
    return;
  }

  const result = await sendTestMessage(req.companyId!, to_phone, message, accountId);
  if (!result.success) {
    res.status(400).json({ success: false, error: result.error || 'Mesaj gönderilemedi' });
    return;
  }

  res.json({ success: true, data: { sent: true }, message: 'Test mesajı gönderildi' });
}

// ─── Departments ───────────────────────────────────────────────────────────

export async function getDepartments(req: AuthRequest, res: Response): Promise<void> {
  const departments = await listDepartments(req.companyId!);
  res.json({ success: true, data: departments });
}

export async function postDepartment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const dept = await createDepartment(req.companyId!, req.body.name, req.body.description);
    res.status(201).json({ success: true, data: dept });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Oluşturulamadı' });
  }
}

export async function patchDepartment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const dept = await updateDepartment(req.companyId!, req.params.id as string, req.body);
    res.json({ success: true, data: dept });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Güncellenemedi' });
  }
}

export async function removeDepartment(req: AuthRequest, res: Response): Promise<void> {
  try {
    await deleteDepartment(req.companyId!, req.params.id as string);
    res.json({ success: true, message: 'Departman silindi' });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Silinemedi' });
  }
}

// ─── Legacy single-account endpoints (backward compatible) ─────────────────

export async function getWhatsAppConfig(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
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

  const account = await ensureDefaultAccount(req.companyId!);
  const { access_token: _, webhook_verify_token: __, ...safe } = account;

  res.json({
    success: true,
    data: {
      id: safe.id,
      company_id: safe.company_id,
      phone_number: safe.phone_number,
      business_account_id: safe.business_account_id,
      status: safe.status,
      created_at: safe.created_at,
      updated_at: safe.updated_at,
    },
  });
}

export async function updateWhatsAppConfig(req: AuthRequest, res: Response): Promise<void> {
  const account = await ensureDefaultAccount(req.companyId!);
  const { phone_number, business_account_id, access_token, webhook_verify_token } = req.body;

  const updated = await updateWhatsAppAccount(req.companyId!, account.id, {
    phone_number,
    business_account_id,
    access_token,
    webhook_verify_token,
    status: access_token ? 'connected' : 'disconnected',
  });

  await logActivity({
    userId: req.userId,
    companyId: req.companyId,
    action: 'whatsapp_config_updated',
    entityType: 'whatsapp_account',
    entityId: updated.id,
  });

  const { access_token: _, webhook_verify_token: __, ...safe } = updated;
  res.json({ success: true, data: safe });
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
  const account = await ensureDefaultAccount(companyId);

  if (account.business_account_id?.startsWith('baileys:')) {
    const baileys = await getBaileysConnectionStatus(account.id);
    const reconnecting = isBaileysReconnecting(account.id);

    if (baileys.connected) {
      res.json({
        success: true,
        data: {
          status: 'connected',
          phone_number: baileys.phone,
          is_configured: true,
          connection_type: 'qr',
          display_name: baileys.displayName,
          reconnecting: false,
        },
      });
      return;
    }

    if (reconnecting) {
      res.json({
        success: true,
        data: {
          status: 'reconnecting',
          phone_number: null,
          is_configured: true,
          connection_type: 'qr',
          reconnecting: true,
        },
      });
      return;
    }
  }

  if (isDemoSession(req)) {
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

  const isBaileys = account.business_account_id?.startsWith('baileys:');
  const isCloudApi = !!(account.access_token && account.business_account_id && !isBaileys);

  res.json({
    success: true,
    data: {
      status: account.status || 'disconnected',
      phone_number: account.phone_number,
      is_configured: isBaileys || isCloudApi,
      connection_type: isBaileys ? 'qr' : isCloudApi ? 'api' : null,
      supports_qr: !config.isVercel,
      webhook_url: config.publicUrl ? `${config.publicUrl}/webhook/whatsapp` : null,
    },
  });
}

export async function startQr(req: AuthRequest, res: Response): Promise<void> {
  if (config.isVercel) {
    res.status(400).json({
      success: false,
      error: 'Vercel ortamında Meta WhatsApp Cloud API kullanın. Aşağıdaki API ayarlarını doldurun.',
    });
    return;
  }

  const account = await ensureDefaultAccount(req.companyId!);
  try {
    const session = await startQrSession(account.id, req.companyId!, req.userId);
    res.json({ success: true, data: session });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'QR başlatılamadı' });
  }
}

export async function getQrStatus(req: AuthRequest, res: Response): Promise<void> {
  const account = await ensureDefaultAccount(req.companyId!);
  const { sessionToken } = req.params;
  const session = await getQrSessionStatus(req.companyId!, account.id, sessionToken as string);

  if (!session) {
    res.status(404).json({ success: false, error: 'QR oturumu bulunamadı' });
    return;
  }

  res.json({ success: true, data: session });
}

export async function cancelQr(req: AuthRequest, res: Response): Promise<void> {
  const account = await ensureDefaultAccount(req.companyId!);
  await cancelQrSession(account.id, req.companyId!, req.params.sessionToken as string);
  res.json({ success: true, message: 'QR oturumu iptal edildi' });
}

export async function disconnectWhatsApp(req: AuthRequest, res: Response): Promise<void> {
  const account = await ensureDefaultAccount(req.companyId!);
  await disconnectAccount(account.id, req.companyId!);
  res.json({ success: true, message: 'WhatsApp bağlantısı kesildi' });
}

export async function getWhatsAppLimits(req: AuthRequest, res: Response): Promise<void> {
  const planType = await getCompanyPlanType(req.companyId!);
  const used = await countWhatsAppAccounts(req.companyId!);
  res.json({
    success: true,
    data: {
      limit: getWhatsAppLineLimit(planType),
      used,
      plan_type: planType,
    },
  });
}
