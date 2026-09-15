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

type ChatCacheItem = {
  task: Task;
  members: Member[];
  channels: { id: string; name: string }[];
  isAdmin: boolean;
  initialMessages: MessageWithReads[];
  participantCount: number;
  timestamp: number;
};

// Module-level caches across chat switches
const chatContextCache = new Map<string, ChatCacheItem>();
const projectContextCache = new Map<string, { members: Member[]; channels: { id: string; name: string }[] }>();
let cachedSuperAdminUserId: string | null = null;
let cachedIsSuperAdmin: boolean | null = null;

export default function ChatPane({
  taskId,
  currentUserId,
  onCleared,
  projectId: providedProjectId,
  fullPageOnMobile = false,
}: {
  taskId: string | null;
  currentUserId: string;
  onCleared: () => void;
  projectId?: string;
  fullPageOnMobile?: boolean;
}) {
  const supabase = createClient();
  const [task, setTask] = useState<Task | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [initialMessages, setInitialMessages] = useState<MessageWithReads[]>([]);
  const [participantCount, setParticipantCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia('(max-width: 1023px)').matches);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!taskId) {
      setTask(null);
      return;
    }

    let cancelled = false;

    // Check if this chat was cached within the last 5 minutes
    const cached = chatContextCache.get(taskId);
    if (cached && Date.now() - cached.timestamp < 300000) {
      setTask(cached.task);
      setMembers(cached.members);
      setChannels(cached.channels);
      setIsAdmin(cached.isAdmin);
      setInitialMessages(cached.initialMessages);
      setParticipantCount(cached.participantCount);
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);

      // Concurrent Query 1: Task metadata
      const taskPromise = supabase
        .from('tasks')
        .select('*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email, avatar_url)')
        .eq('id', taskId)
        .single();

      // Concurrent Query 2: Messages
      const messagesPromise = supabase
        .from('messages')
        .select(
          '*, sender:profiles!messages_sender_id_fkey(id, full_name, email, avatar_url), reads:message_reads(user_id)'
        )
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      // Concurrent Query 3: Participant count
      const participantsPromise = supabase
        .from('task_participants')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', taskId);

      // Concurrent Query 4: Super admin status (use cache if already checked for this user)
      const profilePromise =
        cachedSuperAdminUserId === currentUserId && cachedIsSuperAdmin !== null
          ? Promise.resolve({ data: { is_super_admin: cachedIsSuperAdmin }, error: null })
          : supabase.from('profiles').select('is_super_admin').eq('id', currentUserId).single();

      // If projectId is known beforehand, query members and channels in parallel immediately
      let pId = providedProjectId;
      let membersPromise: PromiseLike<any>;
      let channelsPromise: PromiseLike<any>;

      if (pId && projectContextCache.has(pId)) {
        const pCached = projectContextCache.get(pId)!;
        membersPromise = Promise.resolve({ data: pCached.members });
        channelsPromise = Promise.resolve({ data: pCached.channels });
      } else if (pId) {
        membersPromise = supabase
          .from('project_members')
          .select('id, role, user_id, profiles(id, full_name, email, avatar_url)')
          .eq('project_id', pId);
        channelsPromise = supabase
          .from('channels')
          .select('id, name')
          .eq('project_id', pId)
          .order('position', { ascending: true });
      } else {
        // If unknown, await taskPromise first to obtain project_id
        const { data: tPre } = await taskPromise;
        if (cancelled) return;
        if (!tPre) {
          setTask(null);
          setLoading(false);
          onCleared();
          return;
        }
        pId = tPre.project_id;
        if (pId && projectContextCache.has(pId)) {
          const pCached = projectContextCache.get(pId)!;
          membersPromise = Promise.resolve({ data: pCached.members });
          channelsPromise = Promise.resolve({ data: pCached.channels });
        } else if (pId) {
          membersPromise = supabase
            .from('project_members')
            .select('id, role, user_id, profiles(id, full_name, email, avatar_url)')
            .eq('project_id', pId);
          channelsPromise = supabase
            .from('channels')
            .select('id, name')
            .eq('project_id', pId)
            .order('position', { ascending: true });
        } else {
          membersPromise = Promise.resolve({ data: [] });
          channelsPromise = Promise.resolve({ data: [] });
        }
      }

      const [
        taskResult,
        membersResult,
        channelsResult,
        profileResult,
        messagesResult,
        participantsResult,
      ] = await Promise.all([
        taskPromise,
        membersPromise,
        channelsPromise,
        profilePromise,
        messagesPromise,
        participantsPromise,
      ]);

      if (cancelled) return;

      const t = taskResult.data;
      if (!t) {
        setTask(null);
        setLoading(false);
        onCleared();
        return;
      }

      // Cache super admin status
      if (profileResult?.data) {
        cachedSuperAdminUserId = currentUserId;
        cachedIsSuperAdmin = !!profileResult.data.is_super_admin;
      }

      // Cache project members and channels
      const mem = (membersResult?.data as any) || [];
      const ch = (channelsResult?.data as any) || [];
      if (t.project_id) {
        projectContextCache.set(t.project_id, { members: mem, channels: ch });
      }

      const myMembership = mem.find((m: any) => m.user_id === currentUserId);
      const isProjectAdmin = myMembership?.role === 'admin' || !!cachedIsSuperAdmin;
      const msgs = (messagesResult?.data as any) || [];
      const pCount = participantsResult?.count ?? 0;

      const loadedTask = t as any;
      setTask(loadedTask);
      setMembers(mem);
      setChannels(ch);
      setIsAdmin(isProjectAdmin);
      setInitialMessages(msgs);
      setParticipantCount(pCount);
      setLoading(false);

      // Save to chat context cache
      chatContextCache.set(taskId, {
        task: loadedTask,
        members: mem,
        channels: ch,
        isAdmin: isProjectAdmin,
        initialMessages: msgs,
        participantCount: pCount,
        timestamp: Date.now(),
      });
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [taskId, currentUserId, providedProjectId]);

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

  const handleStatusChange = async (status: Task['status']) => {
    setTask((prev) => (prev ? { ...prev, status } : prev));
    if (taskId) {
      await supabase.from('tasks').update({ status }).eq('id', taskId);
      // Update cache
      const cached = chatContextCache.get(taskId);
      if (cached) {
        cached.task.status = status;
      }
    }
  };

  const useFullPage = fullPageOnMobile && isMobile;

  return (
    <TaskDrawer
      key={task.id}
      embedded={!useFullPage}
      fullPage={useFullPage}
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
