'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const fieldClass =
  'w-full rounded-lg border border-line bg-ground px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-signal focus:ring-2 focus:ring-signal/25';

export default function ChangePasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/complete-password-change', { method: 'POST' });
      if (!res.ok) {
        const text = await res.text();
        let apiError = text;
        try {
          apiError = JSON.parse(text).error || text;
        } catch {
          // response wasn't JSON — keep the raw text so it's still visible
        }
        setError(`Password was updated, but something went wrong finishing setup: ${apiError}`);
        setLoading(false);
        return;
      }
    } catch (err: any) {
      setError(`Password was updated, but the follow-up request failed: ${err.message}`);
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push('/dashboard');
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-sm">
      <div className="rounded-[12px] border border-line bg-surface p-8">
        <h1 className="font-display text-xl font-bold text-ink">Set a new password</h1>
        <p className="mt-0.5 text-sm text-ink-3">
          You're using a temporary password. Choose your own to continue.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <input
            type="password"
            required
            minLength={6}
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={fieldClass}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            disabled={loading}
            className="w-full rounded-lg bg-signal px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-signal-hover disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Set password'}
          </button>
        </form>
      </div>
    </div>
  );
}