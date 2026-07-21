'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { UserPlus, X, Shield, User as UserIcon } from 'lucide-react';

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
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data: profile, error: lookupError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email.trim())
      .single();

    if (lookupError || !profile) {
      setError('No user found with that email. Ask them to sign up first.');
      setLoading(false);
      return;
    }

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
    setEmail('');
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
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white">
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
              <button onClick={() => setOpen(false)}>
                <X size={18} className="text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              <input
                type="email"
                required
                placeholder="Member's email (e.g. jay@email.com)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                disabled={loading}
                className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {loading ? 'Adding...' : 'Add to project'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
