'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Copy, Check, RefreshCw, Shield } from 'lucide-react';
import { avatarColor } from '@/lib/avatar-color';

const fieldClass =
  'w-full rounded-lg border border-line bg-ground px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-signal focus:ring-2 focus:ring-signal/25';

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_super_admin: boolean;
  is_primary_admin: boolean;
  created_at: string;
};

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

export default function AdminPanel({
  currentUserId,
  isPrimaryAdmin,
  initialUsers,
}: {
  currentUserId: string;
  isPrimaryAdmin: boolean;
  initialUsers: ProfileRow[];
}) {
  const supabase = createClient();
  const [users, setUsers] = useState(initialUsers);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string; fullName: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, fullName, password }),
    });
    const result = await res.json();

    setLoading(false);
    if (!res.ok) {
      setError(result.error || 'Failed to create user');
      return;
    }

    setCreated({ email, password, fullName });
    setUsers((prev) => [
      {
        id: result.userId,
        full_name: fullName,
        email,
        is_super_admin: false,
        is_primary_admin: false,
        created_at: new Date().toISOString(),
      },
      ...prev,
    ]);
    setFullName('');
    setEmail('');
    setPassword('');
  };

  const handleCopy = () => {
    if (!created) return;
    navigator.clipboard.writeText(`Email: ${created.email}\nPassword: ${created.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSuperAdmin = async (targetId: string, next: boolean) => {
    setTogglingId(targetId);
    const { error } = await supabase.from('profiles').update({ is_super_admin: next }).eq('id', targetId);
    setTogglingId(null);
    if (!error) {
      setUsers((prev) => prev.map((u) => (u.id === targetId ? { ...u, is_super_admin: next } : u)));
    }
  };

  return (
    <div className="space-y-8">
      {/* Create user */}
      <div className="rounded-[12px] border border-line bg-surface p-6">
        <h2 className="font-display text-lg font-bold text-ink">Create account</h2>
        <p className="mt-0.5 text-sm text-ink-3">
          Set a default password and share it with the person — they'll be asked to change it on first login.
        </p>

        <form onSubmit={handleCreate} className="mt-4 space-y-3">
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
          <div className="flex gap-2">
            <input
              required
              minLength={6}
              placeholder="Default password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
            />
            <button
              type="button"
              onClick={() => setPassword(generatePassword())}
              title="Generate password"
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-2.5 text-sm text-ink-2 transition-colors hover:border-signal hover:text-ink"
            >
              <RefreshCw size={14} /> Generate
            </button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            disabled={loading}
            className="w-full rounded-lg bg-signal px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-signal-hover disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create account'}
          </button>
        </form>

        {created && (
          <div className="mt-4 rounded-lg border border-signal/40 bg-signal-tint p-4">
            <p className="rule-label text-signal-ink">Account created</p>
            <p className="mt-2 text-sm text-ink">
              <span className="text-ink-3">Name:</span> {created.fullName}
            </p>
            <p className="text-sm text-ink">
              <span className="text-ink-3">Email:</span> {created.email}
            </p>
            <p className="text-sm text-ink">
              <span className="text-ink-3">Password:</span>{' '}
              <span className="font-mono">{created.password}</span>
            </p>
            <button
              onClick={handleCopy}
              className="mt-3 flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:border-signal hover:text-ink"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy credentials'}
            </button>
          </div>
        )}
      </div>

      {/* Manage super admins */}
      <div>
        <h2 className="font-display text-lg font-bold text-ink">All users</h2>
        <p className="mt-0.5 text-sm text-ink-3">
          {isPrimaryAdmin
            ? 'Grant or revoke super admin access.'
            : 'Only the primary admin can grant or revoke super admin access.'}
        </p>
        <div className="mt-4 divide-y divide-line-soft rounded-[12px] border border-line bg-surface">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColor(u.full_name || u.email || '?')}`}
                >
                  {(u.full_name || u.email || '?')[0].toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{u.full_name || 'Unnamed user'}</p>
                  <p className="truncate text-xs text-ink-3">{u.email}</p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2.5">
                {u.is_primary_admin && (
                  <span className="stamp flex items-center gap-1 bg-signal text-white">
                    <Shield size={11} /> Primary admin
                  </span>
                )}
                {u.is_super_admin && !u.is_primary_admin && (
                  <span className="stamp flex items-center gap-1 bg-signal text-white">
                    <Shield size={11} /> Super admin
                  </span>
                )}
                {isPrimaryAdmin && u.id !== currentUserId && !u.is_primary_admin && (
                  <button
                    onClick={() => toggleSuperAdmin(u.id, !u.is_super_admin)}
                    disabled={togglingId === u.id}
                    className="rule-label text-signal-ink hover:underline disabled:opacity-50"
                  >
                    {u.is_super_admin ? 'Revoke' : 'Make super admin'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}