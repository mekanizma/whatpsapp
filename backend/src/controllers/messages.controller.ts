/**
 * Messages controller - conversation management
 */

import { Response } from 'express';
import { config } from '../config';
import { adminClient } from '../database/supabase';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendMessageToCustomer } from '../whatsapp/whatsapp.service';
import { logActivity } from '../services/log.service';

export async function getConversations(req: AuthRequest, res: Response): Promise<void> {
  if (config.demoMode) {
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
    if (!conversationMap.has(msg.customer_phone)) {
      conversationMap.set(msg.customer_phone, {
        customer_phone: msg.customer_phone,
        customer_name: msg.customer_name,
        last_message: msg.message,
        last_message_at: msg.created_at,
        unread_count: msg.sender_type === 'customer' && msg.status === 'open' ? 1 : 0,
        status: msg.status,
      });
    }
  }

  res.json({ success: true, data: Array.from(conversationMap.values()) });
}

export async function getConversationMessages(req: AuthRequest, res: Response): Promise<void> {
  const { phone } = req.params;

  const { data, error } = await adminClient
    .from('messages')
    .select('*')
    .eq('company_id', req.companyId)
    .eq('customer_phone', phone)
    .order('created_at', { ascending: true });

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true, data });
}

export async function replyToConversation(req: AuthRequest, res: Response): Promise<void> {
  const { phone } = req.params;
  const { message } = req.body;

  if (!message?.trim()) {
    res.status(400).json({ success: false, error: 'Mesaj boş olamaz' });
    return;
  }

  const { data: staffRecord } = await adminClient
    .from('staff')
    .select('id')
    .eq('profile_id', req.profile?.id)
    .single();

  const { data: msg, error } = await adminClient
    .from('messages')
    .insert({
      company_id: req.companyId,
      customer_phone: phone,
      message: message.trim(),
      sender_type: 'staff',
      status: 'open',
      staff_id: staffRecord?.id || null,
    })
    .select()
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  await sendMessageToCustomer(req.companyId!, phone as string, message.trim());

  await logActivity({
    userId: req.userId,
    companyId: req.companyId,
    action: 'staff_reply_sent',
    entityType: 'message',
    entityId: msg.id,
    metadata: { customer_phone: phone },
  });

  res.status(201).json({ success: true, data: msg });
}
