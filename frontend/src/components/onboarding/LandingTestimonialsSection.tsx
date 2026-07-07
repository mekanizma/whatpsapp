/**
 * Landing referanslar — kayan şerit müşteri yorumları
 */

import { Quote, Star } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { ReferenceLogo } from '@/types';
import { cn } from '@/lib/utils';

interface Testimonial {
  quote: string;
  author: string;
  role: string;
  business: string;
  sector: string;
  metric: string;
}

function normalizeWebsite(url?: string | null): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function ReferenceLogoItem({
  name,
  icon: Icon,
  imageUrl,
  website,
  index,
}: {
  name: string;
  icon?: LucideIcon;
  imageUrl?: string;
  website?: string | null;
  index: number;
}) {
  const href = normalizeWebsite(website);
  const className = cn(
    'landing-logo-item',
    `landing-logo-item-${(index % 6) + 1}`,
    href && 'landing-logo-item--link',
  );

  const content = (
    <>
      <div className="landing-logo-item-border" aria-hidden />
      <div className="landing-logo-item-shine" aria-hidden />
      {imageUrl ? (
        <div className="landing-logo-img-wrap">
          <img src={imageUrl} alt="" className="landing-logo-img" loading="lazy" />
        </div>
      ) : (
        <div className="landing-logo-icon-wrap">
          {Icon && <Icon className="landing-logo-icon" aria-hidden />}
        </div>
      )}
      <span className="landing-logo-name">{name}</span>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        aria-label={name}
      >
        {content}
      </a>
    );
  }

  return <div className={className}>{content}</div>;
}

function TestimonialCard({ item, variant }: { item: Testimonial; variant: number }) {
  return (
    <article
      className={cn('landing-testimonial-card', `landing-testimonial-card-${variant}`)}
    >
      <div className="landing-testimonial-card-shine" aria-hidden />
      <Quote className="landing-testimonial-quote-icon" aria-hidden />
      <div className="landing-testimonial-stars" aria-label="5 stars">
        {Array.from({ length: 5 }).map((_, si) => (
          <Star key={si} className="landing-testimonial-star" fill="currentColor" />
        ))}
      </div>
      <blockquote className="landing-testimonial-quote">
        &ldquo;{item.quote}&rdquo;
      </blockquote>
      <div className="landing-testimonial-metric">{item.metric}</div>
      <footer className="landing-testimonial-author">
        <div className="landing-testimonial-avatar" aria-hidden>
          {item.author.charAt(0)}
        </div>
        <div>
          <p className="landing-testimonial-name">{item.author}</p>
          <p className="landing-testimonial-role">{item.role}</p>
          <p className="landing-testimonial-business">
            {item.business}
            <span className="landing-testimonial-sector">{item.sector}</span>
          </p>
        </div>
      </footer>
    </article>
  );
}

export function LandingTestimonialsSection() {
  const { t } = useTranslation();
  const testimonials = t('onboarding.testimonials', { returnObjects: true }) as Testimonial[];
  const looped = [...testimonials, ...testimonials];

  const { data: adminLogos } = useQuery({
    queryKey: ['public-reference-logos'],
    queryFn: () => api.get<ReferenceLogo[]>('/public/reference-logos'),
    staleTime: 5 * 60 * 1000,
  });

  type LandingLogo = { name: string; imageUrl?: string; website?: string | null; icon?: LucideIcon };

  const sourceLogos: LandingLogo[] = (adminLogos ?? []).map((l) => ({
    name: l.name,
    imageUrl: l.logo_url,
    website: l.website,
  }));
  const hasLogos = sourceLogos.length > 0;

  // Kesintisiz döngü: tek kopya ekranı dolduracak kadar logoyu çoğalt,
  // sonra bu seti iki katına çıkarıp -50% animasyonuyla boşluksuz kaydır.
  const MIN_ITEMS_PER_COPY = 8;
  const repeats = hasLogos ? Math.max(1, Math.ceil(MIN_ITEMS_PER_COPY / sourceLogos.length)) : 1;
  const singleCopy = Array.from({ length: repeats }, () => sourceLogos).flat();
  const loopedLogos = [...singleCopy, ...singleCopy];

  return (
    <div className="landing-testimonials-section">
      <div className="landing-testimonials-header">
        <div className="landing-testimonials-header-copy landing-section-header">
          <div className="landing-testimonials-eyebrow">
            <span className="landing-testimonials-eyebrow-dot" aria-hidden />
            {t('onboarding.testimonialsLabel')}
          </div>
          <h2 className="landing-testimonials-title">
            <span className="landing-testimonials-title-lead">
              {t('onboarding.testimonialsTitleLead')}
            </span>
            <span className="landing-testimonials-title-accent">
              {t('onboarding.testimonialsTitleAccent')}
            </span>
          </h2>
          <p className="landing-testimonials-subtitle">
            {t('onboarding.testimonialsSubtitle')}
          </p>
        </div>
      </div>

      <div className="landing-testimonials-marquee" aria-label={t('onboarding.testimonialsLabel')}>
        <div className="landing-testimonials-track">
          {looped.map((item, i) => (
            <TestimonialCard
              key={`${item.business}-${i}`}
              item={item}
              variant={(i % testimonials.length) % 3 + 1}
            />
          ))}
        </div>
      </div>

      {hasLogos && (
        <div className="landing-logos-section">
          <p className="landing-logos-label">{t('onboarding.referenceLogosLabel')}</p>
          <div className="landing-logos-marquee" aria-label={t('onboarding.referenceLogosLabel')}>
            <div className="landing-logos-marquee-glow" aria-hidden />
            <div className="landing-logos-track">
              {loopedLogos.map((logo, i) => (
                <ReferenceLogoItem
                  key={`${logo.name}-${i}`}
                  name={logo.name}
                  icon={logo.icon}
                  imageUrl={logo.imageUrl}
                  website={logo.website}
                  index={i % sourceLogos.length}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
