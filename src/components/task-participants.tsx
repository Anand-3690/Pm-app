'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Users, Plus, X } from 'lucide-react';
import { avatarColor } from '@/lib/avatar-color';

type Member = {
  user_id: string;
  profiles: { id: string; full_name: string | null; email: string | null };
};

export default function TaskParticipants({
  taskId,
  members,
  canManage,
}: {
  taskId: string;
  members: Member[];
  canManage: boolean;
}) {
  const supabase = createClient();
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('task_participants')
        .select('user_id')
        .eq('task_id', taskId);
      setParticipantIds((data || []).map((r: any) => r.user_id));
      setLoading(false);
    };
    load();
  }, [taskId]);

  const toggle = async (userId: string) => {
    if (participantIds.includes(userId)) {
      await supabase.from('task_participants').delete().eq('task_id', taskId).eq('user_id', userId);
      setParticipantIds((prev) => prev.filter((id) => id !== userId));
    } else {
      await supabase.from('task_participants').insert({ task_id: taskId, user_id: userId });
      setParticipantIds((prev) => [...prev, userId]);
    }
  };

  const participants = members.filter((m) => participantIds.includes(m.user_id));

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
      >
        <Users size={12} />
        <div className="flex -space-x-1.5">
          {participants.slice(0, 3).map((p) => (
            <div
              key={p.user_id}
              className={`flex h-4 w-4 items-center justify-center rounded-full border border-white text-[8px] text-white ${avatarColor(p.profiles.full_name || p.profiles.email || '?')}`}
            >
              {(p.profiles.full_name || p.profiles.email || '?')[0].toUpperCase()}
            </div>
          ))}
        </div>
        {participants.length} in chat
      </button>

      {open && (
        <div className="absolute left-0 top-8 z-20 w-56 rounded-lg border bg-white p-2 shadow-lg">
          <p className="mb-1.5 px-1 text-xs font-medium text-slate-500">Task participants</p>
          {loading ? (
            <p className="px-1 text-xs text-slate-400">Loading...</p>
          ) : (
            <div className="max-h-48 space-y-0.5 overflow-y-auto">
              {members.map((m) => {
                const isIn = participantIds.includes(m.user_id);
                return (
                  <button
                    key={m.user_id}
                    onClick={() => canManage && toggle(m.user_id)}
                    disabled={!canManage}
                    className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-xs hover:bg-slate-50 disabled:cursor-default"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] text-white ${avatarColor(m.profiles.full_name || m.profiles.email || '?')}`}>
                        {(m.profiles.full_name || m.profiles.email || '?')[0].toUpperCase()}
                      </span>
                      {m.profiles.full_name || m.profiles.email}
                    </span>
                    {isIn ? (
                      canManage ? <X size={12} className="text-slate-400" /> : <span className="text-emerald-500">✓</span>
                    ) : canManage ? (
                      <Plus size={12} className="text-slate-400" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
          <button
            onClick={() => setOpen(false)}
            className="mt-1.5 w-full rounded bg-slate-100 py-1 text-xs text-slate-600 hover:bg-slate-200"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
