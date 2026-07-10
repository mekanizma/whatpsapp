import { cn } from '@/lib/utils';

interface SettingsFeedbackProps {
  type: 'ok' | 'err';
  text: string;
  className?: string;
}

export function SettingsFeedback({ type, text, className }: SettingsFeedbackProps) {
  return (
    <p
      className={cn(
        'text-sm',
        type === 'ok' ? 'text-emerald-600' : 'text-red-600',
        className
      )}
      role="status"
    >
      {text}
    </p>
  );
}
