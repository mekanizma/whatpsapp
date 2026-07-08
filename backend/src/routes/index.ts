/**
 * API route definitions
 * All routes prefixed with /api/v1
 */

import { Router } from 'express';
import { authenticate, requireRole, requireCompany, requireKnowledgeAccess } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/async.middleware';

import * as authCtrl from '../controllers/auth.controller';
import * as adminCtrl from '../controllers/admin.controller';
import * as companyCtrl from '../controllers/company.controller';
import * as whatsappCtrl from '../controllers/whatsapp.controller';
import * as knowledgeCtrl from '../controllers/knowledge.controller';
import * as messagesCtrl from '../controllers/messages.controller';
import * as ticketsCtrl from '../controllers/tickets.controller';
import * as staffCtrl from '../controllers/staff.controller';
import * as subscriptionCtrl from '../controllers/subscription.controller';
import * as appointmentsCtrl from '../controllers/appointments.controller';
import * as notificationsCtrl from '../controllers/notifications.controller';
import * as unknownQuestionsCtrl from '../controllers/unknown-questions.controller';
import * as platformSupportCtrl from '../controllers/platform-support.controller';
import * as referenceLogosCtrl from '../controllers/reference-logos.controller';
import * as signupApplicationCtrl from '../controllers/signup-application.controller';
import { companyLogoUpload, knowledgeFileUpload, messageImageUpload, referenceLogoUpload } from '../middleware/upload.middleware';

const router = Router();

// Auth
router.get('/auth/me', authenticate, authCtrl.getMe);
router.put('/auth/profile', authenticate, authCtrl.updateProfile);

// Super Admin
router.get('/admin/stats', authenticate, requireRole('super_admin'), adminCtrl.getAdminStats);
router.get('/admin/action-center', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.getActionCenter));
router.get('/admin/companies', authenticate, requireRole('super_admin'), adminCtrl.getCompanies);
router.get('/admin/companies/:id', authenticate, requireRole('super_admin'), adminCtrl.getCompany);
router.get('/admin/companies/:id/notes', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.getCompanyNotes));
router.post('/admin/companies/:id/notes', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.createCompanyNote));
router.delete('/admin/companies/:id/notes/:noteId', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.deleteCompanyNote));
router.post('/admin/companies/:id/impersonate', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.startCompanyImpersonation));
router.get('/admin/companies/:id/invoice', authenticate, requireRole('super_admin'), adminCtrl.downloadCompanyInvoice);
router.post('/admin/companies', authenticate, requireRole('super_admin'), adminCtrl.createCompany);
router.put('/admin/companies/:id', authenticate, requireRole('super_admin'), adminCtrl.updateCompany);
router.patch('/admin/companies/:id/status', authenticate, requireRole('super_admin'), adminCtrl.updateCompanyStatus);
router.patch('/admin/companies/:id/subscription', authenticate, requireRole('super_admin'), adminCtrl.updateCompanySubscription);
router.get('/admin/whatsapp-health', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.getWhatsAppHealth));
router.get('/admin/ai-usage', authenticate, requireRole('super_admin'), adminCtrl.getAIUsage);
router.get('/admin/activity', authenticate, requireRole('super_admin'), adminCtrl.getLogs);
router.get('/admin/settings', authenticate, requireRole('super_admin'), adminCtrl.getPlatformSettings);
router.get('/admin/invoice-settings', authenticate, requireRole('super_admin'), adminCtrl.getInvoiceSettings);
router.put('/admin/invoice-settings', authenticate, requireRole('super_admin'), adminCtrl.updateInvoiceSettings);
router.get('/admin/prompts', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.getPrompts));
router.get('/admin/prompt-roles', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.getPromptRoles));
router.get('/admin/prompts/:key', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.getPrompt));
router.post('/admin/prompts', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.createPrompt));
router.put('/admin/prompts/:key', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.updatePrompt));
router.delete('/admin/prompts/:key', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.deletePrompt));
router.post('/admin/prompts/:key/reset', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.resetPrompt));
router.post('/admin/prompts-reset-all', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.resetAllPrompts));
router.post('/admin/prompts-cleanup', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.cleanupPrompts));
router.post('/admin/prompts-seed', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.seedPrompts));
router.get('/admin/plans', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.getSubscriptionPlans));
router.post('/admin/plans', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.createSubscriptionPlanAdmin));
router.put('/admin/plans/:id', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.updateSubscriptionPlanAdmin));
router.get('/admin/reference-logos', authenticate, requireRole('super_admin'), asyncHandler(referenceLogosCtrl.adminListReferenceLogos));
router.post('/admin/reference-logos', authenticate, requireRole('super_admin'), referenceLogoUpload.single('file'), asyncHandler(referenceLogosCtrl.createReferenceLogo));
router.put('/admin/reference-logos/:id', authenticate, requireRole('super_admin'), asyncHandler(referenceLogosCtrl.updateReferenceLogo));
router.delete('/admin/reference-logos/:id', authenticate, requireRole('super_admin'), asyncHandler(referenceLogosCtrl.deleteReferenceLogo));
router.get('/admin/addons', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.getAiConversationAddonsAdmin));
router.put('/admin/addons/:id', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.updateAiConversationAddonAdmin));
router.get('/admin/users', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.getAdminUsers));
router.patch('/admin/users/:profileId/password', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.resetUserPassword));
router.get('/admin/super-admins', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.getSuperAdmins));
router.post('/admin/super-admins', authenticate, requireRole('super_admin'), asyncHandler(adminCtrl.createSuperAdmin));

