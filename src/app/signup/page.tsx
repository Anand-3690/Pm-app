'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const fieldClass =
  'w-full rounded-lg border border-line bg-ground px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-signal focus:ring-2 focus:ring-signal/25';

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setDone(true);
    setLoading(false);
  };

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground px-4">
        <div className="w-full max-w-sm space-y-3 rounded-[12px] border border-line bg-surface p-8 text-center">
          <h1 className="font-display text-xl font-bold text-ink">Check your email</h1>
          <p className="text-sm text-ink-3">
            Confirm your account, then{' '}
            <Link href="/login" className="font-medium text-signal-ink hover:underline">
              log in
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="h-6 w-1.5 rounded-full bg-signal" aria-hidden="true" />
          <span className="font-display text-2xl font-bold tracking-wide text-ink">SEVAK</span>
        </div>

        <div className="space-y-6 rounded-[12px] border border-line bg-surface p-8">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">Create account</h1>
            <p className="mt-0.5 text-sm text-ink-3">Start managing your projects</p>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <input
              required
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={fieldClass}
            />
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
              minLength={6}
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
              {loading ? 'Creating…' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-ink-3">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-signal-ink hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
