/**
 * API route definitions
 * All routes prefixed with /api/v1
 */

import { Router } from 'express';
import { authenticate, requireRole, requireCompany } from '../middleware/auth.middleware';

import * as authCtrl from '../controllers/auth.controller';
import * as adminCtrl from '../controllers/admin.controller';
import * as companyCtrl from '../controllers/company.controller';
import * as whatsappCtrl from '../controllers/whatsapp.controller';
import * as knowledgeCtrl from '../controllers/knowledge.controller';
import * as messagesCtrl from '../controllers/messages.controller';
import * as ticketsCtrl from '../controllers/tickets.controller';
import * as staffCtrl from '../controllers/staff.controller';
import * as subscriptionCtrl from '../controllers/subscription.controller';

const router = Router();

// Auth
router.get('/auth/me', authenticate, authCtrl.getMe);
router.put('/auth/profile', authenticate, authCtrl.updateProfile);

// Super Admin
router.get('/admin/stats', authenticate, requireRole('super_admin'), adminCtrl.getAdminStats);
router.get('/admin/companies', authenticate, requireRole('super_admin'), adminCtrl.getCompanies);
router.get('/admin/companies/:id', authenticate, requireRole('super_admin'), adminCtrl.getCompany);
router.post('/admin/companies', authenticate, requireRole('super_admin'), adminCtrl.createCompany);
router.put('/admin/companies/:id', authenticate, requireRole('super_admin'), adminCtrl.updateCompany);
router.patch('/admin/companies/:id/status', authenticate, requireRole('super_admin'), adminCtrl.updateCompanyStatus);
router.patch('/admin/companies/:id/subscription', authenticate, requireRole('super_admin'), adminCtrl.updateCompanySubscription);
router.get('/admin/ai-usage', authenticate, requireRole('super_admin'), adminCtrl.getAIUsage);
router.get('/admin/activity', authenticate, requireRole('super_admin'), adminCtrl.getLogs);
router.get('/admin/settings', authenticate, requireRole('super_admin'), adminCtrl.getPlatformSettings);

// Company
router.get('/companies/:id', authenticate, companyCtrl.getCompany);
router.put('/companies/:id', authenticate, requireRole('super_admin', 'company_admin'), requireCompany, companyCtrl.updateCompany);
router.get('/companies/:id/dashboard', authenticate, requireCompany, companyCtrl.getDashboard);
router.get('/dashboard', authenticate, requireCompany, companyCtrl.getDashboard);

// WhatsApp
router.get('/whatsapp/config', authenticate, requireRole('super_admin', 'company_admin'), requireCompany, whatsappCtrl.getWhatsAppConfig);
router.put('/whatsapp/config', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.updateWhatsAppConfig);
router.post('/whatsapp/test', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.sendTest);
router.get('/whatsapp/status', authenticate, requireCompany, whatsappCtrl.getWhatsAppStatus);
router.post('/whatsapp/qr/start', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.startQr);
router.get('/whatsapp/qr/:sessionToken/status', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.getQrStatus);
router.delete('/whatsapp/qr/:sessionToken', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.cancelQr);
router.post('/whatsapp/disconnect', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.disconnectWhatsApp);

// Knowledge Base
router.get('/knowledge', authenticate, requireCompany, knowledgeCtrl.getKnowledgeItems);
router.post('/knowledge', authenticate, requireRole('company_admin'), requireCompany, knowledgeCtrl.createKnowledgeItem);
router.put('/knowledge/:id', authenticate, requireRole('company_admin'), requireCompany, knowledgeCtrl.updateKnowledgeItem);
router.delete('/knowledge/:id', authenticate, requireRole('company_admin'), requireCompany, knowledgeCtrl.deleteKnowledgeItem);

// Messages
router.get('/messages', authenticate, requireCompany, messagesCtrl.getConversations);
router.get('/messages/:phone', authenticate, requireCompany, messagesCtrl.getConversationMessages);
router.post('/messages/:phone/reply', authenticate, requireCompany, messagesCtrl.replyToConversation);

// Tickets
router.get('/tickets', authenticate, requireCompany, ticketsCtrl.getTickets);
router.get('/tickets/active/:phone', authenticate, requireCompany, ticketsCtrl.getActiveTicketByPhone);
router.post('/tickets', authenticate, requireCompany, ticketsCtrl.createTicket);
router.put('/tickets/:id', authenticate, requireCompany, ticketsCtrl.updateTicket);
router.patch('/tickets/:id/claim', authenticate, requireCompany, ticketsCtrl.claimTicket);
router.patch('/tickets/:id/assign', authenticate, requireRole('company_admin'), requireCompany, ticketsCtrl.assignTicket);

// Staff
router.get('/staff', authenticate, requireCompany, staffCtrl.getStaff);
router.post('/staff', authenticate, requireRole('company_admin'), requireCompany, staffCtrl.createStaff);
router.put('/staff/:id', authenticate, requireRole('company_admin'), requireCompany, staffCtrl.updateStaff);
router.delete('/staff/:id', authenticate, requireRole('company_admin'), requireCompany, staffCtrl.deleteStaff);

// Subscriptions
router.get('/subscriptions/current', authenticate, requireCompany, subscriptionCtrl.getCurrentSubscription);
router.get('/subscriptions/usage', authenticate, requireCompany, subscriptionCtrl.getUsage);
router.get('/subscriptions/plans', authenticate, subscriptionCtrl.getPlans);

export default router;