router.get('/admin/support-tickets', authenticate, requireRole('super_admin'), asyncHandler(platformSupportCtrl.adminListSupportTickets));
router.get('/admin/support-tickets/:id', authenticate, requireRole('super_admin'), asyncHandler(platformSupportCtrl.adminGetSupportTicket));
router.patch('/admin/support-tickets/:id', authenticate, requireRole('super_admin'), asyncHandler(platformSupportCtrl.adminUpdateSupportTicket));
router.post('/admin/support-tickets/:id/messages', authenticate, requireRole('super_admin'), asyncHandler(platformSupportCtrl.adminReplySupportTicket));

router.get('/admin/signup-applications', authenticate, requireRole('super_admin'), asyncHandler(signupApplicationCtrl.adminListSignupApplications));
router.patch('/admin/signup-applications/:id', authenticate, requireRole('super_admin'), asyncHandler(signupApplicationCtrl.adminUpdateSignupApplication));
router.post('/admin/signup-applications/:id/provision', authenticate, requireRole('super_admin'), asyncHandler(signupApplicationCtrl.adminProvisionSignupApplication));

// Platform support (company admin → platform)
router.get('/platform-support/tickets', authenticate, requireRole('company_admin'), requireCompany, asyncHandler(platformSupportCtrl.listMySupportTickets));
router.post('/platform-support/tickets', authenticate, requireRole('company_admin'), requireCompany, asyncHandler(platformSupportCtrl.createMySupportTicket));
router.get('/platform-support/tickets/:id', authenticate, requireRole('company_admin'), requireCompany, asyncHandler(platformSupportCtrl.getMySupportTicket));
router.post('/platform-support/tickets/:id/messages', authenticate, requireRole('company_admin'), requireCompany, asyncHandler(platformSupportCtrl.replyMySupportTicket));

// Company
router.get('/companies/:id', authenticate, companyCtrl.getCompany);
router.put('/companies/:id', authenticate, requireRole('super_admin', 'company_admin'), requireCompany, companyCtrl.updateCompany);
router.post(
  '/companies/:id/logo',
  authenticate,
  requireRole('company_admin'),
  requireCompany,
  companyLogoUpload.single('file'),
  asyncHandler(companyCtrl.uploadCompanyLogo)
);
router.delete(
  '/companies/:id/logo',
  authenticate,
  requireRole('company_admin'),
  requireCompany,
  asyncHandler(companyCtrl.removeCompanyLogo)
);
router.get('/companies/:id/dashboard', authenticate, requireCompany, companyCtrl.getDashboard);
router.get('/dashboard', authenticate, requireCompany, companyCtrl.getDashboard);
router.get('/companies/:id/ai-cost-report', authenticate, requireCompany, companyCtrl.getAICostReportHandler);
router.get('/ai-cost-report', authenticate, requireCompany, companyCtrl.getAICostReportHandler);

