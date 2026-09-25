/**
 * Messages controller - conversation management
 */

import { Response } from 'express';
import crypto from 'crypto';
import { adminClient } from '../database/supabase';
import { AuthRequest, isDemoSession } from '../middleware/auth.middleware';
import { sendChannelText, sendChannelImage } from '../channels/outbound.service';
import { logActivity } from '../services/log.service';
import { normalizePhoneNumber } from '../whatsapp/message.handler';
import { sendCustomerOutreachTemplate } from '../whatsapp/whatsapp.service';
import { isChannelCustomerId, parseCustomerExternalId } from '../channels/customer-id';
import { mapMessageRow } from '../utils/supabase-join';
import {
  attachSignedMediaUrls,
  downloadMessageMedia,
  uploadMessageMedia,
} from '../services/message-media.service';
import { buildContentDisposition } from '../utils/content-disposition';
import {
  getAssignedCustomerPhones,
  getStaffRecord,
  staffCanAccessCustomerPhone,
  staffHasCompanyWideSupportAccess,
} from '../services/department-access.service';
import { getSupportReplyWindowBlockReason } from '../services/support-reply-window.service';
import {
  addPhoneToBlacklist,
  isPhoneBlacklisted,
  removePhoneFromBlacklist,
} from '../services/phone-blacklist.service';
import {
  canUserSendWaOutreach,
  canUserStartWaOutreach,
  getWaOutreachTemplateConfig,
} from '../services/wa-outreach-template.service';

function resolvePhoneParam(phone: string): string {
  const decoded = decodeURIComponent(phone);
  if (isChannelCustomerId(decoded)) return decoded.trim();
  return normalizePhoneNumber(decoded) || decoded.replace(/\D/g, '');
}

function formatLastMessagePreview(message: string, mediaType?: string | null): string {
  if (mediaType?.startsWith('image/')) {
    return message.trim() ? `📷 ${message.trim()}` : '📷 Fotoğraf';
  }
  return message;
}

/** Şirket hattı: mesajın geldiği / gönderildiği WhatsApp numarası veya Meta sayfası */
export type ReceivedLine = {
  phone: string | null;
  label: string | null;
};

type LineRef = {
  whatsapp_account_id?: string | null;
  channel_connection_id?: string | null;
};

async function loadReceivedLineMaps(companyId: string, rows: LineRef[]) {
  const waIds = [...new Set(rows.map((r) => r.whatsapp_account_id).filter((id): id is string => !!id))];
  const chIds = [...new Set(rows.map((r) => r.channel_connection_id).filter((id): id is string => !!id))];

  const waMap = new Map<string, ReceivedLine>();
  const chMap = new Map<string, ReceivedLine>();

  if (waIds.length > 0) {
    const { data } = await adminClient
      .from('whatsapp_configs')
      .select('id, phone_number, label, profile_name')
      .eq('company_id', companyId)
      .in('id', waIds);

    for (const row of data || []) {
      const phone = typeof row.phone_number === 'string' ? row.phone_number.trim() : '';
      const named =
        (typeof row.label === 'string' && row.label.trim()) ||
        (typeof row.profile_name === 'string' && row.profile_name.trim()) ||
        '';
      if (phone || named) {
        waMap.set(row.id, { phone: phone || null, label: named || null });
      }
    }
  }

  if (chIds.length > 0) {
    const { data } = await adminClient
      .from('channel_connections')
      .select('id, label, page_name, account_name')
      .eq('company_id', companyId)
      .in('id', chIds);

    for (const row of data || []) {
      const named =
        (typeof row.page_name === 'string' && row.page_name.trim()) ||
        (typeof row.account_name === 'string' && row.account_name.trim()) ||
        (typeof row.label === 'string' && row.label.trim()) ||
        '';
      if (named) chMap.set(row.id, { phone: null, label: named });
    }
  }

  return { waMap, chMap };
}

