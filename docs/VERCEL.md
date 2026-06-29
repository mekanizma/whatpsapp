# Vercel Yayın Rehberi (Tek Platform)

Frontend + Backend + WhatsApp **yalnızca Vercel** üzerinde çalışır.

```
https://your-app.vercel.app/              → React panel
https://your-app.vercel.app/api/v1/*      → Express API
https://your-app.vercel.app/webhook/whatsapp → Meta webhook
```

---

## 1. Deploy

1. [vercel.com](https://vercel.com) → **Add New Project**
2. GitHub: `mekanizma/whatpsapp`
3. **Framework:** Other (vercel.json otomatik okunur)
4. **Root Directory:** boş
5. Environment variables ekleyin (Bölüm 2)
6. **Deploy**

---

## 2. Environment Variables

Proje kökündeki `.env.vercel` dosyası tüm değerlerle hazır. Yükleme:

```powershell
# Vercel CLI ile (önerilen)
npm i -g vercel
vercel login
vercel link
.\scripts\push-vercel-env.ps1
```

Veya Vercel Dashboard → **Settings → Environment Variables** → `.env.vercel` içeriğini kopyalayın.

| Değişken | Açıklama |
|----------|----------|
| `SUPABASE_URL` | Supabase proje URL |
| `SUPABASE_ANON_KEY` | Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_MODEL` | `gpt-4o-mini` |
| `WHATSAPP_VERIFY_TOKEN` | Meta webhook doğrulama |
| `WHATSAPP_API_VERSION` | `v21.0` |
| `NODE_ENV` | `production` |
| `DEMO_MODE` | `false` |
| `VITE_SUPABASE_URL` | Frontend build |
| `VITE_SUPABASE_ANON_KEY` | Frontend build |
| `VITE_DEMO_MODE` | `false` |

`VITE_API_URL` **gerekmez** — otomatik `/api/v1`

---

## 3. Supabase Auth

**Authentication → URL Configuration:**

- Site URL: `https://your-app.vercel.app`
- Redirect URLs: `https://your-app.vercel.app/**`
- Preview: `https://*.vercel.app/**`

---

## 4. WhatsApp (Meta Cloud API)

Vercel serverless ortamında **QR (Baileys) çalışmaz**. Production'da **Meta Cloud API** kullanılır.

### Panelden bağlanma

1. Panel → **WhatsApp** sayfası
2. Phone Number ID + Access Token girin
3. **Cloud API ile Bağlan**

### Meta Developer webhook

1. [developers.facebook.com](https://developers.facebook.com) → Uygulamanız
2. WhatsApp → Configuration → Webhook
3. **Callback URL:** `https://your-app.vercel.app/webhook/whatsapp`
4. **Verify Token:** Vercel'deki `WHATSAPP_VERIFY_TOKEN` değeri
5. **messages** alanına abone olun

### Yerel geliştirme

`npm run dev` ile QR (Baileys) kullanılabilir.

---

## 5. Dosya Yapısı

| Dosya | Görev |
|-------|-------|
| `vercel.json` | Build, routing, serverless API |
| `api/index.ts` | Express serverless handler |
| `frontend/dist` | Statik panel |
| `.env.vercel` | Hazır env değerleri (git dışı) |

---

## 6. Sorun Giderme

| Sorun | Çözüm |
|-------|-------|
| API 404 | Redeploy, `vercel.json` rewrites kontrol |
| Giriş çalışmıyor | Supabase redirect URL |
| CORS | Aynı domain — ek ayar gerekmez |
| QR çalışmıyor (Vercel) | Normal — Cloud API kullanın |
| Webhook doğrulanmıyor | `WHATSAPP_VERIFY_TOKEN` Meta ile aynı mı? |
| Build hatası | `npm run vercel-build` yerelde test edin |

---

## 7. Komutlar

```bash
npm run install:all
npm run vercel-build    # Yerel build testi
vercel --prod           # Production deploy
vercel env ls           # Env listesi
```
