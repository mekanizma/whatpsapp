import { CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SettingsFeedbackProps {
  type: 'ok' | 'err';
  text: string;
  className?: string;
}

export function SettingsFeedback({ type, text, className }: SettingsFeedbackProps) {
  const Icon = type === 'ok' ? CheckCircle2 : AlertCircle;

  return (
    <div
      className={cn(
        'inline-flex items-start gap-2 rounded-xl px-3 py-2 text-sm ring-1',
        type === 'ok'
          ? 'bg-emerald-50 text-emerald-800 ring-emerald-100'
          : 'bg-red-50 text-red-700 ring-red-100',
        className
      )}
      role="status"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{text}</span>
    </div>
  );
}