function receivedLineFor(
  row: LineRef,
  maps: { waMap: Map<string, ReceivedLine>; chMap: Map<string, ReceivedLine> }
): ReceivedLine | null {
  if (row.whatsapp_account_id) {
    const line = maps.waMap.get(row.whatsapp_account_id);
    if (line) return line;
  }
  if (row.channel_connection_id) {
    const line = maps.chMap.get(row.channel_connection_id);
    if (line) return line;
  }
  return null;
}

function sameLine(a: ReceivedLine, b: ReceivedLine): boolean {
  return a.phone === b.phone && a.label === b.label;
}

/** Personel için konuşma erişim kontrolü; admin her zaman geçer */
async function assertStaffConversationAccess(
  req: AuthRequest,
  phone: string
): Promise<true | { status: number; error: string }> {
  if (req.role !== 'staff') return true;
  if (!req.companyId) {
    return { status: 403, error: 'Şirket bilgisi bulunamadı' };
  }

  const allowed = await staffCanAccessCustomerPhone(
    req.companyId,
    req.profile?.id,
    phone
  );
  if (!allowed) {
    return { status: 403, error: 'Bu konuşmaya erişim yetkiniz yok' };
  }
  return true;
}

export async function getConversations(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.json({ success: true, data: [] });
    return;
  }

  let assignedPhones: string[] | null = null;
  if (req.role === 'staff') {
    const staff = await getStaffRecord(req.companyId!, req.profile?.id);
    if (!staff) {
      res.json({ success: true, data: [] });
      return;
    }
    // Süper personel tüm destek konuşmalarını atama olmadan görür
    if (!staffHasCompanyWideSupportAccess(staff)) {
      assignedPhones = await getAssignedCustomerPhones(req.companyId!, staff.id);
      if (assignedPhones.length === 0) {
        res.json({ success: true, data: [] });
        return;
      }
    }
  }

  let query = adminClient
    .from('messages')
    .select('*')
    .eq('company_id', req.companyId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (assignedPhones) {
    query = query.in('customer_phone', assignedPhones);
  }

  const { data: messages, error } = await query;

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  const conversationMap = new Map<string, {
    customer_phone: string;
    customer_name: string | null;
    last_message: string;
    last_message_at: string;
    unread_count: number;
    status: string;
    channel: string;
    line_refs: LineRef[];
  }>();

  for (const msg of messages || []) {
    const existing = conversationMap.get(msg.customer_phone);
    const lineRef: LineRef = {
      whatsapp_account_id: msg.whatsapp_account_id || null,
      channel_connection_id: msg.channel_connection_id || null,
    };
    if (!existing) {
      conversationMap.set(msg.customer_phone, {
        customer_phone: msg.customer_phone,
        customer_name: msg.customer_name,
        last_message: formatLastMessagePreview(msg.message, msg.media_type),
        last_message_at: msg.created_at,
        unread_count: msg.sender_type === 'customer' && msg.status === 'open' ? 1 : 0,
        status: msg.status,
        channel: msg.channel || 'whatsapp',
        line_refs: lineRef.whatsapp_account_id || lineRef.channel_connection_id ? [lineRef] : [],
      });
      continue;
    }

    if (!existing.customer_name && msg.customer_name) {
      existing.customer_name = msg.customer_name;
    }
    if (
      (lineRef.whatsapp_account_id || lineRef.channel_connection_id) &&
      !existing.line_refs.some(
        (ref) =>
          ref.whatsapp_account_id === lineRef.whatsapp_account_id &&
          ref.channel_connection_id === lineRef.channel_connection_id
      )
    ) {
      existing.line_refs.push(lineRef);
    }
  }

  const conversations = Array.from(conversationMap.values());
  const lineMaps = req.companyId
    ? await loadReceivedLineMaps(
        req.companyId,
        conversations.flatMap((conv) => conv.line_refs)
      )
    : { waMap: new Map<string, ReceivedLine>(), chMap: new Map<string, ReceivedLine>() };

  res.json({
    success: true,
    data: conversations.map(({ line_refs, ...conv }) => {
      const received_lines: ReceivedLine[] = [];
      for (const ref of line_refs) {
        const line = receivedLineFor(ref, lineMaps);
        if (line && !received_lines.some((existing) => sameLine(existing, line))) {
          received_lines.push(line);
        }
      }
      return { ...conv, received_lines };
    }),
  });
}

