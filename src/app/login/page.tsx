'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const fieldClass =
  'w-full rounded-lg border border-line bg-ground px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-signal focus:ring-2 focus:ring-signal/25';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="h-6 w-1.5 rounded-full bg-signal" aria-hidden="true" />
          <span className="font-display text-2xl font-bold tracking-wide text-ink">SEVAK</span>
        </div>

        <div className="space-y-6 rounded-[12px] border border-line bg-surface p-8">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">Welcome back</h1>
            <p className="mt-0.5 text-sm text-ink-3">Sign in to your projects</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClass}
            />
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              disabled={loading}
              className="w-full rounded-lg bg-signal px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-signal-hover disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-sm text-ink-3">
            No account?{' '}
            <Link href="/signup" className="font-medium text-signal-ink hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
