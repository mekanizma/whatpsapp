/**
 * Auth sayfaları — animasyonlu showcase paneli
 */

import { useEffect, useState } from 'react';
import {
  Bot, Headphones, Zap, MessageSquare, BarChart3, Shield,
  Sparkles, Clock, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type AuthVariant = 'customer' | 'admin';

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

function ChatMockup({ visible }: { visible: boolean }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!visible) return;
    if (shown >= CHAT_MESSAGES.length) {
      const t = setTimeout(() => setShown(0), 2500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShown((s) => s + 1), 1400);
    return () => clearTimeout(t);
  }, [visible, shown]);

  return (
    <div className="relative mx-auto w-full max-w-sm animate-float">
      <div className="absolute -inset-4 rounded-3xl bg-accent/20 blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-slate-900/80 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          </div>
          <div className="flex flex-1 items-center justify-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-accent" />
            <span className="text-xs font-medium text-white/90">WhatsApp AI</span>
          </div>
        </div>
        <div className="space-y-3 p-4">
          {CHAT_MESSAGES.slice(0, shown).map((msg, i) => (
            <div
              key={i}
              className={cn(
                'max-w-[85%] animate-fade-up rounded-2xl px-3.5 py-2.5 text-sm',
                msg.from === 'customer'
                  ? 'ml-auto bg-accent text-white rounded-br-md'
                  : 'mr-auto bg-white/10 text-white/95 rounded-bl-md'
              )}
            >
              {msg.text}
            </div>
          ))}
          {shown < CHAT_MESSAGES.length && shown > 0 && (
            <div className="mr-auto flex gap-1 rounded-2xl rounded-bl-md bg-white/10 px-4 py-3">
              <span className="h-2 w-2 animate-bounce rounded-full bg-white/50 [animation-delay:0ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-white/50 [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-white/50 [animation-delay:300ms]" />
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
    <div className="relative mx-auto w-full max-w-sm animate-float-slow">
      <div className="absolute -inset-4 rounded-3xl bg-amber-500/15 blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-slate-900/80 p-5 shadow-2xl backdrop-blur-xl">
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
            <div key={s.label} className="rounded-xl bg-white/5 p-2 text-center">
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

export function AuthShowcase({ variant }: AuthShowcaseProps) {
  const isAdmin = variant === 'admin';
  const marquee = isAdmin ? MARQUEE_ADMIN : MARQUEE_CUSTOMER;
  const features = isAdmin ? FEATURES_ADMIN : FEATURES_CUSTOMER;

  return (
    <div
      className={cn(
        'relative flex h-full min-h-screen flex-col justify-between overflow-hidden p-6 sm:p-8 lg:p-12',
        isAdmin ? 'auth-admin-gradient' : 'auth-gradient auth-pattern'
      )}
    >
      {/* Animated orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className={cn('auth-orb auth-orb-1', isAdmin && 'auth-orb-amber')} />
        <div className={cn('auth-orb auth-orb-2', isAdmin && 'auth-orb-amber')} />
        <div className={cn('auth-orb auth-orb-3', isAdmin && 'auth-orb-amber')} />
        <div className="auth-grid-pattern absolute inset-0 opacity-30" />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 animate-fade-up">
        <div
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-xl ring-1',
            isAdmin ? 'bg-amber-500/15 ring-amber-500/30' : 'bg-white/10 ring-white/20'
          )}
        >
          {isAdmin ? (
            <Shield className="h-6 w-6 text-amber-400" />
          ) : (
            <MessageSquare className="h-6 w-6 text-accent" />
          )}
        </div>
        <div>
          <span className="text-lg font-bold text-white">
            {isAdmin ? 'Platform Admin' : 'WhatsApp AI Temsilci'}
          </span>
          <p className="text-xs text-white/50">
            {isAdmin ? 'Merkezi yönetim konsolu' : 'Akıllı müşteri hizmetleri SaaS'}
          </p>
        </div>
      </div>

      {/* Hero text with gradient */}
      <div className="relative z-10 my-6 space-y-4 lg:my-8">
        <h2 className="animate-fade-up-delay text-2xl font-bold leading-tight text-white sm:text-3xl lg:text-4xl">
          {isAdmin ? (
            <>
              Tüm şirketleri{' '}
              <span className="bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">
                tek merkezden
              </span>
              <br />
              yönetin
            </>
          ) : (
            <>
              Müşteri hizmetlerinizi{' '}
              <span className="bg-gradient-to-r from-teal-200 to-accent bg-clip-text text-transparent">
                yapay zeka
              </span>
              <br />
              ile güçlendirin
            </>
          )}
        </h2>
        <p className="max-w-md animate-fade-up-delay-2 text-sm text-white/60">
          {isAdmin
            ? 'Şirketler, abonelikler, AI kullanımı ve aktivite logları — hepsi tek güvenli panelde.'
            : 'WhatsApp üzerinden 7/24 otomatik yanıt, canlı aktarım ve kredi optimize AI motoru.'}
        </p>
      </div>

      {/* Visual mockup — desktop only */}
      <div className="relative z-10 hidden flex-1 items-center justify-center py-6 lg:flex">
        {isAdmin ? <AdminDashboardMockup /> : <ChatMockup visible />}
      </div>

      {/* Feature cards */}
      <div className="relative z-10 hidden grid-cols-2 gap-3 lg:grid">
        {features.map((f, i) => (
          <div
            key={f.title}
            className="animate-fade-up rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm"
            style={{ animationDelay: `${300 + i * 80}ms` }}
          >
            <f.icon className={cn('mb-2 h-4 w-4', isAdmin ? 'text-amber-400' : 'text-accent')} />
            <p className="text-xs font-semibold text-white">{f.title}</p>
            <p className="text-[10px] text-white/50">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Marquee */}
      <div className="relative z-10 mt-6 space-y-2 lg:mt-8">
        <MarqueeRow items={marquee} />
        <MarqueeRow items={[...marquee].reverse()} reverse />
      </div>

      <p className="relative z-10 mt-4 text-xs text-white/30 lg:mt-6">
        © {new Date().getFullYear()} WhatsApp AI SaaS Platform
      </p>
    </div>
  );
}

/**
 * Mobil üst banner — kısa animasyonlu özet
 */
export function AuthMobileBanner({ variant }: AuthShowcaseProps) {
  const isAdmin = variant === 'admin';
  return (
    <div
      className={cn(
        'relative overflow-hidden px-6 py-8 text-white lg:hidden',
        isAdmin ? 'auth-admin-gradient' : 'auth-gradient auth-pattern'
      )}
    >
      <div className="auth-orb auth-orb-1 scale-75 opacity-60" />
      <div className="relative z-10 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
          {isAdmin ? <Shield className="h-6 w-6 text-amber-400" /> : <MessageSquare className="h-6 w-6 text-accent" />}
        </div>
        <h2 className="text-xl font-bold">
          {isAdmin ? 'Platform Admin' : 'WhatsApp AI Temsilci'}
        </h2>
        <p className="mt-1 text-sm text-white/60">
          {isAdmin ? 'Merkezi yönetim paneli' : 'Akıllı müşteri hizmetleri'}
        </p>
      </div>
    </div>
  );
}
