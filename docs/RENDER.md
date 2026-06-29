# Render.com Yayın Rehberi

Bu proje [Render](https://render.com) üzerinde **2 servis** olarak çalışır:

| Servis | Tür | Açıklama |
|--------|-----|----------|
| `whatsapp-ai-api` | Web Service (Node) | Backend API + Baileys WhatsApp |
| `whatsapp-ai-web` | Static Site | React frontend |

---

## 1. Hızlı Kurulum (Blueprint)

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
2. GitHub repo: `https://github.com/mekanizma/whatpsapp`
3. Blueprint `render.yaml` dosyasını otomatik okur
4. Aşağıdaki ortam değişkenlerini doldurun

### Backend (`whatsapp-ai-api`)

| Değişken | Örnek |
|----------|-------|
| `SUPABASE_URL` | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `OPENAI_API_KEY` | `sk-...` |
| `CORS_ORIGIN` | `https://whatsapp-ai-web.onrender.com` |

> `WHATSAPP_VERIFY_TOKEN` otomatik üretilir.

### Frontend (`whatsapp-ai-web`)

| Değişken | Değer |
|----------|-------|
| `VITE_SUPABASE_URL` | Supabase URL (backend ile aynı) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_API_URL` | Blueprint otomatik bağlar (`RENDER_EXTERNAL_URL`) |

Deploy tamamlandıktan sonra **frontend URL'sini** `CORS_ORIGIN` olarak backend'e ekleyin ve backend'i yeniden deploy edin.

Birden fazla origin için virgülle ayırın:
```
https://whatsapp-ai-web.onrender.com,https://yourdomain.com
```

---

## 2. Supabase Ayarları

Render deploy sonrası Supabase **Authentication → URL Configuration** bölümüne ekleyin:

- **Site URL:** `https://whatsapp-ai-web.onrender.com`
- **Redirect URLs:** `https://whatsapp-ai-web.onrender.com/**`

---

## 3. WhatsApp Oturumları (Önemli)

Baileys WhatsApp oturumları sunucu dosya sisteminde saklanır.

| Plan | Davranış |
|------|----------|
| **Free** | Sunucu yeniden başlayınca oturum silinir → QR ile tekrar bağlanın |
| **Starter + Disk** | Kalıcı oturum için disk ekleyin (aşağıya bakın) |

### Kalıcı disk (önerilen — ücretli plan)

Backend servisinde **Disks** → Add Disk:

- **Mount Path:** `/var/data`
- **Size:** 1 GB

Ortam değişkeni ekleyin:
```
SESSIONS_DIR=/var/data/sessions
```

---

## 4. Manuel Kurulum (Blueprint olmadan)

### Backend Web Service

- **Root Directory:** `backend`
- **Build:** `npm install && npm run build`
- **Start:** `npm start`
- **Health Check:** `/health`

### Frontend Static Site

- **Root Directory:** `frontend`
- **Build:** `npm install && npm run build`
- **Publish:** `dist`
- **Rewrite:** `/*` → `/index.html`

---

## 5. Özel Domain (opsiyonel)

1. Frontend static site → **Custom Domains** → domain ekleyin
2. Backend → `CORS_ORIGIN` güncelleyin
3. Supabase redirect URL'lerini güncelleyin
4. Frontend `VITE_API_URL` = `https://api-alanadiniz.com` (veya Render API URL)

---

## 6. Sorun Giderme

| Sorun | Çözüm |
|-------|-------|
| CORS hatası | `CORS_ORIGIN` frontend URL ile eşleşmeli |
| API bağlanamıyor | `VITE_API_URL` build sırasında set edilmeli; frontend'i yeniden deploy edin |
| Giriş çalışmıyor | Supabase redirect URL'lerini kontrol edin |
| WhatsApp kopuyor | Free planda normal; disk ekleyin veya yeniden QR tarayın |
| Cold start (free) | İlk istek 30-60 sn sürebilir |

---

## 7. Yerel → Production checklist

- [ ] `backend/.env` → Render backend env
- [ ] `frontend/.env` → Render static site env
- [ ] Supabase migration'lar uygulandı
- [ ] `CORS_ORIGIN` frontend URL
- [ ] Supabase auth redirect URL'leri
- [ ] Admin kullanıcı oluşturuldu (`setup-supabase.ts`)
