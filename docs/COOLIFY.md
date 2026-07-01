# Coolify Yayın Rehberi

Tek Coolify uygulaması üzerinde **frontend + backend + WhatsApp QR (Baileys)** birlikte çalışır.

```
https://your-domain.example.com/              → React panel
https://your-domain.example.com/api/v1/*      → Express API
https://your-domain.example.com/webhook/whatsapp → Meta webhook
https://your-domain.example.com/health          → Health check
```

---

## 1. Coolify'da Deploy

### Yöntem A — Dockerfile (önerilen)

1. Coolify → **New Resource** → **Application**
2. GitHub/GitLab repo bağlayın (`main` branch)
3. **Build Pack:** `Dockerfile`
4. **Port Exposes:** `3001`
5. **Health Check Path:** `/health`
6. **Domain** ekleyin (ör. `whatsapp.example.com`)
7. Environment variables ekleyin (aşağıdaki tablo)
8. **Persistent Storage** ekleyin (WhatsApp QR için — bölüm 3)
9. **Deploy**

### Yöntem B — Docker Compose

1. Coolify → **New Resource** → **Docker Compose**
2. Repo seçin — `docker-compose.yaml` otomatik okunur
3. Secret env değişkenlerini doldurun
4. Domain ve deploy

---

## 2. Environment Variables

| Değişken | Build | Runtime | Açıklama |
|----------|-------|---------|----------|
| `VITE_SUPABASE_URL` | ✅ | — | Frontend build — `SUPABASE_URL` ile aynı |
| `VITE_SUPABASE_ANON_KEY` | ✅ | — | Frontend build — `SUPABASE_ANON_KEY` ile aynı |
| `VITE_DEMO_MODE` | ✅ | — | `false` |
| `SUPABASE_URL` | — | ✅ | Supabase proje URL |
| `SUPABASE_ANON_KEY` | — | ✅ | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | — | ✅ | Supabase service role key |
| `OPENAI_API_KEY` | — | ✅ | OpenAI API key |
| `WHATSAPP_VERIFY_TOKEN` | — | ✅ | Meta webhook doğrulama token |
| `DEMO_MODE` | — | ✅ | `false` |
| `SESSIONS_DIR` | — | ✅ | `/data/sessions` |
| `NODE_ENV` | — | ✅ | `production` |

Coolify otomatik ekler: `PORT`, `COOLIFY_URL`, `COOLIFY_FQDN`, `HOST`

`VITE_API_URL` **gerekmez** — frontend `/api/v1` kullanır (aynı domain).

**Build Variable:** `VITE_*` değişkenlerini Coolify'da **Build Variable** olarak işaretleyin (Runtime kapalı olabilir).

---

## 3. WhatsApp QR (Baileys) — Kalıcı Depolama

QR bağlantısı için **Persistent Storage** gerekir:

| Ayar | Değer |
|------|-------|
| Destination (container) | `/data/sessions` |
| `SESSIONS_DIR` env | `/data/sessions` |

Coolify → Uygulama → **Storages** → Add:

- **Name:** `whatsapp-sessions`
- **Destination Path:** `/data/sessions`

Deploy veya restart sonrası WhatsApp oturumu volume'dan geri yüklenir.

**Render'dan fark:** Coolify'da uyku modu yok — keep-alive cron job gerekmez.

---

## 3b. WhatsApp Kopması — Kontrol Listesi

| Kontrol | Beklenen |
|---------|----------|
| `SESSIONS_DIR` | `/data/sessions` |
| Persistent Storage | `/data/sessions` mount edilmiş |
| Log: `[Baileys] Oturum dizini` | Deploy loglarında görünmeli |
| Log: `Oturum geri yükleniyor` | Restart sonrası görünmeli |

Kopma sonrası uygulama otomatik yeniden bağlanır (QR gerekmez). Yalnızca WhatsApp'tan **çıkış yapıldıysa** (`loggedOut`) yeni QR gerekir.

---

## 4. Supabase Auth Ayarları

Supabase Dashboard → **Authentication → URL Configuration**:

- **Site URL:** `https://your-domain.example.com`
- **Redirect URLs:**
  - `https://your-domain.example.com/**`
  - `http://localhost:5173/**` (yerel geliştirme)

Coolify domain'inizi `COOLIFY_URL` env'den alabilirsiniz.

---

## 5. Meta WhatsApp Webhook (Cloud API)

Cloud API kullanıyorsanız:

1. Meta Developer Console → WhatsApp → Configuration
2. **Callback URL:** `https://your-domain.example.com/webhook/whatsapp`
3. **Verify Token:** `WHATSAPP_VERIFY_TOKEN` ile aynı
4. Subscribe: `messages`

---

## 6. Yerel Geliştirme vs Coolify

| | Yerel | Coolify |
|---|-------|---------|
| Frontend | `localhost:5173` (Vite) | Aynı domain (Express static) |
| Backend | `localhost:3001` | Aynı süreç |
| QR/Baileys | `backend/sessions/` | Persistent volume `/data/sessions` |
| API URL | `VITE_API_URL=http://localhost:3001/api/v1` | Boş (otomatik `/api/v1`) |

---

## 7. Komutlar

```bash
# Yerel production build testi
npm run build
PORT=3001 NODE_ENV=production npm start

# Docker build testi (yerel)
docker build \
  --build-arg VITE_SUPABASE_URL=https://xxx.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=eyJ... \
  --build-arg VITE_DEMO_MODE=false \
  -t whatsapp-ai .
docker run -p 3001:3001 --env-file backend/.env -v whatsapp-data:/data/sessions whatsapp-ai

# Supabase kullanıcı kurulumu (yerel)
cd backend
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=xxx npx tsx src/scripts/setup-supabase.ts
```

---

## 8. Sorun Giderme

| Sorun | Çözüm |
|-------|-------|
| Bad Gateway (502) | Port Exposes = `3001`, uygulama `0.0.0.0:PORT` dinliyor mu |
| Health check başarısız | `/health` endpoint, logları kontrol edin |
| QR çalışmıyor | Persistent Storage `/data/sessions` mount edilmiş mi |
| Giriş çalışmıyor | Supabase redirect URL'leri |
| API 404 | Build loglarında frontend dist üretildi mi |
| WhatsApp kopuyor | Volume + `SESSIONS_DIR` eşleşmeli |
| Her restart'ta QR | Persistent Storage bağlı değil |
| Build'de VITE hatası | `VITE_*` Build Variable olarak işaretli mi |
| Build OOM / exit 255 | Sunucuda en az 2 GB RAM; Dockerfile `NODE_OPTIONS` kullanır |
| Frontend build düşüyor | Logda `heap out of memory` — Coolify build kaynaklarını artırın |

---

## Dosya Yapısı

| Dosya | Açıklama |
|-------|----------|
| `Dockerfile` | Multi-stage build — frontend + backend |
| `docker-compose.yaml` | Opsiyonel Compose deploy |
| `.dockerignore` | Build context optimizasyonu |
| `package.json` | `build` + `start` komutları |
| `backend/src/app.ts` | API + static frontend |
| `backend/src/index.ts` | Baileys oturum restore |
