/**
 * Application root component with routing
 * Admin panel: /admin/* | Müşteri paneli: /panel/*
 */

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { RoleRoute } from '@/components/RoleRoute';
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
import { TodayActivityPage } from '@/pages/TodayActivityPage';
import { AdminPage } from '@/pages/AdminPage';
import { AdminCompaniesPage } from '@/pages/AdminCompaniesPage';
import { AdminCompanyDetailPage } from '@/pages/AdminCompanyDetailPage';
import { AdminUsagePage } from '@/pages/AdminUsagePage';
import { AdminActivityPage } from '@/pages/AdminActivityPage';
import { AdminSettingsPage } from '@/pages/AdminSettingsPage';

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
        <Route index element={<Navigate to="/panel/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="activity/today" element={<TodayActivityPage />} />
        <Route path="ai-insights" element={<AiInsightsPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="tickets" element={<TicketsPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="whatsapp" element={<WhatsAppPage />} />
        <Route path="subscription" element={<SubscriptionPage />} />
        <Route path="settings" element={<SettingsPage />} />
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
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
