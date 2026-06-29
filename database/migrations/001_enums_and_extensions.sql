-- Migration 001: Extensions and Enum Types
-- AI WhatsApp SaaS Platform - Supabase PostgreSQL

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- User roles
CREATE TYPE user_role AS ENUM ('super_admin', 'company_admin', 'staff');

-- Company categories
CREATE TYPE company_category AS ENUM (
  'universite', 'klinik', 'dis_hekimi', 'guzellik_merkezi',
  'emlak', 'rent_a_car', 'otel', 'restoran', 'kurs', 'diger'
);

-- Company status
CREATE TYPE company_status AS ENUM ('active', 'inactive', 'suspended', 'trial');

-- Subscription plan types
CREATE TYPE subscription_plan_type AS ENUM ('starter', 'business', 'enterprise');

-- Subscription status
CREATE TYPE subscription_status AS ENUM ('active', 'expired', 'cancelled', 'trial');

-- WhatsApp connection status
CREATE TYPE whatsapp_status AS ENUM ('connected', 'disconnected', 'pending', 'error');

-- Message sender types
CREATE TYPE message_sender_type AS ENUM ('customer', 'ai', 'staff');

-- Message status
CREATE TYPE message_status AS ENUM ('open', 'closed', 'transferred');

-- Ticket priority
CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- Ticket status
CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');

-- Staff roles within a company
CREATE TYPE staff_role AS ENUM ('admin', 'agent', 'supervisor');
