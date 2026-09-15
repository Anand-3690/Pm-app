'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageCircle } from 'lucide-react';
import TaskDrawer from './task-drawer';
import type { Task, MessageWithReads } from '@/lib/types';

import {
  type Member,
  type ChatCacheItem,
  chatContextCache,
  projectContextCache,
  invalidateChatCache,
} from '@/lib/chat-cache';

export type { Member, ChatCacheItem };
export { chatContextCache, projectContextCache, invalidateChatCache };

// Prefetch a chat's context in the background so it opens in 0ms when clicked.
// Uses a short 15s freshness window so it never holds onto stale messages.
export function prefetchChat(taskId: string) {
  if (typeof window === 'undefined') return;
  const existing = chatContextCache.get(taskId);
  if (existing && Date.now() - existing.timestamp < 15000) return;

  fetch(`/api/chat-context?taskId=${taskId}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data?.task) {
        chatContextCache.set(taskId, {
          task: data.task,
          members: data.members || [],
          channels: data.channels || [],
          isAdmin: data.isAdmin,
          initialMessages: data.initialMessages || [],
          participantCount: data.participantCount || 0,
          timestamp: Date.now(),
        });
        if (data.task.project_id && !projectContextCache.has(data.task.project_id)) {
          projectContextCache.set(data.task.project_id, {
            members: data.members || [],
            channels: data.channels || [],
          });
        }
      }
    })
    .catch(() => {});
}

export default function ChatPane({
  taskId,
  currentUserId,
  onCleared,
  initialTask,
  projectId: providedProjectId,
  fullPageOnMobile = false,
}: {
  taskId: string | null;
  currentUserId: string;
  onCleared: () => void;
  initialTask?: Task | null;
  projectId?: string;
  fullPageOnMobile?: boolean;
}) {
  const supabase = createClient();
  const [task, setTask] = useState<Task | null>(() => {
    if (!taskId) return null;
    const cached = chatContextCache.get(taskId);
    return cached ? cached.task : initialTask || null;
  });
  const [members, setMembers] = useState<Member[]>(() => {
    if (!taskId) return [];
    const cached = chatContextCache.get(taskId);
    if (cached) return cached.members;
    const pId = providedProjectId || initialTask?.project_id;
    return pId && projectContextCache.has(pId) ? projectContextCache.get(pId)!.members : [];
  });
  const [channels, setChannels] = useState<{ id: string; name: string }[]>(() => {
    if (!taskId) return [];
    const cached = chatContextCache.get(taskId);
    if (cached) return cached.channels;
    const pId = providedProjectId || initialTask?.project_id;
    return pId && projectContextCache.has(pId) ? projectContextCache.get(pId)!.channels : [];
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [initialMessages, setInitialMessages] = useState<MessageWithReads[]>(() => {
    if (!taskId) return [];
    const cached = chatContextCache.get(taskId);
    return cached ? cached.initialMessages : [];
  });
  const [participantCount, setParticipantCount] = useState<number>(() => {
    if (!taskId) return 0;
    const cached = chatContextCache.get(taskId);
    return cached ? cached.participantCount : 0;
  });
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

    // Render optimistic cached UI immediately for 0ms transition
    const cached = chatContextCache.get(taskId);
    if (cached) {
      setTask(cached.task);
      setMembers(cached.members);
      setChannels(cached.channels);
      setIsAdmin(cached.isAdmin);
      setInitialMessages(cached.initialMessages);
      setParticipantCount(cached.participantCount);
      setLoading(false);
      // If cached less than 5s ago (e.g. fresh touch prefetch), skip immediate refetch
      if (Date.now() - cached.timestamp < 5000) {
        return;
      }
    }

    // If initialTask is supplied, show the task header & UI optimistically on frame 1
    if (initialTask && initialTask.id === taskId) {
      setTask(initialTask);
      const pId = providedProjectId || initialTask.project_id;
      if (pId && projectContextCache.has(pId)) {
        const pCached = projectContextCache.get(pId)!;
        setMembers(pCached.members);
        setChannels(pCached.channels);
      }
      setLoading(false);
    } else {
      setLoading(true);
    }

    // High-speed bundled server API call (internal Docker query in <15ms)
    const loadFast = async () => {
      try {
        const res = await fetch(`/api/chat-context?taskId=${taskId}`);
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          if (data?.task) {
            setTask(data.task);
            setMembers(data.members || []);
            setChannels(data.channels || []);
            setIsAdmin(data.isAdmin);
            setInitialMessages(data.initialMessages || []);
            setParticipantCount(data.participantCount || 0);
            setLoading(false);

            chatContextCache.set(taskId, {
              task: data.task,
              members: data.members || [],
              channels: data.channels || [],
              isAdmin: data.isAdmin,
              initialMessages: data.initialMessages || [],
              participantCount: data.participantCount || 0,
              timestamp: Date.now(),
            });

            if (data.task.project_id) {
              projectContextCache.set(data.task.project_id, {
                members: data.members || [],
                channels: data.channels || [],
              });
            }
            return;
          }
        }
      } catch (err) {
        console.warn('Fast chat-context fetch failed, falling back to client queries:', err);
      }

      // Fallback: direct Supabase client queries
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

      const pId = t.project_id;
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
          .eq('project_id', pId),
        supabase
          .from('channels')
          .select('id, name')
          .eq('project_id', pId)
          .order('position', { ascending: true }),
        supabase.from('profiles').select('is_super_admin').eq('id', currentUserId).single(),
        supabase
          .from('messages')
          .select('*, sender:profiles!messages_sender_id_fkey(id, full_name, email, avatar_url), reads:message_reads(user_id)')
          .eq('task_id', taskId)
          .order('created_at', { ascending: true }),
        supabase
          .from('task_participants')
          .select('*', { count: 'exact', head: true })
          .eq('task_id', taskId),
      ]);

      if (cancelled) return;

      const loadedMembers = (mem as any) || [];
      const loadedChannels = (ch as any) || [];
      const myMembership = loadedMembers.find((m: any) => m.user_id === currentUserId);
      const isProjectAdmin = myMembership?.role === 'admin' || !!me?.is_super_admin;
      const loadedMsgs = (msgs as any) || [];
      const loadedPCount = pCount ?? 0;

      setTask(t as any);
      setMembers(loadedMembers);
      setChannels(loadedChannels);
      setIsAdmin(isProjectAdmin);
      setInitialMessages(loadedMsgs);
      setParticipantCount(loadedPCount);
      setLoading(false);

      chatContextCache.set(taskId, {
        task: t as any,
        members: loadedMembers,
        channels: loadedChannels,
        isAdmin: isProjectAdmin,
        initialMessages: loadedMsgs,
        participantCount: loadedPCount,
        timestamp: Date.now(),
      });
    };

    loadFast();

    return () => {
      cancelled = true;
    };
  }, [taskId, currentUserId, initialTask, providedProjectId]);

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

  // Only show blank spinner if we truly have no task data at all (not even optimistic)
  if (loading && !task) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f4f1ea]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-signal" />
      </div>
    );
  }

  if (!task) return null;

  const clear = () => {
    setTask(null);
    onCleared();
  };

  const handleStatusChange = async (status: Task['status']) => {
    setTask((prev) => (prev ? { ...prev, status } : prev));
    if (taskId) {
      await supabase.from('tasks').update({ status }).eq('id', taskId);
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
