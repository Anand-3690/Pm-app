'use client';

import { useState, useEffect, useTransition } from 'react';
import ChatList, { type ChatRow } from './chat-list';
import ChatPane from './chat-pane';

// Desktop: two-pane (list left, chat right).
// Mobile: instant in-place client transition (opens chat full-screen with 0ms delay,
// preserving the chat list scroll position and expanded accordion state).
export default function ChatsTwoPane({
  rows,
  currentUserId,
  initialOpenTaskId,
}: {
  rows: ChatRow[];
  currentUserId: string;
  initialOpenTaskId: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialOpenTaskId);
  const [, startTransition] = useTransition();

  // Listen to browser popstate (e.g. mobile back gesture or Android back button)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      startTransition(() => {
        if (e.state?.openChat) {
          setSelectedId(e.state.openChat);
        } else {
          setSelectedId(null);
        }
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Called when a chat row is clicked
  const handleOpen = (taskId: string) => {
    const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

    startTransition(() => {
      setSelectedId(taskId);
    });

    if (isDesktop) {
      // Reflect in URL for desktop deep-linking/refresh without a full navigation
      window.history.replaceState({ openChat: taskId }, '', `/dashboard/chats?open=${taskId}`);
    } else {
      // Push history state on mobile so the system back gesture / back button works naturally
      window.history.pushState({ openChat: taskId }, '', `/dashboard/chats/${taskId}`);
    }
  };

  const clearSelection = () => {
    startTransition(() => {
      setSelectedId(null);
    });

    const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
    if (isDesktop) {
      window.history.replaceState(null, '', '/dashboard/chats');
    } else {
      // If mobile pushed a history entry for the chat, pop it back
      if (typeof window !== 'undefined' && window.location.pathname.startsWith('/dashboard/chats/')) {
        window.history.back();
      } else {
        window.history.replaceState(null, '', '/dashboard/chats');
      }
    }
  };

  const selectedChatRow = rows.find((r) => r.task_id === selectedId);
  const initialOptimisticTask = selectedChatRow
    ? {
        id: selectedChatRow.task_id,
        project_id: selectedChatRow.project_id,
        channel_id: selectedChatRow.channel_id,
        title: selectedChatRow.task_title,
        description: null,
        status: 'in_progress' as const,
        priority: 'medium' as const,
        created_by: currentUserId,
        is_channel_chat: selectedChatRow.is_channel_chat,
        assignee_id: null,
        due_date: null,
        position: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    : null;

  return (
    <div className="lg:flex lg:h-[calc(100vh-3.5rem)] lg:overflow-hidden">
      {/* Left: list. Full width on mobile, fixed column on desktop. */}
      <div className="lg:w-[380px] xl:w-[420px] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-line">
        <ChatList rows={rows} currentUserId={currentUserId} onOpen={handleOpen} selectedId={selectedId} />
      </div>

      {/* Right: chat pane.
          Desktop: right column in two-pane layout.
          Mobile: full-screen overlay when selectedId != null (0ms transition, no page reloads).
      */}
      {selectedId && (
        <div className="fixed inset-0 z-50 flex flex-col bg-ground lg:static lg:z-auto lg:flex lg:flex-1 lg:overflow-hidden">
          <ChatPane
            taskId={selectedId}
            currentUserId={currentUserId}
            onCleared={clearSelection}
            initialTask={initialOptimisticTask}
            projectId={selectedChatRow?.project_id}
            fullPageOnMobile
          />
        </div>
      )}

      {!selectedId && (
        <div className="hidden lg:flex lg:flex-1 lg:flex-col lg:overflow-hidden">
          <ChatPane taskId={null} currentUserId={currentUserId} onCleared={clearSelection} />
        </div>
      )}
    </div>
  );
}
