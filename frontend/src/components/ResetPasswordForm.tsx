/**
 * Admin-style password reset — new password only (no current password)
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import { Button, Input, Label } from '@/components/ui';

type ResetPasswordFormProps = {
  onSubmit: (password: string) => void;
  isPending?: boolean;
  disabled?: boolean;
  submitLabel?: string;
  className?: string;
};

export function ResetPasswordForm({
  onSubmit,
  isPending = false,
  disabled = false,
  submitLabel,
  className = '',
}: ResetPasswordFormProps) {
  const { t } = useTranslation();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError(t('settings.passwordMin'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('settings.passwordMismatch'));
      return;
    }

    onSubmit(newPassword);
  };

  const resetFields = () => {
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-3 ${className}`}>
      <div className="space-y-2">
        <Label htmlFor="reset-new-password">{t('settings.newPassword')}</Label>
        <Input
          id="reset-new-password"
          type={showPasswords ? 'text' : 'password'}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          minLength={6}
          className="h-11"
          disabled={disabled || isPending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reset-confirm-password">{t('settings.confirmPassword')}</Label>
        <Input
          id="reset-confirm-password"
          type={showPasswords ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          className="h-11"
          disabled={disabled || isPending}
        />
      </div>
      <button
        type="button"
        className="flex min-h-[44px] items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
        onClick={() => setShowPasswords((v) => !v)}
      >
        {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        {showPasswords ? t('settings.hidePasswords') : t('settings.showPasswords')}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={disabled || isPending || !newPassword}
          className="min-h-[44px]"
        >
          {isPending ? t('settings.updating') : (submitLabel || t('settings.updatePassword'))}
        </Button>
        {(newPassword || confirmPassword) && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-[44px]"
            onClick={resetFields}
            disabled={isPending}
          >
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
