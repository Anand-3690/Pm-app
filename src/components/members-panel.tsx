'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { UserPlus, X, Shield, User as UserIcon, Search } from 'lucide-react';
import { avatarColor } from '@/lib/avatar-color';

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
    <div className="rounded-xl border bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Members</h2>
        {isAdmin && (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <UserPlus size={14} /> Add member
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {members.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-2 rounded-full border bg-slate-50 py-1 pl-1 pr-3 text-sm"
          >
            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs text-white ${avatarColor(m.profiles.full_name || m.profiles.email || '?')}`}>
              {(m.profiles.full_name || m.profiles.email || '?')[0].toUpperCase()}
            </div>
            <span className="text-slate-700">{m.profiles.full_name || m.profiles.email}</span>
            {m.role === 'admin' ? (
              <Shield size={12} className="text-amber-500" />
            ) : (
              <UserIcon size={12} className="text-slate-400" />
            )}
            {isAdmin && m.role !== 'admin' && (
              <button onClick={() => handleRemove(m.id)}>
                <X size={12} className="text-slate-400 hover:text-red-500" />
              </button>
            )}
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Add Member</h2>
              <button onClick={() => { setOpen(false); setQuery(''); setResults([]); }}>
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                placeholder="Search by name or email"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-md border py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            {error && <p className="mb-2 text-sm text-red-500">{error}</p>}

            <div className="max-h-64 space-y-1 overflow-y-auto">
              {searching && (
                <p className="px-1 py-2 text-xs text-slate-400">Searching...</p>
              )}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="px-1 py-2 text-xs text-slate-400">
                  No matching users. Ask them to sign up first.
                </p>
              )}
              {!searching && query.trim().length < 2 && (
                <p className="px-1 py-2 text-xs text-slate-400">
                  Type at least 2 characters to search.
                </p>
              )}
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelect(p)}
                  disabled={loading}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-indigo-50 disabled:opacity-50"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColor(p.full_name || p.email || '?')}`}
                  >
                    {(p.full_name || p.email || '?')[0].toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">
                      {p.full_name || 'Unnamed user'}
                    </span>
                    <span className="block truncate text-xs text-slate-400">{p.email}</span>
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
