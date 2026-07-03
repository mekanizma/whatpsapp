/**
 * Application root component with routing
 * Admin panel: /admin/* | Müşteri paneli: /panel/*
 */

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { AuthQuerySync } from '@/components/AuthQuerySync';
import { RoleRoute } from '@/components/RoleRoute';
import { AdminOnlyRoute, PanelIndexRedirect } from '@/components/AdminOnlyRoute';
import { PlanModuleRoute } from '@/components/PlanModuleRoute';
import { AdminLayout } from '@/layouts/AdminLayout';
import { CompanyLayout } from '@/layouts/CompanyLayout';
import { LoginPage } from '@/pages/LoginPage';
import { AdminLoginPage } from '@/pages/AdminLoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { MessagesPage } from '@/pages/MessagesPage';
import { KnowledgePage } from '@/pages/KnowledgePage';
import { TicketsPage } from '@/pages/TicketsPage';
import { StaffPage } from '@/pages/StaffPage';
import { WhatsAppPage } from '@/pages/WhatsAppPage';
import { SubscriptionPage } from '@/pages/SubscriptionPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { CalendarPage } from '@/pages/CalendarPage';
import { AiInsightsPage } from '@/pages/AiInsightsPage';
import { CustomersPage } from '@/pages/CustomersPage';
import { UnknownQuestionsPage } from '@/pages/UnknownQuestionsPage';
import { TodayActivityPage } from '@/pages/TodayActivityPage';
import { AdminPage } from '@/pages/AdminPage';
import { AdminCompaniesPage } from '@/pages/AdminCompaniesPage';
import { AdminCompanyDetailPage } from '@/pages/AdminCompanyDetailPage';
import { AdminUsagePage } from '@/pages/AdminUsagePage';
import { AdminActivityPage } from '@/pages/AdminActivityPage';
import { AdminSettingsPage } from '@/pages/AdminSettingsPage';
import { AdminPromptsPage } from '@/pages/AdminPromptsPage';
import { AdminPlansPage } from '@/pages/AdminPlansPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});

function AppRoutes() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <Routes>
      {/* Giriş sayfaları */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Admin Panel - sadece super_admin */}
      <Route
        path="/admin"
        element={
          <RoleRoute allowedRoles={['super_admin']} redirectTo="/admin/login">
            <AdminLayout />
          </RoleRoute>
        }
      >
        <Route index element={<AdminPage />} />
        <Route path="companies" element={<AdminCompaniesPage />} />
        <Route path="companies/:id" element={<AdminCompanyDetailPage />} />
        <Route path="usage" element={<AdminUsagePage />} />
        <Route path="activity" element={<AdminActivityPage />} />
        <Route path="prompts" element={<AdminPromptsPage />} />
        <Route path="plans" element={<AdminPlansPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
      </Route>

      {/* Müşteri Paneli - company_admin ve staff */}
      <Route
        path="/panel"
        element={
          <RoleRoute allowedRoles={['company_admin', 'staff']} redirectTo="/login">
            <CompanyLayout />
          </RoleRoute>
        }
      >
        <Route index element={<PanelIndexRedirect />} />
        <Route path="dashboard" element={<PlanModuleRoute module="dashboard"><AdminOnlyRoute><DashboardPage /></AdminOnlyRoute></PlanModuleRoute>} />
        <Route path="messages" element={<PlanModuleRoute module="messages"><MessagesPage /></PlanModuleRoute>} />
        <Route path="activity/today" element={<PlanModuleRoute module="dashboard"><AdminOnlyRoute><TodayActivityPage /></AdminOnlyRoute></PlanModuleRoute>} />
        <Route path="ai-insights" element={<PlanModuleRoute module="dashboard"><AdminOnlyRoute><AiInsightsPage /></AdminOnlyRoute></PlanModuleRoute>} />
        <Route path="customers" element={<PlanModuleRoute module="customers"><AdminOnlyRoute><CustomersPage /></AdminOnlyRoute></PlanModuleRoute>} />
        <Route path="knowledge" element={<PlanModuleRoute module="knowledge"><KnowledgePage /></PlanModuleRoute>} />
        <Route path="unknown-questions" element={<PlanModuleRoute module="unknown_questions"><AdminOnlyRoute><UnknownQuestionsPage /></AdminOnlyRoute></PlanModuleRoute>} />
        <Route path="tickets" element={<PlanModuleRoute module="tickets"><TicketsPage /></PlanModuleRoute>} />
        <Route path="calendar" element={<PlanModuleRoute module="calendar"><AdminOnlyRoute><CalendarPage /></AdminOnlyRoute></PlanModuleRoute>} />
        <Route path="staff" element={<PlanModuleRoute module="staff"><AdminOnlyRoute><StaffPage /></AdminOnlyRoute></PlanModuleRoute>} />
        <Route path="whatsapp" element={<PlanModuleRoute module="whatsapp"><AdminOnlyRoute><WhatsAppPage /></AdminOnlyRoute></PlanModuleRoute>} />
        <Route path="subscription" element={<PlanModuleRoute module="subscription"><AdminOnlyRoute><SubscriptionPage /></AdminOnlyRoute></PlanModuleRoute>} />
        <Route path="settings" element={<PlanModuleRoute module="settings"><SettingsPage /></PlanModuleRoute>} />
      </Route>

      {/* Eski URL yönlendirmeleri */}
      <Route path="/dashboard" element={<Navigate to="/panel/dashboard" replace />} />
      <Route path="/messages" element={<Navigate to="/panel/messages" replace />} />
      <Route path="/whatsapp" element={<Navigate to="/panel/whatsapp" replace />} />

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthQuerySync />
      <BrowserRouter>
        <div className="app-shell min-h-[100dvh]">
          <AppRoutes />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