// WhatsApp — multi-account
router.get('/whatsapp/accounts', authenticate, requireCompany, whatsappCtrl.listAccounts);
router.post('/whatsapp/accounts', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.createAccount);
router.patch('/whatsapp/accounts/:accountId', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.updateAccount);
router.delete('/whatsapp/accounts/:accountId', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.removeAccount);
router.get('/whatsapp/accounts/:accountId/status', authenticate, requireCompany, whatsappCtrl.getAccountStatus);
router.post('/whatsapp/accounts/:accountId/qr/start', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.startAccountQr);
router.get('/whatsapp/accounts/:accountId/qr/:sessionToken/status', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.getAccountQrStatus);
router.delete('/whatsapp/accounts/:accountId/qr/:sessionToken', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.cancelAccountQr);
router.post('/whatsapp/accounts/:accountId/disconnect', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.disconnectAccountHandler);
router.put('/whatsapp/accounts/:accountId/config', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.updateAccountCloudConfig);
router.post('/whatsapp/accounts/:accountId/test', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.sendAccountTest);
router.get('/whatsapp/limits', authenticate, requireCompany, whatsappCtrl.getWhatsAppLimits);

// Departments
router.get('/departments', authenticate, requireCompany, whatsappCtrl.getDepartments);
router.post('/departments', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.postDepartment);
router.patch('/departments/:id', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.patchDepartment);
router.delete('/departments/:id', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.removeDepartment);

// WhatsApp — legacy single-account (backward compatible)
router.get('/whatsapp/config', authenticate, requireRole('super_admin', 'company_admin'), requireCompany, whatsappCtrl.getWhatsAppConfig);
router.put('/whatsapp/config', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.updateWhatsAppConfig);
router.post('/whatsapp/test', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.sendTest);
router.get('/whatsapp/status', authenticate, requireCompany, whatsappCtrl.getWhatsAppStatus);
router.post('/whatsapp/qr/start', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.startQr);
router.get('/whatsapp/qr/:sessionToken/status', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.getQrStatus);
router.delete('/whatsapp/qr/:sessionToken', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.cancelQr);
router.post('/whatsapp/disconnect', authenticate, requireRole('company_admin'), requireCompany, whatsappCtrl.disconnectWhatsApp);

// Knowledge Base
router.get('/knowledge', authenticate, requireCompany, requireKnowledgeAccess, knowledgeCtrl.getKnowledgeItems);
router.post(
  '/knowledge/parse-file',
  authenticate,
  requireRole('company_admin', 'staff'),
  requireCompany,
  requireKnowledgeAccess,
  (req, res, next) => {
    knowledgeFileUpload.single('file')(req, res, (err) => {
      if (err) next(err);
      else next();
    });
  },
  knowledgeCtrl.parseKnowledgeFile
);
router.post('/knowledge', authenticate, requireRole('company_admin', 'staff'), requireCompany, requireKnowledgeAccess, knowledgeCtrl.createKnowledgeItem);
router.put('/knowledge/:id', authenticate, requireRole('company_admin', 'staff'), requireCompany, requireKnowledgeAccess, knowledgeCtrl.updateKnowledgeItem);
router.delete('/knowledge/:id', authenticate, requireRole('company_admin', 'staff'), requireCompany, requireKnowledgeAccess, knowledgeCtrl.deleteKnowledgeItem);
router.get('/knowledge/:id/index-status', authenticate, requireCompany, requireKnowledgeAccess, knowledgeCtrl.getKnowledgeIndexStatus);
router.get('/knowledge/:id/chunks', authenticate, requireRole('company_admin', 'staff'), requireCompany, requireKnowledgeAccess, knowledgeCtrl.getKnowledgeChunks);
router.post('/knowledge/:id/reindex', authenticate, requireRole('company_admin', 'staff'), requireCompany, requireKnowledgeAccess, knowledgeCtrl.reindexKnowledgeItem);
router.post('/knowledge/:id/index-now', authenticate, requireRole('company_admin', 'staff'), requireCompany, requireKnowledgeAccess, knowledgeCtrl.indexKnowledgeNow);