export async function getConversationMessages(req: AuthRequest, res: Response): Promise<void> {
  const phone = resolvePhoneParam(req.params.phone as string);

  const access = await assertStaffConversationAccess(req, phone);
  if (access !== true) {
    res.status(access.status).json({ success: false, error: access.error });
    return;
  }

  const { data, error } = await adminClient
    .from('messages')
    .select('*, staff:staff_id(name)')
    .eq('company_id', req.companyId)
    .eq('customer_phone', phone)
    .order('created_at', { ascending: true });

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  const mapped = (data || []).map(mapMessageRow);
  const lineMaps = req.companyId
    ? await loadReceivedLineMaps(req.companyId, mapped)
    : { waMap: new Map<string, ReceivedLine>(), chMap: new Map<string, ReceivedLine>() };
  const withLines = mapped.map((msg) => ({
    ...msg,
    received_line: receivedLineFor(msg, lineMaps),
  }));
  const withMedia = await attachSignedMediaUrls(withLines);

  // Bilgi bankası kaynakları yalnızca şirket yöneticisine (ve impersonation) görünür
  const canSeeRagSources =
    req.role === 'company_admin' ||
    (req.role === 'super_admin' && !!req.isImpersonating);

  const payload = canSeeRagSources
    ? withMedia
    : withMedia.map(({ rag_sources: _rag, ...rest }) => ({ ...rest, rag_sources: undefined }));

  res.json({ success: true, data: payload });
}

export async function getMessageMedia(req: AuthRequest, res: Response): Promise<void> {
  const messageId = req.params.messageId as string;
  const download = req.query.download === '1' || req.query.download === 'true';

  const { data: msg, error } = await adminClient
    .from('messages')
    .select('id, company_id, customer_phone, media_path, media_type, media_filename')
    .eq('id', messageId)
    .eq('company_id', req.companyId)
    .maybeSingle();

  if (error || !msg?.media_path) {
    res.status(404).json({ success: false, error: 'Medya bulunamadı' });
    return;
  }

  const access = await assertStaffConversationAccess(req, msg.customer_phone);
  if (access !== true) {
    res.status(access.status).json({ success: false, error: access.error });
    return;
  }

  try {
    const { buffer, mimeType, filename } = await downloadMessageMedia(msg.media_path);
    const resolvedName = msg.media_filename || filename;

    res.setHeader('Content-Type', msg.media_type || mimeType);
    res.setHeader('Content-Disposition', buildContentDisposition(resolvedName, !download));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  } catch (err) {
    res.status(404).json({
      success: false,
      error: err instanceof Error ? err.message : 'Medya indirilemedi',
    });
  }
}

export async function updateCustomerName(req: AuthRequest, res: Response): Promise<void> {
  const phone = resolvePhoneParam(req.params.phone as string);
  const { customer_name } = req.body;
  const name = typeof customer_name === 'string' ? customer_name.trim() : '';

  if (!name) {
    res.status(400).json({ success: false, error: 'Müşteri adı boş olamaz' });
    return;
  }

  if (name.length > 120) {
    res.status(400).json({ success: false, error: 'Müşteri adı en fazla 120 karakter olabilir' });
    return;
  }

  if (!req.companyId) {
    res.status(403).json({ success: false, error: 'Şirket bilgisi bulunamadı' });
    return;
  }

  const filter = { company_id: req.companyId, customer_phone: phone };

  const [messagesResult, ticketsResult, appointmentsResult] = await Promise.all([
    adminClient.from('messages').update({ customer_name: name }).match(filter),
    adminClient.from('tickets').update({ customer_name: name }).match(filter),
    adminClient.from('appointments').update({ customer_name: name }).match(filter),
  ]);

  const error = messagesResult.error || ticketsResult.error || appointmentsResult.error;
  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  await logActivity({
    userId: req.userId,
    companyId: req.companyId,
    action: 'customer_name_updated',
    entityType: 'customer',
    metadata: { customer_phone: phone, customer_name: name },
  });

  res.json({
    success: true,
    data: { customer_phone: phone, customer_name: name },
    message: 'Müşteri adı güncellendi',
  });
}

