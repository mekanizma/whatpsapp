/**
 * Landing hero başlık — temiz gradient ve alt çizgi vurgusu
 */

interface HeroTitleProps {
  lead: string;
  accent: string;
}

export function HeroTitle({ lead, accent }: HeroTitleProps) {
  return (
    <h1 className="landing-hero-title">
      <span className="landing-hero-title-lead">{lead}</span>
      <span className="landing-hero-title-accent">{accent}</span>
    </h1>
  );
}