// Messages
router.get('/messages', authenticate, requireCompany, messagesCtrl.getConversations);
router.get('/messages/media/:messageId', authenticate, requireCompany, messagesCtrl.getMessageMedia);
router.get('/messages/:phone', authenticate, requireCompany, messagesCtrl.getConversationMessages);
router.patch('/messages/:phone/customer-name', authenticate, requireRole('company_admin'), requireCompany, messagesCtrl.updateCustomerName);
router.post('/messages/:phone/reply', authenticate, requireCompany, messagesCtrl.replyToConversation);
router.post(
  '/messages/:phone/reply-image',
  authenticate,
  requireCompany,
  messageImageUpload.single('file'),
  asyncHandler(messagesCtrl.replyWithImage)
);

// Unknown questions (Business / Enterprise)
router.get('/unknown-questions', authenticate, requireCompany, asyncHandler(unknownQuestionsCtrl.getUnknownQuestions));
router.patch(
  '/unknown-questions/:id',
  authenticate,
  requireRole('company_admin'),
  requireCompany,
  asyncHandler(unknownQuestionsCtrl.patchUnknownQuestion)
);

// Tickets
router.get('/tickets', authenticate, requireCompany, ticketsCtrl.getTickets);
router.get('/tickets/active/:phone', authenticate, requireCompany, ticketsCtrl.getActiveTicketByPhone);
router.post('/tickets', authenticate, requireCompany, ticketsCtrl.createTicket);
router.put('/tickets/:id', authenticate, requireCompany, ticketsCtrl.updateTicket);
router.patch('/tickets/:id/claim', authenticate, requireCompany, ticketsCtrl.claimTicket);
router.patch('/tickets/:id/transfer', authenticate, requireCompany, ticketsCtrl.transferTicket);
router.patch('/tickets/:id/assign', authenticate, requireRole('company_admin'), requireCompany, ticketsCtrl.assignTicket);

// Notifications
router.get('/notifications/recipients', authenticate, requireRole('company_admin'), requireCompany, asyncHandler(notificationsCtrl.getNotificationRecipients));
router.put('/notifications/recipients', authenticate, requireRole('company_admin'), requireCompany, asyncHandler(notificationsCtrl.updateNotificationRecipients));

// Staff
router.get('/staff', authenticate, requireCompany, staffCtrl.getStaff);
router.post('/staff', authenticate, requireRole('company_admin'), requireCompany, asyncHandler(staffCtrl.createStaff));
router.put('/staff/:id', authenticate, requireRole('company_admin'), requireCompany, asyncHandler(staffCtrl.updateStaff));
router.patch('/staff/:id/password', authenticate, requireRole('company_admin'), requireCompany, asyncHandler(staffCtrl.resetStaffPasswordHandler));
router.delete('/staff/:id', authenticate, requireRole('company_admin'), requireCompany, asyncHandler(staffCtrl.deleteStaff));

// Appointments
router.get('/appointments', authenticate, requireCompany, appointmentsCtrl.getAppointments);
router.post('/appointments', authenticate, requireCompany, appointmentsCtrl.createAppointmentHandler);
router.put('/appointments/:id', authenticate, requireCompany, appointmentsCtrl.updateAppointmentHandler);
router.delete('/appointments/:id', authenticate, requireRole('company_admin', 'staff'), requireCompany, appointmentsCtrl.deleteAppointmentHandler);

// Public (kimlik doğrulama gerektirmeyen) uç noktalar
router.get('/public/plans', asyncHandler(subscriptionCtrl.getPublicPlans));
router.get('/public/reference-logos', asyncHandler(referenceLogosCtrl.getPublicReferenceLogos));
router.get('/public/signup-captcha', asyncHandler(signupApplicationCtrl.getSignupCaptcha));
router.post('/public/signup-applications', asyncHandler(signupApplicationCtrl.submitSignupApplication));

// Subscriptions
router.get('/subscriptions/current', authenticate, requireCompany, subscriptionCtrl.getCurrentSubscription);
router.get('/subscriptions/usage', authenticate, requireCompany, subscriptionCtrl.getUsage);
router.get('/subscriptions/plans', authenticate, subscriptionCtrl.getPlans);
router.get('/subscriptions/addons', authenticate, requireCompany, subscriptionCtrl.getConversationAddons);
router.post('/subscriptions/addons/:id/purchase', authenticate, requireRole('company_admin'), requireCompany, asyncHandler(subscriptionCtrl.purchaseConversationAddon));

export default router;
