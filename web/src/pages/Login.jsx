import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { IconLegal, IconWarning } from '@/components/icons';

export default function Login() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    const res = await login(pw);
    setBusy(false);
    if (res.ok) nav('/legal');
    else setErr(res.message);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <IconLegal className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold tracking-tight">Clause</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Legal sign-in</CardTitle>
            <CardDescription>Access to the review dashboard is restricted to the Legal team.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={pw} autoFocus autoComplete="current-password"
                  onChange={(e) => setPw(e.target.value)} />
              </div>

              {err && (
                <Alert variant="destructive">
                  <IconWarning />
                  <AlertDescription>{err}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Demo sign-in. In a real deployment this is your organisation’s single sign-on.
        </p>
      </div>
    </div>
  );
}
