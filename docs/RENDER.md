# Render Yayın Rehberi

Tek Render Web Service üzerinde **frontend + backend + WhatsApp QR (Baileys)** birlikte çalışır.

```
https://whatsapp-ai.onrender.com/           → React panel
https://whatsapp-ai.onrender.com/api/v1/*   → Express API
https://whatsapp-ai.onrender.com/webhook/whatsapp → Meta webhook
https://whatsapp-ai.onrender.com/health     → Health check
```

---

## 1. Blueprint ile Deploy

1. Kodu GitHub'a push edin (`main` branch)
2. [Render Blueprint](https://dashboard.render.com/blueprint/new?repo=https://github.com/mekanizma/whatpsapp) açın
3. GitHub bağlantısını tamamlayın
4. **Secret** env değişkenlerini doldurun (aşağıdaki tablo)
5. **Apply** → deploy başlar

---

## 2. Gerekli Environment Variables

| Değişken | Açıklama |
|----------|----------|
| `SUPABASE_URL` | Supabase proje URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `OPENAI_API_KEY` | OpenAI API key |
| `WHATSAPP_VERIFY_TOKEN` | Meta webhook doğrulama token |
| `VITE_SUPABASE_URL` | Frontend build — `SUPABASE_URL` ile aynı |
| `VITE_SUPABASE_ANON_KEY` | Frontend build — `SUPABASE_ANON_KEY` ile aynı |

Render otomatik ekler: `PORT`, `RENDER_EXTERNAL_URL`, `RENDER_SERVICE_NAME`

`VITE_API_URL` **gerekmez** — frontend `/api/v1` kullanır (aynı domain).

---

## 3. WhatsApp QR (Baileys)

QR bağlantısı için **kalıcı disk** gerekir (`render.yaml` içinde tanımlı):

- Mount: `/opt/render/project/src/data`
- Oturumlar: `SESSIONS_DIR=/opt/render/project/src/data/sessions`
- **Starter plan** veya üzeri gerekir (ücretsiz planda disk yok)

Deploy veya restart sonrası WhatsApp oturumu diskten geri yüklenir.

---

## 4. Supabase Auth Ayarları

Supabase Dashboard → **Authentication → URL Configuration**:

- **Site URL:** `https://<servis-adınız>.onrender.com`
- **Redirect URLs:**
  - `https://<servis-adınız>.onrender.com/**`
  - `http://localhost:5173/**` (yerel geliştirme)

---

## 5. Meta WhatsApp Webhook (Cloud API)

Cloud API kullanıyorsanız:

1. Meta Developer Console → WhatsApp → Configuration
2. **Callback URL:** `https://<servis-adınız>.onrender.com/webhook/whatsapp`
3. **Verify Token:** `WHATSAPP_VERIFY_TOKEN` ile aynı
4. Subscribe: `messages`

---

## 6. Yerel Geliştirme vs Render

| | Yerel | Render |
|---|-------|--------|
| Frontend | `localhost:5173` (Vite) | Aynı domain (Express static) |
| Backend | `localhost:3001` | Aynı süreç |
| QR/Baileys | `backend/sessions/` | Kalıcı disk |
| API URL | `VITE_API_URL=http://localhost:3001/api/v1` | Boş (otomatik `/api/v1`) |

---

## 7. Komutlar

```bash
# Yerel production build testi
npm run build
PORT=3001 NODE_ENV=production node backend/dist/index.js

# Supabase kullanıcı kurulumu (yerel)
cd backend
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=xxx npx tsx src/scripts/setup-supabase.ts
```

---

## 8. Sorun Giderme

| Sorun | Çözüm |
|-------|-------|
| Health check başarısız | `/health` endpoint, `0.0.0.0:$PORT` dinleme |
| QR çalışmıyor | Starter plan + disk bağlı mı kontrol edin |
| Giriş çalışmıyor | Supabase redirect URL'leri |
| API 404 | `npm run build` frontend dist üretiyor mu |
| Soğuk başlatma | Free/Starter'da 15 dk inaktivite sonrası uyku |
| WhatsApp kopuyor | Disk mount path ve `SESSIONS_DIR` eşleşmeli |

---

## Dosya Yapısı

| Dosya | Açıklama |
|-------|----------|
| `render.yaml` | Blueprint — servis, disk, env |
| `package.json` | `build` + `start` komutları |
| `backend/src/app.ts` | API + static frontend |
| `backend/src/index.ts` | Baileys oturum restore |
