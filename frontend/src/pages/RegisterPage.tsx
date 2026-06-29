/**
 * Register page
 */

import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle, Spinner } from '@/components/ui';

export function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(email, password, fullName);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kayıt başarısız');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-dark to-sidebar p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <MessageSquare className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Hesap Oluştur</CardTitle>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="rounded-lg bg-green-50 p-4 text-center text-sm text-green-700">
              Kayıt başarılı! E-postanızı doğrulayın ve giriş yapın.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
              <div className="space-y-2">
                <Label>Ad Soyad</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>E-posta</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Şifre</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Spinner /> : 'Kayıt Ol'}
              </Button>
            </form>
          )}
          <p className="mt-4 text-center text-sm text-gray-500">
            Zaten hesabınız var mı?{' '}
            <Link to="/login" className="text-primary font-medium hover:underline">Giriş Yap</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
