'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Users, Plus, X, Check } from 'lucide-react';
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
        className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-2 transition-colors hover:border-signal hover:text-ink"
      >
        <Users size={12} />
        <div className="flex -space-x-1.5">
          {participants.slice(0, 3).map((p) => (
            <div
              key={p.user_id}
              className={`flex h-4 w-4 items-center justify-center rounded-full border border-white text-[8px] text-white ${avatarColor(
                p.profiles.full_name || p.profiles.email || '?'
              )}`}
            >
              {(p.profiles.full_name || p.profiles.email || '?')[0].toUpperCase()}
            </div>
          ))}
        </div>
        {participants.length} in chat
      </button>

      {open && (
        <div className="absolute left-0 top-8 z-20 w-60 rounded-[10px] border border-line bg-surface p-2 shadow-md">
          <p className="rule-label mb-1.5 px-1 text-ink-3">Task participants</p>

          {loading ? (
            <p className="px-1 py-2 text-xs text-ink-4">Loading…</p>
          ) : (
            <div className="max-h-48 space-y-0.5 overflow-y-auto">
              {members.map((m) => {
                const isIn = participantIds.includes(m.user_id);
                return (
                  <button
                    key={m.user_id}
                    onClick={() => canManage && toggle(m.user_id)}
                    disabled={!canManage}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1.5 text-left text-xs transition-colors disabled:cursor-default ${
                      isIn ? 'bg-signal-tint/60' : 'hover:bg-chip'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] text-white ${avatarColor(
                          m.profiles.full_name || m.profiles.email || '?'
                        )}`}
                      >
                        {(m.profiles.full_name || m.profiles.email || '?')[0].toUpperCase()}
                      </span>
                      <span className="truncate text-ink">
                        {m.profiles.full_name || m.profiles.email}
                      </span>
                    </span>

                    {isIn ? (
                      canManage ? (
                        <X size={12} className="shrink-0 text-ink-3" />
                      ) : (
                        <Check size={12} className="shrink-0 text-signal-ink" />
                      )
                    ) : canManage ? (
                      <Plus size={12} className="shrink-0 text-ink-3" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={() => setOpen(false)}
            className="mt-1.5 w-full rounded-md bg-chip py-1.5 text-xs text-ink-2 transition-colors hover:bg-line"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
