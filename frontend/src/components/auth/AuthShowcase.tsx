/**
 * Auth sayfaları — animasyonlu showcase paneli
 */

import { useEffect, useState } from 'react';
import {
  Bot, Headphones, Zap, MessageSquare, BarChart3, Shield,
  Sparkles, Clock, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type AuthVariant = 'customer' | 'admin';

interface AuthShowcaseProps {
  variant: AuthVariant;
}

const MARQUEE_CUSTOMER = [
  '7/24 AI Yanıt', 'WhatsApp QR Bağlantı', 'Canlı Aktarım', 'Bilgi Bankası',
  'Talep Yönetimi', 'Kredi Optimizasyonu', 'KKTC & Türkiye', 'Çoklu Personel',
  'Otomatik Karşılama', 'Akıllı Önbellek', 'Mesaj Kotası', 'Anlık Bildirim',
];

const MARQUEE_ADMIN = [
  'Şirket Yönetimi', 'Abonelik Kontrolü', 'AI Kullanım Raporu', 'Aktivite Logları',
  'Kota Yönetimi', 'WhatsApp Durumu', 'Paket Değişimi', 'Kullanıcı Oluşturma',
  'Platform İstatistik', 'Askıya Alma', 'Deneme Hesapları', 'Güvenli Erişim',
];

const FEATURES_CUSTOMER = [
  { icon: Bot, title: 'AI Temsilci', desc: 'Saniyeler içinde akıllı yanıt' },
  { icon: Headphones, title: 'Canlı Aktarım', desc: 'İnsan temsilciye sorunsuz geçiş' },
  { icon: Zap, title: 'Kredi Tasarrufu', desc: 'Önbellek ve ön filtre motoru' },
  { icon: Clock, title: '7/24 Aktif', desc: 'Müşterileriniz hiç beklemesin' },
];

const FEATURES_ADMIN = [
  { icon: Users, title: 'Çoklu Şirket', desc: 'Tüm müşteriler tek panelde' },
  { icon: BarChart3, title: 'Kullanım Analizi', desc: 'Token ve kota takibi' },
  { icon: Shield, title: 'Rol Güvenliği', desc: 'Super admin erişim kontrolü' },
  { icon: Sparkles, title: 'Tam Kontrol', desc: 'Abonelik ve durum yönetimi' },
];

const CHAT_MESSAGES = [
  { from: 'customer', text: 'Merhaba, randevu alabilir miyim?' },
  { from: 'ai', text: 'Tabii! Hangi gün size uygun?' },
  { from: 'customer', text: 'Yarın öğleden sonra' },
  { from: 'ai', text: '14:30 veya 16:00 müsait. Hangisini tercih edersiniz?' },
];

function MarqueeRow({ items, reverse = false, className }: { items: string[]; reverse?: boolean; className?: string }) {
  const doubled = [...items, ...items];
  return (
    <div className={cn('overflow-hidden', className)}>
      <div
        className={cn(
          'flex w-max gap-3',
          reverse ? 'animate-marquee-reverse' : 'animate-marquee'
        )}
      >
        {doubled.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ChatMockup({ compact = false }: { compact?: boolean }) {
  const [shown, setShown] = useState(1);

  useEffect(() => {
    if (shown >= CHAT_MESSAGES.length) {
      const t = setTimeout(() => setShown(1), 2500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShown((s) => s + 1), 1400);
    return () => clearTimeout(t);
  }, [shown]);

  return (
    <div
      className={cn(
        'relative z-20 mx-auto w-full',
        compact ? 'max-w-[280px]' : 'max-w-sm'
      )}
    >
      <div className="overflow-hidden rounded-2xl border border-teal-400/30 bg-slate-900 shadow-2xl shadow-black/50 ring-1 ring-white/10">
        <div className="flex items-center gap-2 border-b border-white/10 bg-teal-900/40 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </div>
          <div className="flex flex-1 items-center justify-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-[#25d366]" />
            <span className="text-xs font-semibold text-white">WhatsApp AI</span>
          </div>
        </div>
        <div
          className={cn(
            'flex flex-col justify-end space-y-2.5 bg-slate-900 p-3',
            compact ? 'min-h-[180px]' : 'min-h-[220px]'
          )}
        >
          {CHAT_MESSAGES.slice(0, shown).map((msg, i) => (
            <div
              key={`${msg.text}-${i}`}
              className={cn(
                'max-w-[88%] animate-chat-in rounded-2xl px-3 py-2 text-sm leading-snug',
                msg.from === 'customer'
                  ? 'ml-auto rounded-br-sm bg-[#25d366] text-white'
                  : 'mr-auto rounded-bl-sm bg-slate-700 text-white'
              )}
            >
              {msg.text}
            </div>
          ))}
          {shown < CHAT_MESSAGES.length && shown > 0 && (
            <div className="mr-auto flex gap-1 rounded-2xl rounded-bl-sm bg-slate-700 px-3 py-2.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:300ms]" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminDashboardMockup() {
  const bars = [40, 65, 45, 80, 55, 90, 70];
  return (
    <div className="relative z-20 mx-auto w-full max-w-sm">
      <div className="overflow-hidden rounded-2xl border border-amber-400/30 bg-slate-900 p-5 shadow-2xl shadow-black/50 ring-1 ring-white/10">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-semibold text-amber-400">Platform Özeti</span>
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-400">Canlı</span>
        </div>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {[
            { label: 'Şirket', val: '12' },
            { label: 'Mesaj', val: '4.2K' },
            { label: 'AI Token', val: '89K' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-slate-800 p-2 text-center">
              <p className="text-lg font-bold text-white">{s.val}</p>
              <p className="text-[10px] text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="flex h-24 items-end gap-1.5">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-md bg-gradient-to-t from-amber-600/40 to-amber-400/80 animate-bar-grow"
              style={{ height: `${h}%`, animationDelay: `${i * 100}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ShowcaseBackground({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className={cn(
          'absolute inset-0',
          isAdmin
            ? 'bg-gradient-to-br from-slate-950 via-stone-950 to-slate-900'
            : 'bg-gradient-to-br from-slate-950 via-teal-950 to-emerald-900'
        )}
      />
      <div className={cn('auth-orb auth-orb-1', isAdmin && 'auth-orb-amber')} />
      <div className={cn('auth-orb auth-orb-2', isAdmin && 'auth-orb-amber')} />
      <div className="auth-grid-pattern absolute inset-0 opacity-20" />
    </div>
  );
}

export function AuthShowcase({ variant }: AuthShowcaseProps) {
  const isAdmin = variant === 'admin';
  const marquee = isAdmin ? MARQUEE_ADMIN : MARQUEE_CUSTOMER;
  const features = isAdmin ? FEATURES_ADMIN : FEATURES_CUSTOMER;

  return (
    <div className="auth-page relative flex h-full min-h-0 flex-col overflow-y-auto text-white scrollbar-thin">
      <ShowcaseBackground isAdmin={isAdmin} />

      {/* Üst: başlık + hero — sabit */}
      <div className="relative z-10 shrink-0 space-y-5 p-6 sm:p-8 lg:p-10 lg:pb-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-xl ring-1',
              isAdmin ? 'bg-amber-500/15 ring-amber-500/30' : 'bg-white/10 ring-white/20'
            )}
          >
            {isAdmin ? (
              <Shield className="h-6 w-6 text-amber-400" />
            ) : (
              <MessageSquare className="h-6 w-6 text-[#25d366]" />
            )}
          </div>
          <div>
            <span className="text-lg font-bold text-white">
              {isAdmin ? 'Platform Admin' : 'WhatsApp AI Temsilci'}
            </span>
            <p className="text-xs text-slate-400">
              {isAdmin ? 'Merkezi yönetim konsolu' : 'Akıllı müşteri hizmetleri SaaS'}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-2xl font-bold leading-tight text-white sm:text-3xl">
            {isAdmin ? (
              <>
                Tüm şirketleri <span className="text-amber-300">tek merkezden</span>
                <br />
                yönetin
              </>
            ) : (
              <>
                Müşteri hizmetlerinizi <span className="text-teal-300">yapay zeka</span>
                <br />
                ile güçlendirin
              </>
            )}
          </h2>
          <p className="max-w-md text-sm text-slate-300">
            {isAdmin
              ? 'Şirketler, abonelikler, AI kullanımı ve aktivite logları — hepsi tek güvenli panelde.'
              : 'WhatsApp üzerinden 7/24 otomatik yanıt ve kredi optimize AI motoru.'}
          </p>
        </div>
      </div>

      {/* Orta: chat animasyonu — her zaman görünür alan */}
      <div className="relative z-10 flex shrink-0 items-center justify-center px-6 py-4 sm:px-8">
        {isAdmin ? <AdminDashboardMockup /> : <ChatMockup />}
      </div>

      {/* Alt: kartlar + marquee — sabit, animasyonu etkilemez */}
      <div className="relative z-10 mt-auto shrink-0 space-y-3 p-6 pt-0 sm:p-8 sm:pt-0 lg:p-10 lg:pt-0">
        <div className="grid grid-cols-2 gap-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-white/10 bg-white/5 p-2.5 backdrop-blur-sm"
            >
              <f.icon className={cn('mb-1.5 h-4 w-4', isAdmin ? 'text-amber-400' : 'text-[#25d366]')} />
              <p className="text-xs font-semibold text-white">{f.title}</p>
              <p className="text-[10px] text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <MarqueeRow items={marquee} />
          <MarqueeRow items={[...marquee].reverse()} reverse />
        </div>

        <p className="text-xs text-slate-500">
          © {new Date().getFullYear()} WhatsApp AI SaaS Platform
        </p>
      </div>
    </div>
  );
}

/**
 * Mobil üst banner + chat önizleme
 */
export function AuthMobileBanner({ variant }: AuthShowcaseProps) {
  const isAdmin = variant === 'admin';
  return (
    <div
      className={cn(
        'auth-page relative overflow-hidden text-white lg:hidden',
        isAdmin
          ? 'bg-gradient-to-br from-slate-950 via-stone-950 to-slate-900'
          : 'bg-gradient-to-br from-slate-950 via-teal-950 to-emerald-900'
      )}
    >
      <ShowcaseBackground isAdmin={isAdmin} />
      <div className="relative z-10 space-y-5 px-6 py-8">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
            {isAdmin ? (
              <Shield className="h-6 w-6 text-amber-400" />
            ) : (
              <MessageSquare className="h-6 w-6 text-[#25d366]" />
            )}
          </div>
          <h2 className="text-xl font-bold text-white">
            {isAdmin ? 'Platform Admin' : 'WhatsApp AI Temsilci'}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {isAdmin ? 'Merkezi yönetim paneli' : 'Akıllı müşteri hizmetleri'}
          </p>
        </div>

        {!isAdmin && <ChatMockup compact />}
      </div>
    </div>
  );
}
