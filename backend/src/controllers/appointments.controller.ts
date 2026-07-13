/**
 * Randevu takvimi controller
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { logActivity } from '../services/log.service';
import {
  listAppointments,
  listUpcomingAppointments,
  bookAppointment,
  AppointmentBookingError,
  updateAppointment,
  deleteAppointment,
} from '../services/appointment.service';
import { AppointmentStatus } from '../types';

export async function getAppointments(req: AuthRequest, res: Response): Promise<void> {
  const companyId = req.companyId as string;

  if (req.query.upcoming === 'true') {
    const days = parseInt(String(req.query.days || '60'), 10) || 60;
    try {
      const data = await listUpcomingAppointments(companyId, days);
      res.json({ success: true, data });
    } catch (err) {
      res.status(400).json({ success: false, error: (err as Error).message });
    }
    return;
  }

  const from = (req.query.from as string) || new Date().toISOString();
  const to =
    (req.query.to as string) ||
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const data = await listAppointments(companyId, from, to);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
}

export async function createAppointmentHandler(req: AuthRequest, res: Response): Promise<void> {
  const companyId = req.companyId as string;
  const {
    customer_phone,
    customer_name,
    title,
    notes,
    preferred_doctor,
    starts_at,
    ends_at,
    status,
  } = req.body;

  if (!customer_phone || !starts_at || !ends_at) {
    res.status(400).json({ success: false, error: 'Telefon, başlangıç ve bitiş saati gerekli' });
    return;
  }

  try {
    const data = await bookAppointment(companyId, {
      customer_phone,
      customer_name,
      title,
      notes,
      preferred_doctor,
      starts_at,
      ends_at,
      status: status as AppointmentStatus,
      source: 'panel',
    });

    await logActivity({
      userId: req.userId,
      companyId,
      action: 'appointment_created',
      entityType: 'appointment',
      entityId: data.id,
    });

    res.status(201).json({ success: true, data });
  } catch (err) {
    const message =
      err instanceof AppointmentBookingError ? err.message : (err as Error).message;
    res.status(400).json({ success: false, error: message });
  }
}

export async function updateAppointmentHandler(req: AuthRequest, res: Response): Promise<void> {
  const companyId = req.companyId as string;
  const id = String(req.params.id);

  try {
    const data = await updateAppointment(companyId, id, req.body);

    await logActivity({
      userId: req.userId,
      companyId,
      action: 'appointment_updated',
      entityType: 'appointment',
      entityId: data.id,
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
}

export async function deleteAppointmentHandler(req: AuthRequest, res: Response): Promise<void> {
  const companyId = req.companyId as string;
  const id = String(req.params.id);

  try {
    await deleteAppointment(companyId, id);

    await logActivity({
      userId: req.userId,
      companyId,
      action: 'appointment_deleted',
      entityType: 'appointment',
      entityId: id,
    });

    res.json({ success: true, message: 'Randevu silindi' });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
}
