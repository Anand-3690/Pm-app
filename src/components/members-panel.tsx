'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { UserPlus, X, Shield, User as UserIcon, Search } from 'lucide-react';
import { avatarColor } from '@/lib/avatar-color';
import Avatar from './avatar';

type ProfileResult = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type Member = {
  id: string;
  role: 'admin' | 'member';
  user_id: string;
  profiles: { id: string; full_name: string | null; email: string | null; avatar_url: string | null };
};

export default function MembersPanel({
  projectId,
  members,
  isAdmin,
}: {
  projectId: string;
  members: Member[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const existingIds = new Set(members.map((m) => m.user_id));

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .or(`full_name.ilike.%${query.trim()}%,email.ilike.%${query.trim()}%`)
        .limit(8);

      if (error) {
        console.error('Member search error:', error);
      }
      setResults((data || []).filter((p: any) => !existingIds.has(p.id)));
      setSearching(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handleSelect = async (profile: ProfileResult) => {
    setLoading(true);
    setError(null);

    const { error: insertError } = await supabase.from('project_members').insert({
      project_id: projectId,
      user_id: profile.id,
      role: 'member',
    });

    if (insertError) {
      setError(
        insertError.code === '23505'
          ? 'That user is already on this project.'
          : insertError.message
      );
      setLoading(false);
      return;
    }

    setLoading(false);
    setQuery('');
    setResults([]);
    setOpen(false);
    router.refresh();
  };

  const handleRemove = async (memberId: string) => {
    if (!confirm('Remove this member from the project?')) return;
    await supabase.from('project_members').delete().eq('id', memberId);
    router.refresh();
  };

  return (
    <div className="rounded-[12px] border border-line bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">Members</h2>
        {isAdmin && (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:border-signal hover:text-ink"
          >
            <UserPlus size={14} /> Add member
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {members.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-2 rounded-full border border-line bg-ground py-1 pl-1 pr-3 text-sm"
          >
            <Avatar
              url={m.profiles.avatar_url}
              name={m.profiles.full_name || m.profiles.email}
              size={24}
            />
            <span className="text-ink">{m.profiles.full_name || m.profiles.email}</span>
            {m.role === 'admin' ? (
              <Shield size={12} className="text-signal-ink" />
            ) : (
              <UserIcon size={12} className="text-ink-4" />
            )}
            {isAdmin && m.role !== 'admin' && (
              <button onClick={() => handleRemove(m.id)} aria-label="Remove member">
                <X size={12} className="text-ink-4 transition-colors hover:text-destructive" />
              </button>
            )}
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
          <div className="w-full max-w-sm rounded-[12px] border border-line bg-surface p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-ink">Add member</h2>
              <button
                onClick={() => {
                  setOpen(false);
                  setQuery('');
                  setResults([]);
                }}
                aria-label="Close"
                className="rounded p-1 text-ink-3 transition-colors hover:bg-chip hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
              <input
                autoFocus
                placeholder="Search by name or email"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-lg border border-line bg-ground py-2 pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-signal focus:ring-2 focus:ring-signal/25"
              />
            </div>

            {error && <p className="mb-2 text-sm text-destructive">{error}</p>}

            <div className="max-h-64 space-y-1 overflow-y-auto">
              {searching && <p className="px-1 py-2 text-xs text-ink-4">Searching…</p>}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="px-1 py-2 text-xs text-ink-4">
                  No matching users. Ask them to sign up first.
                </p>
              )}
              {!searching && query.trim().length < 2 && (
                <p className="px-1 py-2 text-xs text-ink-4">Type at least 2 characters to search.</p>
              )}
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelect(p)}
                  disabled={loading}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-signal-tint/60 disabled:opacity-50"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white ${avatarColor(
                      p.full_name || p.email || '?'
                    )}`}
                  >
                    {(p.full_name || p.email || '?')[0].toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">
                      {p.full_name || 'Unnamed user'}
                    </span>
                    <span className="block truncate text-xs text-ink-4">{p.email}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
