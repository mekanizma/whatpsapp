import { useTranslation } from 'react-i18next';

const WHATSAPP_PHONE = '905338507761';

export function LandingChatBot() {
  const { t } = useTranslation();
  const message = t('onboarding.chatBotMessage');
  const href = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="landing-chat-bot"
      aria-label={t('onboarding.chatBotAriaLabel')}
    >
      <img
        src="/chat-bot.svg"
        alt=""
        className="landing-chat-bot-img"
        width={160}
        height={160}
        loading="lazy"
        decoding="async"
      />
    </a>
  );
}
