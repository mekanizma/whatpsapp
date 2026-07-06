/**
 * Animasyonlu WhatsApp chat mockup — landing ve auth showcase
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatMessage {
  from: string;
  text: string;
}

interface ChatMockupProps {
  className?: string;
  size?: 'default' | 'landing';
}

export function ChatMockup({ className, size = 'default' }: ChatMockupProps) {
  const { t } = useTranslation();
  const chatMessages = t('showcase.chatMessages', { returnObjects: true }) as ChatMessage[];
  const [shown, setShown] = useState(1);
  const isLanding = size === 'landing';

  useEffect(() => {
    if (shown >= chatMessages.length) {
      const timer = setTimeout(() => setShown(1), 2500);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setShown((s) => s + 1), 1400);
    return () => clearTimeout(timer);
  }, [shown, chatMessages.length]);

  return (
    <div
      className={cn(
        'chat-mockup-wrap',
        isLanding && 'chat-mockup-wrap--landing',
        className
      )}
    >
      {isLanding ? (
        <>
          <div className="chat-mockup-glow" aria-hidden />
          <div className="chat-mockup-ring chat-mockup-ring-1" aria-hidden />
          <div className="chat-mockup-ring chat-mockup-ring-2" aria-hidden />
        </>
      ) : null}

      <div
        className={cn(
          'chat-mockup-card relative z-10 mx-auto w-full overflow-hidden rounded-2xl border border-teal-400/30 bg-slate-900 shadow-2xl shadow-black/50 ring-1 ring-white/10',
          isLanding ? 'max-w-[min(100%,22rem)] sm:max-w-sm' : 'max-w-sm'
        )}
      >
        <div className="flex items-center gap-2 border-b border-white/10 bg-teal-900/40 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </div>
          <div className="flex flex-1 items-center justify-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-[#25d366]" />
            <span className="text-xs font-semibold text-white">{t('showcase.whatsappAi')}</span>
          </div>
        </div>
        <div
          className={cn(
            'flex flex-col justify-end space-y-2.5 bg-slate-900 p-3',
            isLanding ? 'min-h-[240px]' : 'min-h-[220px]'
          )}
        >
          {chatMessages.slice(0, shown).map((msg, i) => (
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
          {shown < chatMessages.length && shown > 0 ? (
            <div className="mr-auto flex gap-1 rounded-2xl rounded-bl-sm bg-slate-700 px-3 py-2.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:300ms]" />
            </div>
          ) : null}
        </div>
      </div>

      <div className="chat-mockup-float-badge">
        <Bot className="h-4 w-4 text-[#25d366]" />
        <div>
          <p className="text-[10px] font-semibold text-white">{t('onboarding.aiAgentLabel')}</p>
          <p className="text-[9px] text-slate-400">{t('onboarding.online')}</p>
        </div>
      </div>
    </div>
  );
}
