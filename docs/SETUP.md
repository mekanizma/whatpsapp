# Kurulum Rehberi

## Gereksinimler

- Node.js 20+
- npm 10+
- Supabase hesabı ([supabase.com](https://supabase.com))
- OpenAI API key
- Meta Developer hesabı (WhatsApp Cloud API için)

---

## 1. Projeyi Klonla / İndir

```bash
cd whastap
```

---

## 2. Supabase Kurulumu

1. [Supabase Dashboard](https://app.supabase.com) üzerinde yeni proje oluştur
2. SQL Editor'de migration dosyalarını sırayla çalıştır:
   - `database/migrations/001_enums_and_extensions.sql`
   - `database/migrations/002_core_tables.sql`
   - `database/migrations/003_rls_policies.sql`
   - `database/migrations/004_seed_data.sql`
3. Project Settings → API'den şunları al:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

---

## 3. Backend Kurulumu

```bash
cd backend
cp .env.example .env
# .env dosyasını düzenle
npm install
npm run dev
```

Backend varsayılan olarak `http://localhost:3001` adresinde çalışır.

---

## 4. Frontend Kurulumu

```bash
cd frontend
cp .env.example .env
# .env dosyasını düzenle
npm install
npm run dev
```

Frontend varsayılan olarak `http://localhost:5173` adresinde çalışır.

---

## 5. Environment Variables

### Backend (.env)

```env
PORT=3001
NODE_ENV=development

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI
OPENAI_API_KEY=sk-your-openai-key
OPENAI_MODEL=gpt-4o-mini

# WhatsApp (Meta Cloud API)
WHATSAPP_VERIFY_TOKEN=your-webhook-verify-token
WHATSAPP_API_VERSION=v21.0

# Security
JWT_SECRET=your-jwt-secret
CORS_ORIGIN=http://localhost:5173
```

### Frontend (.env)

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:3001/api/v1
```

---

## 6. WhatsApp Webhook Kurulumu

1. Meta Developer Console → WhatsApp → Configuration
2. Webhook URL: `https://your-domain.com/webhook/whatsapp`
3. Verify Token: `.env` dosyasındaki `WHATSAPP_VERIFY_TOKEN` ile aynı
4. Subscribe: `messages` event

---

## 7. İlk Super Admin Oluşturma

Supabase Auth üzerinden kullanıcı oluşturduktan sonra SQL Editor'de:

```sql
UPDATE profiles
SET role = 'super_admin', company_id = NULL
WHERE user_id = 'YOUR-USER-UUID';
```

---

## 8. Geliştirme Komutları

```bash
# Root - her iki servisi birlikte
npm run dev

# Sadece backend
cd backend && npm run dev

# Sadece frontend
cd frontend && npm run dev

# Backend build
cd backend && npm run build

# Frontend build
cd frontend && npm run build

# Type check
cd backend && npm run typecheck
cd frontend && npm run typecheck
```

---

## 9. Proje Yapısı

```
whatsap/
├── frontend/          # React + Vite panel
├── backend/           # Express.js API
├── database/          # Supabase migrations
├── docs/              # Dokümantasyon
├── package.json       # Root workspace scripts
└── README.md
```
