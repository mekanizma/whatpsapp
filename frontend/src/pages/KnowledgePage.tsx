/**
 * Knowledge base management page
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/services/api';
import { Button, Input, Label, Textarea, Card, CardContent, CardHeader, CardTitle, Spinner, Badge } from '@/components/ui';
import type { KnowledgeItem } from '@/types';

export function KnowledgePage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<KnowledgeItem | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useQuery({
    queryKey: ['knowledge'],
    queryFn: () => api.get<KnowledgeItem[]>('/knowledge'),
  });

  const saveMutation = useMutation({
    mutationFn: (data: { title: string; content: string; category: string }) =>
      editItem
        ? api.put(`/knowledge/${editItem.id}`, data)
        : api.post('/knowledge', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/knowledge/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['knowledge'] }),
  });

  const resetForm = () => {
    setShowForm(false);
    setEditItem(null);
    setTitle('');
    setContent('');
    setCategory('');
  };

  const openEdit = (item: KnowledgeItem) => {
    setEditItem(item);
    setTitle(item.title);
    setContent(item.content);
    setCategory(item.category || '');
    setShowForm(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bilgi Bankası</h1>
          <p className="text-gray-500">AI'ın kullanacağı firma bilgileri</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="h-4 w-4" /> Yeni Bilgi
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editItem ? 'Bilgi Düzenle' : 'Yeni Bilgi Ekle'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Başlık</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fiyat Bilgileri" />
              </div>
              <div className="space-y-2">
                <Label>Kategori</Label>
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Fiyatlar" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>İçerik</Label>
              <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} placeholder="Diş temizliği: 1500 TL..." />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => saveMutation.mutate({ title, content, category })} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Spinner /> : 'Kaydet'}
              </Button>
              <Button variant="outline" onClick={resetForm}>İptal</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center p-8"><Spinner className="h-8 w-8" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items?.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold">{item.title}</h3>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(item)} className="p-1 hover:bg-gray-100 rounded">
                      <Pencil className="h-4 w-4 text-gray-500" />
                    </button>
                    <button onClick={() => deleteMutation.mutate(item.id)} className="p-1 hover:bg-red-50 rounded">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
                  </div>
                </div>
                {item.category && <Badge variant="info" className="mb-2">{item.category}</Badge>}
                <p className="text-sm text-gray-600 line-clamp-4 whitespace-pre-wrap">{item.content}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
