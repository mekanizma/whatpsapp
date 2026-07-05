/**
 * Mesaj resmi — önizleme, tam ekran açma ve indirme
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, X, ZoomIn } from 'lucide-react';
import { api } from '@/services/api';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

interface MessageImageProps {
  messageId: string;
  mediaUrl: string;
  filename?: string | null;
  caption?: string;
  isStaffBubble?: boolean;
  className?: string;
}

export function MessageImage({
  messageId,
  mediaUrl,
  filename,
  caption,
  isStaffBubble,
  className,
}: MessageImageProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await api.downloadBlob(
        `/messages/media/${messageId}?download=1`,
        filename || `image-${messageId}.jpg`
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'group relative block w-full max-w-[240px] overflow-hidden rounded-xl text-left sm:max-w-[280px]',
          className
        )}
        aria-label={t('messages.openImage')}
      >
        <img
          src={mediaUrl}
          alt={caption || t('messages.image')}
          className="max-h-56 w-full object-cover transition-transform group-hover:scale-[1.02]"
          loading="lazy"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
          <ZoomIn className="h-6 w-6 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100" />
        </span>
      </button>

      {caption && (
        <p
          className={cn(
            'mt-1.5 text-sm leading-relaxed whitespace-pre-wrap',
            isStaffBubble ? 'text-white/95' : 'text-slate-800'
          )}
        >
          {caption}
        </p>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-black/90 p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('messages.imagePreview')}
          onClick={() => setOpen(false)}
        >
          <div
            className="flex shrink-0 items-center justify-between gap-2 pb-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="truncate text-sm font-medium text-white/90">
              {filename || t('messages.image')}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-white/30 bg-white/10 text-white hover:bg-white/20"
                disabled={downloading}
                onClick={handleDownload}
              >
                <Download className="h-4 w-4" />
                <span className="hidden xs:inline sm:inline">{t('messages.downloadImage')}</span>
              </Button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white/90 hover:bg-white/10"
                aria-label={t('common.close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div
            className="flex min-h-0 flex-1 items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={mediaUrl}
              alt={caption || t('messages.image')}
              className="max-h-[calc(100dvh-5.5rem)] max-w-full object-contain"
            />
          </div>

          {caption && (
            <p
              className="shrink-0 pt-3 text-center text-sm text-white/80"
              onClick={(e) => e.stopPropagation()}
            >
              {caption}
            </p>
          )}
        </div>
      )}
    </>
  );
}