export async function getBlacklistStatus(req: AuthRequest, res: Response): Promise<void> {
  const phone = resolvePhoneParam(req.params.phone as string);

  if (!req.companyId) {
    res.status(403).json({ success: false, error: 'Şirket bilgisi bulunamadı' });
    return;
  }

  if (isDemoSession(req)) {
    res.json({ success: true, data: { phone, blacklisted: false } });
    return;
  }

  const blacklisted = await isPhoneBlacklisted(req.companyId, phone);
  res.json({ success: true, data: { phone, blacklisted } });
}

export async function addToBlacklist(req: AuthRequest, res: Response): Promise<void> {
  const phone = resolvePhoneParam(req.params.phone as string);

  if (!req.companyId) {
    res.status(403).json({ success: false, error: 'Şirket bilgisi bulunamadı' });
    return;
  }

  if (!phone) {
    res.status(400).json({ success: false, error: 'Geçersiz numara' });
    return;
  }

  if (isDemoSession(req)) {
    res.json({
      success: true,
      data: { phone, blacklisted: true },
      message: 'Numara blacklist\'e eklendi',
    });
    return;
  }

  try {
    const row = await addPhoneToBlacklist(req.companyId, phone, req.profile?.id ?? null);
    await logActivity({
      userId: req.userId,
      companyId: req.companyId,
      action: 'phone_blacklisted',
      entityType: 'customer',
      metadata: { customer_phone: phone },
    });

    res.json({
      success: true,
      data: { phone: row.phone, blacklisted: true, created_at: row.created_at },
      message: 'Numara blacklist\'e eklendi',
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'Blacklist eklenemedi',
    });
  }
}

export async function removeFromBlacklist(req: AuthRequest, res: Response): Promise<void> {
  const phone = resolvePhoneParam(req.params.phone as string);

  if (!req.companyId) {
    res.status(403).json({ success: false, error: 'Şirket bilgisi bulunamadı' });
    return;
  }

  if (isDemoSession(req)) {
    res.json({
      success: true,
      data: { phone, blacklisted: false },
      message: 'Numara blacklist\'ten çıkarıldı',
    });
    return;
  }

  try {
    await removePhoneFromBlacklist(req.companyId, phone);
    await logActivity({
      userId: req.userId,
      companyId: req.companyId,
      action: 'phone_unblacklisted',
      entityType: 'customer',
      metadata: { customer_phone: phone },
    });

    res.json({
      success: true,
      data: { phone, blacklisted: false },
      message: 'Numara blacklist\'ten çıkarıldı',
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'Blacklist kaldırılamadı',
    });
  }
}

export async function replyToConversation(req: AuthRequest, res: Response): Promise<void> {
  const phone = resolvePhoneParam(req.params.phone as string);
  const { message } = req.body;

  if (!message?.trim()) {
    res.status(400).json({ success: false, error: 'Mesaj boş olamaz' });
    return;
  }

  if (!req.companyId) {
    res.status(403).json({ success: false, error: 'Şirket bilgisi bulunamadı' });
    return;
  }

  const access = await assertStaffConversationAccess(req, phone);
  if (access !== true) {
    res.status(access.status).json({ success: false, error: access.error });
    return;
  }

  const windowBlock = await getSupportReplyWindowBlockReason(req.companyId, phone);
  if (windowBlock) {
    res.status(403).json({ success: false, error: windowBlock });
    return;
  }

  const { data: staffRecord } = await adminClient
    .from('staff')
    .select('id, name')
    .eq('profile_id', req.profile?.id)
    .eq('company_id', req.companyId)
    .maybeSingle();

  const senderName = staffRecord?.name?.trim() || req.profile?.full_name?.trim() || null;

  const sendResult = await sendChannelText(req.companyId, phone, message.trim());
  if (!sendResult.success) {
    res.status(502).json({
      success: false,
      error: sendResult.error || 'Mesaj müşteriye iletilemedi',
    });
    return;
  }

  const { channel } = parseCustomerExternalId(phone);

  const { data: msg, error } = await adminClient
    .from('messages')
    .insert({
      company_id: req.companyId,
      customer_phone: phone,
      message: message.trim(),
      sender_type: 'staff',
      status: 'open',
      staff_id: staffRecord?.id || null,
      sender_name: senderName,
      channel,
    })
    .select('*, staff:staff_id(name)')
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  await logActivity({
    userId: req.userId,
    companyId: req.companyId,
    action: 'staff_reply_sent',
    entityType: 'message',
    entityId: msg.id,
    metadata: { customer_phone: phone, sender_name: senderName },
  });

  res.status(201).json({ success: true, data: mapMessageRow(msg) });
}

