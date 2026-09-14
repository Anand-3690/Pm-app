'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageCircle } from 'lucide-react';
import TaskDrawer from './task-drawer';
import type { Task } from '@/lib/types';

type Member = {
  id: string;
  role: string;
  user_id: string;
  profiles: { id: string; full_name: string | null; email: string | null; avatar_url: string | null };
};

// Right pane of the desktop two-pane chats view. Fetches a chat's context
// by taskId (client-side, no navigation) and renders the chat embedded.
export default function ChatPane({
  taskId,
  currentUserId,
  onCleared,
}: {
  taskId: string | null;
  currentUserId: string;
  onCleared: () => void;
}) {
  const supabase = createClient();
  const [task, setTask] = useState<Task | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!taskId) {
      setTask(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);

      const { data: t } = await supabase
        .from('tasks')
        .select('*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email, avatar_url)')
        .eq('id', taskId)
        .single();

      if (cancelled) return;
      if (!t) {
        setTask(null);
        setLoading(false);
        onCleared();
        return;
      }

      const [{ data: mem }, { data: ch }, { data: me }] = await Promise.all([
        supabase
          .from('project_members')
          .select('id, role, user_id, profiles(id, full_name, email, avatar_url)')
          .eq('project_id', t.project_id),
        supabase
          .from('channels')
          .select('id, name')
          .eq('project_id', t.project_id)
          .order('position', { ascending: true }),
        supabase.from('profiles').select('is_super_admin').eq('id', currentUserId).single(),
      ]);

      if (cancelled) return;
      const myMembership = (mem || []).find((m: any) => m.user_id === currentUserId);
      setTask(t as any);
      setMembers((mem as any) || []);
      setChannels((ch as any) || []);
      setIsAdmin(myMembership?.role === 'admin' || !!me?.is_super_admin);
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, currentUserId]);

  if (!taskId) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[#f4f1ea] px-8 text-center">
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface text-ink-4 shadow-sm">
          <MessageCircle size={28} />
        </div>
        <p className="font-display text-lg font-bold text-ink">Select a chat</p>
        <p className="mt-1 max-w-xs text-sm text-ink-3">
          Choose a conversation from the list to start messaging.
        </p>
      </div>
    );
  }

  if (loading || !task) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f4f1ea]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-signal" />
      </div>
    );
  }

  const clear = () => {
    setTask(null);
    onCleared();
  };

  // Local status update so the header reflects a change without a parent board.
  const handleStatusChange = (status: Task['status']) => {
    setTask((prev) => (prev ? { ...prev, status } : prev));
  };

  return (
    <TaskDrawer
      key={task.id}
      embedded
      task={task}
      members={members}
      channels={channels}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
      onClose={clear}
      onStatusChange={handleStatusChange}
      onTaskMoved={() => clear()}
      onTaskDeleted={() => clear()}
    />
  );
}
