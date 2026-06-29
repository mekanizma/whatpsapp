# AI WhatsApp Müşteri Temsilcisi SaaS — Sistem Mimarisi

## Genel Bakış

KKTC ve Türkiye pazarına yönelik çok kiracılı (multi-tenant) bir SaaS platformu. Şirketler WhatsApp üzerinden gelen müşteri mesajlarını AI ile otomatik yanıtlar, gerektiğinde personele aktarır ve tüm iletişimi web panelinden yönetir.

---

## Sistem Mimarisi Diyagramı

```mermaid
flowchart TB
    subgraph Clients["İstemciler"]
        WEB["Web Panel<br/>(React + Vite)"]
        MOBILE["Mobil App<br/>(Gelecek - React Native)"]
    end

    subgraph API["Backend API Layer"]
        EXPRESS["Express.js REST API<br/>(TypeScript)"]
        AUTH_MW["Auth Middleware<br/>(Supabase JWT)"]
        TENANT_MW["Tenant Middleware<br/>(company_id scope)"]
        RATE_MW["Rate Limiter"]
    end

    subgraph Services["Servis Katmanı"]
        AI_SVC["AI Service<br/>(OpenAI)"]
        WA_SVC["WhatsApp Service<br/>(Meta Cloud API)"]
        MSG_SVC["Message Service"]
        TICKET_SVC["Ticket Service"]
        SUB_SVC["Subscription Service"]
        LOG_SVC["Activity Log Service"]
    end

    subgraph External["Harici Servisler"]
        OPENAI["OpenAI API"]
        META["Meta WhatsApp<br/>Cloud API"]
    end

    subgraph Supabase["Supabase Platform"]
        PG["PostgreSQL<br/>(Multi-tenant RLS)"]
        SAUTH["Supabase Auth"]
        STORAGE["Supabase Storage<br/>(Logolar, medya)"]
    end

    WEB --> EXPRESS
    MOBILE -.-> EXPRESS
    META -->|Webhook| EXPRESS

    EXPRESS --> AUTH_MW --> TENANT_MW --> RATE_MW
    RATE_MW --> Services

    AI_SVC --> OPENAI
    WA_SVC --> META

    Services --> PG
    AUTH_MW --> SAUTH
    Services --> STORAGE
```

---

## Mesaj Akış Diyagramı (AI Chat Engine)

```mermaid
sequenceDiagram
    participant C as Müşteri (WhatsApp)
    participant M as Meta Cloud API
    participant B as Backend Webhook
    participant DB as PostgreSQL
    participant AI as OpenAI API

    C->>M: Mesaj gönder
    M->>B: POST /webhook/whatsapp
    B->>DB: Şirketi bul (phone_number)
    B->>DB: Mesajı kaydet (sender: customer)
    B->>DB: Bilgi bankasını çek
    B->>AI: Prompt + knowledge base
    AI-->>B: AI cevabı

    alt İnsan desteği gerekli
        B->>DB: Ticket oluştur
        B->>M: "Temsilcimize bağlıyorum"
    else Normal cevap
        B->>DB: Mesajı kaydet (sender: ai)
        B->>M: Cevap gönder
        M->>C: WhatsApp mesajı
    end
```

---

## Rol ve Yetki Matrisi

| Modül | SUPER_ADMIN | COMPANY_ADMIN | STAFF |
|-------|:-----------:|:-------------:|:-----:|
| Tüm şirketler | ✅ | ❌ | ❌ |
| Şirket oluşturma | ✅ | ❌ | ❌ |
| Paket yönetimi | ✅ | ❌ | ❌ |
| Platform istatistikleri | ✅ | ❌ | ❌ |
| Firma bilgileri | ✅ | ✅ | ❌ |
| WhatsApp bağlantısı | ✅ | ✅ | ❌ |
| AI bilgi bankası | ✅ | ✅ | ❌ |
| Personel yönetimi | ✅ | ✅ | ❌ |
| Tüm mesajlar | ✅ | ✅ | ❌ |
| Atanan konuşmalar | ✅ | ✅ | ✅ |
| Manuel cevap | ✅ | ✅ | ✅ |
| Ticket yönetimi | ✅ | ✅ | ✅ (atanan) |

---

## API Mimarisi (Mobile-Ready REST)

Tüm endpoint'ler `/api/v1/` prefix'i ile versiyonlanır.

```
POST   /api/v1/auth/login
POST   /api/v1/auth/register
GET    /api/v1/auth/me

# Super Admin
GET    /api/v1/admin/companies
POST   /api/v1/admin/companies
GET    /api/v1/admin/stats
GET    /api/v1/admin/subscriptions

# Company
GET    /api/v1/companies/:id
PUT    /api/v1/companies/:id
GET    /api/v1/companies/:id/dashboard

# WhatsApp
GET    /api/v1/whatsapp/config
PUT    /api/v1/whatsapp/config
POST   /api/v1/whatsapp/test
GET    /api/v1/whatsapp/status
POST   /webhook/whatsapp          (Meta webhook - auth yok)

# Knowledge Base
GET    /api/v1/knowledge
POST   /api/v1/knowledge
PUT    /api/v1/knowledge/:id
DELETE /api/v1/knowledge/:id

# Messages
GET    /api/v1/messages
GET    /api/v1/messages/:conversationId
POST   /api/v1/messages/:conversationId/reply

# Tickets
GET    /api/v1/tickets
POST   /api/v1/tickets
PUT    /api/v1/tickets/:id
PATCH  /api/v1/tickets/:id/assign

# Staff
GET    /api/v1/staff
POST   /api/v1/staff
PUT    /api/v1/staff/:id
DELETE /api/v1/staff/:id

# Subscriptions
GET    /api/v1/subscriptions/current
GET    /api/v1/subscriptions/usage
```

---

## Güvenlik Katmanları

1. **Supabase Auth** — JWT tabanlı kimlik doğrulama
2. **RLS (Row Level Security)** — PostgreSQL seviyesinde tenant izolasyonu
3. **API Middleware** — Rol ve company_id doğrulama
4. **Webhook Verification** — Meta verify token kontrolü
5. **Rate Limiting** — API abuse koruması
6. **Environment Variables** — Tüm secret'lar .env'de

---

## Teknoloji Stack

| Katman | Teknoloji |
|--------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind, Shadcn UI, React Query, React Router, Zustand |
| Backend | Node.js, Express.js, TypeScript |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| AI | OpenAI API (gpt-4o-mini) |
| WhatsApp | Meta WhatsApp Cloud API |

---

## Deployment Mimarisi (Önerilen)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Vercel    │     │   Railway   │     │  Supabase   │
│  (Frontend) │────▶│  (Backend)  │────▶│  (DB+Auth)  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Meta + OAI  │
                    └─────────────┘
```
