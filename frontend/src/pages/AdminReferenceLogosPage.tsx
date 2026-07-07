/**
 * Super admin — tanıtım sayfası referans logoları yönetimi
 */

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Trash2, Eye, EyeOff, Upload, Images } from 'lucide-react';
import { api } from '@/services/api';
import { getErrorMessage } from '@/lib/errors';
import { PageHeader } from '@/components/PageHeader';
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Spinner,
  Badge,
} from '@/components/ui';
import type { ReferenceLogo } from '@/types';
import { cn } from '@/lib/utils';

export function AdminReferenceLogosPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const { data: logos, isLoading } = useQuery({
    queryKey: ['admin-reference-logos'],
    queryFn: () => api.get<ReferenceLogo[]>('/admin/reference-logos'),
  });

  const resetForm = () => {
    setName('');
    setWebsite('');
    setFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.upload<ReferenceLogo>('/admin/reference-logos', file as File, {
        name: name.trim(),
        website: website.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reference-logos'] });
      queryClient.invalidateQueries({ queryKey: ['public-reference-logos'] });
      resetForm();
      setMsg({ type: 'ok', text: t('admin.referenceLogos.added') });
    },
    onError: (err) => setMsg({ type: 'err', text: getErrorMessage(err) }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.put<ReferenceLogo>(`/admin/reference-logos/${id}`, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reference-logos'] });
      queryClient.invalidateQueries({ queryKey: ['public-reference-logos'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/reference-logos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reference-logos'] });
      queryClient.invalidateQueries({ queryKey: ['public-reference-logos'] });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setPreview(selected ? URL.createObjectURL(selected) : null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!name.trim()) {
      setMsg({ type: 'err', text: t('admin.referenceLogos.nameRequired') });
      return;
    }
    if (!file) {
      setMsg({ type: 'err', text: t('admin.referenceLogos.fileRequired') });
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title={t('admin.referenceLogos.title')}
        description={t('admin.referenceLogos.description')}
      />

      <Card>
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ImagePlus className="h-5 w-5 text-amber-500" />
            {t('admin.referenceLogos.addTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('admin.referenceLogos.name')}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('admin.referenceLogos.namePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('admin.referenceLogos.website')}</Label>
              <Input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>{t('admin.referenceLogos.file')}</Label>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  className="w-full sm:w-auto"
                >
                  <Upload className="h-4 w-4" />
                  {t('admin.referenceLogos.chooseFile')}
                </Button>
                {preview ? (
                  <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <img src={preview} alt="" className="h-10 w-auto max-w-[120px] object-contain" />
                    <span className="truncate text-xs text-slate-500">{file?.name}</span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">{t('admin.referenceLogos.fileHint')}</span>
                )}
              </div>
            </div>

            {msg && (
              <p
                className={cn(
                  'sm:col-span-2 rounded-lg px-4 py-2.5 text-sm',
                  msg.type === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
                )}
              >
                {msg.text}
              </p>
            )}

            <div className="sm:col-span-2">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Spinner /> : <ImagePlus className="h-4 w-4" />}
                {t('admin.referenceLogos.add')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Images className="h-5 w-5 text-slate-500" />
            {t('admin.referenceLogos.listTitle')}
            {logos && <Badge variant="info">{logos.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner className="h-8 w-8" />
            </div>
          ) : logos && logos.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {logos.map((logo) => (
                <div
                  key={logo.id}
                  className={cn(
                    'flex flex-col gap-3 rounded-xl border p-4 transition-shadow',
                    logo.is_active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'
                  )}
                >
                  <div className="flex h-20 items-center justify-center rounded-lg bg-slate-900/95 p-3">
                    <img
                      src={logo.logo_url}
                      alt={logo.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{logo.name}</p>
                      {logo.website && (
                        <p className="truncate text-xs text-slate-400">{logo.website}</p>
                      )}
                    </div>
                    <Badge variant={logo.is_active ? 'success' : 'warning'}>
                      {logo.is_active ? t('admin.referenceLogos.active') : t('admin.referenceLogos.inactive')}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => toggleMutation.mutate({ id: logo.id, is_active: !logo.is_active })}
                      disabled={toggleMutation.isPending}
                    >
                      {logo.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      {logo.is_active ? t('admin.referenceLogos.hide') : t('admin.referenceLogos.show')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-rose-200 text-rose-600 hover:bg-rose-50"
                      onClick={() => {
                        if (window.confirm(t('admin.referenceLogos.deleteConfirm'))) {
                          deleteMutation.mutate(logo.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">
              {t('admin.referenceLogos.empty')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