export async function replyWithImage(req: AuthRequest, res: Response): Promise<void> {
  const phone = resolvePhoneParam(req.params.phone as string);
  const file = req.file;
  const caption = typeof req.body.caption === 'string' ? req.body.caption.trim() : '';

  if (!file?.buffer?.length) {
    res.status(400).json({ success: false, error: 'Resim dosyası gerekli' });
    return;
  }

  if (!req.companyId) {
    res.status(403).json({ success: false, error: 'Şirket bilgisi bulunamadı' });
    return;
  }

  const access = await assertStaffConversationAccess(req, phone);
  if (access !== true) {
    res.status(access.status).json({ success: false, error: access.error });
    return;
  }

  const windowBlock = await getSupportReplyWindowBlockReason(req.companyId, phone);
  if (windowBlock) {
    res.status(403).json({ success: false, error: windowBlock });
    return;
  }

  const { data: staffRecord } = await adminClient
    .from('staff')
    .select('id, name')
    .eq('profile_id', req.profile?.id)
    .eq('company_id', req.companyId)
    .maybeSingle();

  const senderName = staffRecord?.name?.trim() || req.profile?.full_name?.trim() || null;
  const messageId = crypto.randomUUID();

  let mediaPath: string | null = null;
  let mediaFilename: string | null = null;

  try {
    const uploaded = await uploadMessageMedia(
      req.companyId,
      messageId,
      file.buffer,
      file.mimetype,
      file.originalname
    );
    mediaPath = uploaded.path;
    mediaFilename = uploaded.filename;
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Resim yüklenemedi',
    });
    return;
  }

  const sendResult = await sendChannelImage(
    req.companyId,
    phone,
    file.buffer,
    file.mimetype,
    caption || undefined,
    file.originalname
  );

  if (!sendResult.success) {
    res.status(502).json({
      success: false,
      error: sendResult.error || 'Resim müşteriye iletilemedi',
    });
    return;
  }

  const { channel } = parseCustomerExternalId(phone);

  const { data: msg, error } = await adminClient
    .from('messages')
    .insert({
      id: messageId,
      company_id: req.companyId,
      customer_phone: phone,
      message: caption || null,
      sender_type: 'staff',
      status: 'open',
      staff_id: staffRecord?.id || null,
      sender_name: senderName,
      media_path: mediaPath,
      media_type: file.mimetype,
      media_filename: mediaFilename,
      channel,
    })
    .select('*, staff:staff_id(name)')
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  await logActivity({
    userId: req.userId,
    companyId: req.companyId,
    action: 'staff_image_sent',
    entityType: 'message',
    entityId: msg.id,
    metadata: { customer_phone: phone, sender_name: senderName },
  });

  const [withMedia] = await attachSignedMediaUrls([mapMessageRow(msg)]);
  res.status(201).json({ success: true, data: withMedia });
}

