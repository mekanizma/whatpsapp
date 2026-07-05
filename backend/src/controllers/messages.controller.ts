/**
 * Messages controller - conversation management
 */

import { Response } from 'express';
import crypto from 'crypto';
import { adminClient } from '../database/supabase';
import { AuthRequest, isDemoSession } from '../middleware/auth.middleware';
import { sendMessageToCustomer, sendImageToCustomer } from '../whatsapp/whatsapp.service';
import { logActivity } from '../services/log.service';
import { normalizePhoneNumber } from '../whatsapp/message.handler';
import { mapMessageRow } from '../utils/supabase-join';
import {
  attachSignedMediaUrls,
  downloadMessageMedia,
  uploadMessageMedia,
} from '../services/message-media.service';
import { buildContentDisposition } from '../utils/content-disposition';

function resolvePhoneParam(phone: string): string {
  return normalizePhoneNumber(phone) || phone.replace(/\D/g, '');
}

function formatLastMessagePreview(message: string, mediaType?: string | null): string {
  if (mediaType?.startsWith('image/')) {
    return message.trim() ? `📷 ${message.trim()}` : '📷 Fotoğraf';
  }
  return message;
}

export async function getConversations(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.json({ success: true, data: [] });
    return;
  }

  const { data: messages, error } = await adminClient
    .from('messages')
    .select('*')
    .eq('company_id', req.companyId)
    .order('created_at', { ascending: false })
    .limit(500);

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
  }>();

  for (const msg of messages || []) {
    const existing = conversationMap.get(msg.customer_phone);
    if (!existing) {
      conversationMap.set(msg.customer_phone, {
        customer_phone: msg.customer_phone,
        customer_name: msg.customer_name,
        last_message: formatLastMessagePreview(msg.message, msg.media_type),
        last_message_at: msg.created_at,
        unread_count: msg.sender_type === 'customer' && msg.status === 'open' ? 1 : 0,
        status: msg.status,
      });
      continue;
    }

    if (!existing.customer_name && msg.customer_name) {
      existing.customer_name = msg.customer_name;
    }
  }

  res.json({ success: true, data: Array.from(conversationMap.values()) });
}

export async function getConversationMessages(req: AuthRequest, res: Response): Promise<void> {
  const phone = resolvePhoneParam(req.params.phone as string);

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
  const withMedia = await attachSignedMediaUrls(mapped);

  res.json({ success: true, data: withMedia });
}

export async function getMessageMedia(req: AuthRequest, res: Response): Promise<void> {
  const messageId = req.params.messageId as string;
  const download = req.query.download === '1' || req.query.download === 'true';

  const { data: msg, error } = await adminClient
    .from('messages')
    .select('id, company_id, media_path, media_type, media_filename')
    .eq('id', messageId)
    .eq('company_id', req.companyId)
    .maybeSingle();

  if (error || !msg?.media_path) {
    res.status(404).json({ success: false, error: 'Medya bulunamadı' });
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

  const { data: staffRecord } = await adminClient
    .from('staff')
    .select('id, name')
    .eq('profile_id', req.profile?.id)
    .eq('company_id', req.companyId)
    .maybeSingle();

  const senderName = staffRecord?.name?.trim() || req.profile?.full_name?.trim() || null;

  const sendResult = await sendMessageToCustomer(req.companyId, phone, message.trim());
  if (!sendResult.success) {
    res.status(502).json({
      success: false,
      error: sendResult.error || 'WhatsApp mesajı müşteriye iletilemedi',
    });
    return;
  }

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

  const sendResult = await sendImageToCustomer(
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
      error: sendResult.error || 'WhatsApp resmi müşteriye iletilemedi',
    });
    return;
  }

  const { data: msg, error } = await adminClient
    .from('messages')
    .insert({
      id: messageId,
      company_id: req.companyId,
      customer_phone: phone,
      message: caption,
      sender_type: 'staff',
      status: 'open',
      staff_id: staffRecord?.id || null,
      sender_name: senderName,
      media_path: mediaPath,
      media_type: file.mimetype,
      media_filename: mediaFilename,
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
