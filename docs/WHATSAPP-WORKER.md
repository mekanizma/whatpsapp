# WhatsApp Worker Kurulumu

Vercel **serverless** ortamında Baileys (QR WhatsApp) çalışmaz. Çözüm: **ayrı Worker servisi** sürekli çalışır, Vercel API ona bağlanır.

```
┌─────────────┐     HTTP      ┌──────────────────┐
│   Vercel    │ ────────────► │  WhatsApp Worker │
│  (Panel+API)│  X-Worker-    │  (Railway/Render)│
└─────────────┘   Secret      │  Baileys + QR    │
                              └──────────────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │     Supabase     │
                              └──────────────────┘
```

---

## 1. Worker'ı Railway'de Deploy Et (Önerilen)

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
2. Repo: `mekanizma/whatpsapp`
3. **Root Directory:** `backend`
4. **Start Command:** `npm run worker`
5. **Volume ekle** (kalıcı WhatsApp oturumu için):
   - Mount path: `/data`
   - Env: `SESSIONS_DIR=/data/sessions`

### Worker Environment Variables

| Değişken | Açıklama |
|----------|----------|
| `SUPABASE_URL` | Supabase URL |
| `SUPABASE_ANON_KEY` | Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role |
| `OPENAI_API_KEY` | AI yanıtlar için |
| `WHATSAPP_VERIFY_TOKEN` | Herhangi güçlü token |
| `WHATSAPP_WORKER_SECRET` | Güçlü gizli anahtar (Vercel ile aynı) |
| `SESSIONS_DIR` | `/data/sessions` (volume ile) |
| `NODE_ENV` | `production` |

Deploy sonrası Railway URL'nizi alın: `https://whatsapp-worker-production-xxxx.up.railway.app`

---

## 2. Vercel'e Worker Bağlantısı

Vercel Dashboard → Environment Variables:

| Değişken | Değer |
|----------|-------|
| `WHATSAPP_WORKER_URL` | `https://whatsapp-worker-production-xxxx.up.railway.app` |
| `WHATSAPP_WORKER_SECRET` | Worker ile **aynı** secret |

**Redeploy** Vercel projesini.

---

## 3. Yerel Geliştirme

Worker olmadan (tek makine):
```bash
# backend/.env — WHATSAPP_WORKER_URL boş bırakın
npm run dev
```

Worker ile test:
```bash
# Terminal 1
cd backend && npm run worker:dev

# Terminal 2 — backend/.env:
# WHATSAPP_WORKER_URL=http://localhost:3002
# WHATSAPP_WORKER_SECRET=dev-secret-123
npm run dev
```

---

## 4. Render'da Worker (Alternatif)

1. **New Web Service** → repo `backend` klasörü
2. **Start Command:** `npm run worker`
3. **Disk:** 1GB → `/data`, `SESSIONS_DIR=/data/sessions`
4. Free plan: oturumlar yeniden başlatmada silinir

---

## 5. Docker ile Worker

```bash
cd backend
docker build -f Dockerfile.worker -t whatsapp-worker .
docker run -p 3002:3002 \
  -v wa-sessions:/data/sessions \
  --env-file .env \
  -e SESSIONS_DIR=/data/sessions \
  whatsapp-worker
```

---

## 6. Güvenlik

- `WHATSAPP_WORKER_SECRET` en az 32 karakter rastgele string olsun
- Worker URL'sini gizli tutun — sadece Vercel API erişmeli
- Worker `/internal/*` rotaları secret olmadan 401 döner

Secret üretmek:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 7. Test

1. Worker health: `https://your-worker.railway.app/health`
2. Panel → WhatsApp → QR Başlat
3. Telefonla QR tara
4. Test mesajı gönder

---

## 8. Sorun Giderme

| Sorun | Çözüm |
|-------|-------|
| QR başlamıyor (503) | Vercel'de `WHATSAPP_WORKER_URL` ayarlı mı? |
| Worker 401 | `WHATSAPP_WORKER_SECRET` her iki tarafta aynı mı? |
| Bağlantı kopuyor | Railway volume + `SESSIONS_DIR` kontrol edin |
| Mesaj gelmiyor | Worker loglarında `[Baileys] Gelen mesaj` arayın |
| AI yanıt yok | Worker'da `OPENAI_API_KEY` ayarlı mı? |

---

## 9. Mimari Özet

| Bileşen | Platform | Görev |
|---------|----------|-------|
| Frontend + API | Vercel | Panel, REST API, auth |
| WhatsApp Worker | Railway/Render/VPS | Baileys QR, mesaj al/gönder |
| Veritabanı | Supabase | Mesajlar, şirketler, AI log |