/** Panel: outreach şablon bilgisi (yetkili kullanıcılar) */
export async function getOutreachTemplate(req: AuthRequest, res: Response): Promise<void> {
  if (!req.companyId) {
    res.status(403).json({ success: false, error: 'Şirket bilgisi bulunamadı' });
    return;
  }

  const canStart = await canUserStartWaOutreach(req);
  const tpl = await getWaOutreachTemplateConfig(req.companyId);

  res.json({
    success: true,
    data: {
      ...tpl,
      can_start_new: canStart && tpl.enabled,
    },
  });
}

/**
 * Meta onaylı outreach şablonu gönder.
 * 24 saat penceresini aşar; yeni numaraya da gönderilebilir (yönetici / süper personel).
 */
export async function sendOutreachTemplate(req: AuthRequest, res: Response): Promise<void> {
  if (!req.companyId) {
    res.status(403).json({ success: false, error: 'Şirket bilgisi bulunamadı' });
    return;
  }

  const rawPhone =
    (typeof req.body?.phone === 'string' && req.body.phone) ||
    (typeof req.params.phone === 'string' && req.params.phone) ||
    '';
  const phone = resolvePhoneParam(rawPhone);

  if (!phone || phone.length < 8) {
    res.status(400).json({ success: false, error: 'Geçerli bir telefon numarası gerekli' });
    return;
  }

  if (isChannelCustomerId(phone) && !phone.startsWith('wa:')) {
    res.status(400).json({
      success: false,
      error: 'Şablon gönderimi yalnızca WhatsApp numaraları için desteklenir',
    });
    return;
  }

  const waPhone = phone.startsWith('wa:') ? phone.slice(3) : phone;

  const { count: historyCount } = await adminClient
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', req.companyId)
    .eq('customer_phone', waPhone);

  const isNewConversation = !historyCount;

  if (isNewConversation) {
    const allowed = await canUserStartWaOutreach(req);
    if (!allowed) {
      res.status(403).json({
        success: false,
        error: 'Yeni numaraya şablon gönderme yetkiniz yok',
      });
      return;
    }
  } else {
    const allowed = await canUserSendWaOutreach(req, waPhone);
    if (!allowed) {
      res.status(403).json({
        success: false,
        error: 'Bu görüşmeye şablon gönderme yetkiniz yok',
      });
      return;
    }
  }

  if (await isPhoneBlacklisted(req.companyId, waPhone)) {
    res.status(403).json({ success: false, error: 'Bu numara blacklistte' });
    return;
  }

  const tpl = await getWaOutreachTemplateConfig(req.companyId);
  if (!tpl.enabled || !tpl.name) {
    res.status(400).json({
      success: false,
      error: 'Outreach şablonu yapılandırılmamış. Meta şablon adını şirket ayarına veya ortam değişkenine ekleyin.',
    });
    return;
  }

  const sendResult = await sendCustomerOutreachTemplate(
    req.companyId,
    waPhone,
    tpl.name,
    tpl.language,
    tpl.body
  );

  if (!sendResult.success) {
    res.status(502).json({
      success: false,
      error: sendResult.error || 'Şablon müşteriye iletilemedi',
    });
    return;
  }

  const { data: staffRecord } = await adminClient
    .from('staff')
    .select('id, name')
    .eq('profile_id', req.profile?.id)
    .eq('company_id', req.companyId)
    .maybeSingle();

  const senderName = staffRecord?.name?.trim() || req.profile?.full_name?.trim() || null;

  const { data: msg, error } = await adminClient
    .from('messages')
    .insert({
      company_id: req.companyId,
      customer_phone: waPhone,
      message: tpl.body,
      sender_type: 'staff',
      status: 'open',
      staff_id: staffRecord?.id || null,
      sender_name: senderName,
      channel: 'whatsapp',
    })
    .select('*, staff:staff_id(name)')
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  await logActivity({
    userId: req.userId,
    companyId: req.companyId,
    action: 'staff_outreach_template_sent',
    entityType: 'message',
    entityId: msg.id,
    metadata: {
      customer_phone: waPhone,
      template_name: tpl.name,
      template_lang: tpl.language,
      is_new: isNewConversation,
    },
  });

  res.status(201).json({ success: true, data: mapMessageRow(msg) });
}
