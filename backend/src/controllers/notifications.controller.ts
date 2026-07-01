/**
 * Ticket notification settings controller
 */

import { Response } from 'express';
import { AuthRequest, isDemoSession } from '../middleware/auth.middleware';
import {
  getNotificationSettings,
  updateNotificationSettings,
} from '../services/ticket-notification.service';
import { demoCompanyProfile } from '../demo/mockData';

const DEMO_NOTIFICATION_USERS = [
  {
    id: demoCompanyProfile.id,
    full_name: demoCompanyProfile.full_name,
    role: demoCompanyProfile.role,
    email: 'firma@demo.com',
    phone: '+905551234567',
    notify_enabled: true,
  },
  {
    id: '00000000-0000-0000-0000-000000000030',
    full_name: 'Ayşe Demir',
    role: 'staff',
    email: 'personel@demo.com',
    phone: '+905559876543',
    notify_enabled: false,
  },
];

export async function getNotificationRecipients(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.json({ success: true, data: DEMO_NOTIFICATION_USERS });
    return;
  }

  try {
    const data = await getNotificationSettings(req.companyId!);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
}

export async function updateNotificationRecipients(req: AuthRequest, res: Response): Promise<void> {
  const { users } = req.body;

  if (!Array.isArray(users)) {
    res.status(400).json({ success: false, error: 'Kullanıcı listesi gerekli' });
    return;
  }

  if (isDemoSession(req)) {
    res.json({ success: true, data: DEMO_NOTIFICATION_USERS });
    return;
  }

  try {
    const data = await updateNotificationSettings(req.companyId!, users);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
}
