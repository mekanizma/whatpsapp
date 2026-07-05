/**
 * Messages controller - conversation management
 */

import { Response } from 'express';
import { adminClient } from '../database/supabase';
import { AuthRequest, isDemoSession } from '../middleware/auth.middleware';
import { sendMessageToCustomer } from '../whatsapp/whatsapp.service';
import { logActivity } from '../services/log.service';
import { normalizePhoneNumber } from '../whatsapp/message.handler';
import { mapMessageRow } from '../utils/supabase-join';

function resolvePhoneParam(phone: string): string {
  return normalizePhoneNumber(phone) || phone.replace(/\D/g, '');
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
        last_message: msg.message,
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

  res.json({ success: true, data: (data || []).map(mapMessageRow) });
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
