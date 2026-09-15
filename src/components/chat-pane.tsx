'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageCircle } from 'lucide-react';
import TaskDrawer from './task-drawer';
import type { Task, MessageWithReads } from '@/lib/types';

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
  const [initialMessages, setInitialMessages] = useState<MessageWithReads[]>([]);
  const [participantCount, setParticipantCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!taskId) {
      setTask(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);

      // Start fetching task, messages, participants, and user profile concurrently
      const taskPromise = supabase
        .from('tasks')
        .select('*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email, avatar_url)')
        .eq('id', taskId)
        .single();

      const messagesPromise = supabase
        .from('messages')
        .select(
          '*, sender:profiles!messages_sender_id_fkey(id, full_name, email, avatar_url), reads:message_reads(user_id)'
        )
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      const participantsPromise = supabase
        .from('task_participants')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', taskId);

      const profilePromise = supabase
        .from('profiles')
        .select('is_super_admin')
        .eq('id', currentUserId)
        .single();

      const { data: t } = await taskPromise;

      if (cancelled) return;
      if (!t) {
        setTask(null);
        setLoading(false);
        onCleared();
        return;
      }

      // Fetch project members and channels concurrently with remaining queries
      const [
        { data: mem },
        { data: ch },
        { data: me },
        { data: msgs },
        { count: pCount },
      ] = await Promise.all([
        supabase
          .from('project_members')
          .select('id, role, user_id, profiles(id, full_name, email, avatar_url)')
          .eq('project_id', t.project_id),
        supabase
          .from('channels')
          .select('id, name')
          .eq('project_id', t.project_id)
          .order('position', { ascending: true }),
        profilePromise,
        messagesPromise,
        participantsPromise,
      ]);

      if (cancelled) return;
      const myMembership = (mem || []).find((m: any) => m.user_id === currentUserId);
      setTask(t as any);
      setMembers((mem as any) || []);
      setChannels((ch as any) || []);
      setIsAdmin(myMembership?.role === 'admin' || !!me?.is_super_admin);
      setInitialMessages((msgs as any) || []);
      setParticipantCount(pCount ?? 0);
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
      <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-[#faf6f0] px-8 text-center">
        <div
          className="pointer-events-none absolute inset-0 z-0 bg-repeat opacity-[0.09]"
          style={{
            backgroundImage: "url('/chat-bg.webp')",
            backgroundSize: '390px auto',
            backgroundPosition: 'center top',
          }}
          aria-hidden="true"
        />
        <div className="relative z-10 mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface text-ink-4 shadow-sm">
          <MessageCircle size={28} />
        </div>
        <p className="relative z-10 font-display text-lg font-bold text-ink">Select a chat</p>
        <p className="relative z-10 mt-1 max-w-xs text-sm text-ink-3">
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

  // Update status locally and in Supabase so it persists
  const handleStatusChange = async (status: Task['status']) => {
    setTask((prev) => (prev ? { ...prev, status } : prev));
    if (taskId) {
      await supabase.from('tasks').update({ status }).eq('id', taskId);
    }
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
      initialMessages={initialMessages}
      initialParticipantCount={participantCount}
      onClose={clear}
      onStatusChange={handleStatusChange}
      onTaskMoved={() => clear()}
      onTaskDeleted={() => clear()}
    />
  );
}
