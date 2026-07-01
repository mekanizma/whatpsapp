# AI WhatsApp Müşteri Temsilcisi SaaS

KKTC ve Türkiye pazarına yönelik çok kiracılı WhatsApp AI müşteri temsilcisi platformu.

## Özellikler

- Multi-tenant SaaS mimarisi
- WhatsApp QR (Baileys) ve Cloud API entegrasyonu
- OpenAI destekli otomatik müşteri yanıtları
- Canlı destek ve ticket sistemi
- Rol tabanlı erişim (Super Admin, Company Admin, Staff)
- Abonelik ve kullanım limiti yönetimi
- Mobil uyumlu responsive panel

## Hızlı Başlangıç

```bash
# Tüm bağımlılıkları yükle
npm run install:all

# Environment dosyalarını oluştur
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Supabase migration'ları çalıştır (docs/SETUP.md)

# Geliştirme sunucularını başlat
npm run dev
```

## Dokümantasyon

- [Sistem Mimarisi](docs/ARCHITECTURE.md)
- [Database ER Diagram](docs/DATABASE_ER.md)
- [Kurulum Rehberi](docs/SETUP.md)
- [Coolify Yayın](docs/COOLIFY.md)

## Proje Yapısı

```
whatsap/
├── frontend/     # React + Vite admin panel
├── backend/      # Express.js REST API
├── database/     # Supabase migrations
└── docs/         # Dokümantasyon
```

## Teknolojiler

**Frontend:** React, TypeScript, Vite, Tailwind CSS, Shadcn UI, React Query, Zustand

**Backend:** Node.js, Express.js, TypeScript

**Database:** Supabase PostgreSQL + Auth + Storage

**AI:** OpenAI API | **WhatsApp:** Baileys QR + Meta Cloud API
