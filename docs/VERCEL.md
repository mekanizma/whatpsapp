# Vercel Yayın Rehberi

Tek Vercel projesi: **frontend (statik)** + **backend (serverless API)** aynı domainde çalışır.

```
https://your-app.vercel.app/          → React panel
https://your-app.vercel.app/api/v1/*  → Express API
https://your-app.vercel.app/health    → Sağlık kontrolü
```

---

## 1. Hızlı Kurulum

1. [vercel.com](https://vercel.com) → **Add New Project**
2. GitHub repo: `mekanizma/whatpsapp`
3. **Framework Preset:** Other
4. Root Directory: **boş bırakın** (repo kökü)
5. Vercel `vercel.json` dosyasını otomatik okur
6. Environment Variables ekleyin (aşağıya bakın)
7. **Deploy**

---

## 2. Ortam Değişkenleri (Vercel Dashboard)

Tüm değişkenleri **Production**, **Preview** ve **Development** için ekleyin.

### Backend (zorunlu)

| Değişken | Açıklama |
|----------|----------|
| `SUPABASE_URL` | Supabase proje URL |
| `SUPABASE_ANON_KEY` | Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `OPENAI_API_KEY` | OpenAI API key |
| `WHATSAPP_VERIFY_TOKEN` | Webhook doğrulama token |
| `NODE_ENV` | `production` |

### Opsiyonel

| Değişken | Varsayılan |
|----------|------------|
| `OPENAI_MODEL` | `gpt-4o-mini` |
| `DEMO_MODE` | `false` |
| `CORS_ORIGIN` | Gerekmez (aynı domain) — özel domain için ekleyin |

### Frontend (build sırasında)

| Değişken | Vercel'de değer |
|----------|-----------------|
| `VITE_SUPABASE_URL` | Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | Anon key |
| `VITE_API_URL` | **Boş bırakın** veya `/api/v1` |

> Aynı domainde olduğu için `VITE_API_URL` gerekmez — otomatik `/api/v1` kullanılır.

---

## 3. Supabase Auth Ayarları

Supabase → **Authentication → URL Configuration**

- **Site URL:** `https://your-app.vercel.app`
- **Redirect URLs:**
  - `https://your-app.vercel.app/**`
  - `https://*.vercel.app/**` (preview deploylar için)

---

## 4. Mimari

```
vercel.json
├── frontend/dist     → Statik dosyalar (Vite build)
└── api/index.ts      → Express serverless handler
    └── backend/dist/app.js
```

**Build sırası** (`npm run vercel-build`):
1. `backend` → TypeScript derleme
2. `frontend` → Vite production build

---

## 5. WhatsApp (Baileys) Uyarısı

Vercel **serverless** ortamıdır:
- Kalıcı WebSocket bağlantısı desteklenmez
- Oturum dosyaları saklanamaz
- **Baileys QR WhatsApp bağlantısı Vercel'de çalışmaz**

Panel, AI yanıtlar, ticket, admin ve Supabase özellikleri çalışır. WhatsApp için ayrı bir sunucu (Railway, Fly.io, VPS) gerekir veya Meta Cloud API webhook kullanılabilir.

---

## 6. Yerel Geliştirme

```bash
npm run install:all
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm run dev
```

Vercel ortamını simüle etmek için:
```bash
npx vercel dev
```

---

## 7. Özel Domain

1. Vercel → Project → **Domains** → domain ekleyin
2. Supabase redirect URL'lerini güncelleyin
3. `CORS_ORIGIN` = `https://yourdomain.com` (gerekirse)

---

## 8. Sorun Giderme

| Sorun | Çözüm |
|-------|-------|
| API 404 | `vercel.json` rewrites kontrol edin, yeniden deploy |
| `Cannot find module` | `installCommand` çalıştığından emin olun |
| Giriş çalışmıyor | Supabase redirect URL'leri |
| Build hatası | Vercel loglarında `vercel-build` çıktısına bakın |
| WhatsApp QR | Vercel'de desteklenmez — ayrı sunucu gerekir |

---

## 9. Render'dan Fark

| | Vercel | Render |
|---|--------|--------|
| Frontend + API | Tek proje, aynı URL | İki ayrı servis |
| API tipi | Serverless | Sürekli çalışan Node |
| WhatsApp Baileys | ❌ | ✅ (disk ile) |
| Cold start | Var (~1-3 sn) | Free'de uyku |
