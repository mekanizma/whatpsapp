/**
 * Activity log service
 * Records all significant actions for audit trail
 */

import { adminClient } from '../database/supabase';

interface LogParams {
  companyId?: string | null;
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export async function logActivity(params: LogParams): Promise<void> {
  try {
    const { error } = await adminClient.from('activity_logs').insert({
      company_id: params.companyId || null,
      user_id: params.userId || null,
      action: params.action,
      entity_type: params.entityType || null,
      entity_id: params.entityId || null,
      metadata: params.metadata || {},
      ip_address: params.ipAddress || null,
    });
    if (error) console.error('Failed to log activity:', error.message);
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}
