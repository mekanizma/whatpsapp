/**
 * Staff management page
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, UserX } from 'lucide-react';
import { api } from '@/services/api';
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle, Spinner, Badge } from '@/components/ui';
import type { StaffMember } from '@/types';

export function StaffPage() {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const queryClient = useQueryClient();

  const { data: staff, isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: () => api.get<StaffMember[]>('/staff'),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; email: string }) => api.post('/staff', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      setShowForm(false);
      setName('');
      setEmail('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/staff/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Personel</h1>
          <p className="text-gray-500">Firma çalışanlarını yönetin</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Personel Ekle
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle>Yeni Personel</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Ad Soyad</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>E-posta</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => createMutation.mutate({ name, email })} disabled={createMutation.isPending}>
                {createMutation.isPending ? <Spinner /> : 'Ekle'}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>İptal</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center p-8"><Spinner className="h-8 w-8" /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {staff?.map((member) => (
            <Card key={member.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{member.name}</p>
                  <p className="text-sm text-gray-500">{member.email}</p>
                  <Badge variant="info" className="mt-1">{member.role}</Badge>
                </div>
                <button onClick={() => deleteMutation.mutate(member.id)} className="p-2 hover:bg-red-50 rounded-lg">
                  <UserX className="h-4 w-4 text-red-500" />
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
