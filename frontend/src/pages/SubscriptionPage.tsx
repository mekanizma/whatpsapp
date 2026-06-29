/**
 * Subscription and usage page
 */

import { useQuery } from '@tanstack/react-query';
import { CreditCard, Check } from 'lucide-react';
import { api } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle, Spinner, Badge } from '@/components/ui';
import type { SubscriptionUsage } from '@/types';

interface Plan {
  id: string;
  plan_type: string;
  name: string;
  description: string;
  message_limit: number;
  user_limit: number;
  price_monthly: number;
}

export function SubscriptionPage() {
  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ['subscription-usage'],
    queryFn: () => api.get<SubscriptionUsage>('/subscriptions/usage'),
  });

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: () => api.get<Plan[]>('/subscriptions/plans'),
  });

  if (usageLoading || plansLoading) {
    return <div className="flex justify-center p-8"><Spinner className="h-8 w-8" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Abonelik</h1>
        <p className="text-gray-500">Paket ve kullanım bilgileri</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> Mevcut Kullanım
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-sm text-gray-500 mb-1">Mesaj Kullanımı</p>
              <p className="text-2xl font-bold">{usage?.messages_used} / {usage?.messages_limit}</p>
              <div className="mt-2 h-2 w-full rounded-full bg-gray-100">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${usage?.messages_percentage ?? 0}%` }} />
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Kullanıcı Sayısı</p>
              <p className="text-2xl font-bold">{usage?.users_used} / {usage?.users_limit}</p>
              <Badge variant="info" className="mt-2">{usage?.status}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans?.map((plan) => (
          <Card key={plan.id} className="relative">
            <CardContent className="p-6">
              <h3 className="text-lg font-bold">{plan.name}</h3>
              <p className="text-sm text-gray-500 mb-4">{plan.description}</p>
              <p className="text-3xl font-bold mb-4">
                ₺{plan.price_monthly}<span className="text-sm font-normal text-gray-500">/ay</span>
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  {plan.message_limit >= 999999 ? 'Sınırsız mesaj' : `${plan.message_limit.toLocaleString()} mesaj`}
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  {plan.user_limit >= 999 ? 'Sınırsız kullanıcı' : `${plan.user_limit} kullanıcı`}
                </li>
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
