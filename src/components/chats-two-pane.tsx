'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ChatList, { type ChatRow } from './chat-list';
import ChatPane from './chat-pane';

// Desktop: two-pane (list left, chat right). Mobile: list only — tapping a
// chat navigates to the full-page route as before.
export default function ChatsTwoPane({
  rows,
  currentUserId,
  initialOpenTaskId,
}: {
  rows: ChatRow[];
  currentUserId: string;
  initialOpenTaskId: string | null;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(initialOpenTaskId);

  // Called when a chat row is clicked. On desktop we select (right pane);
  // on mobile we navigate to the full-page chat. We detect via matchMedia.
  const handleOpen = (taskId: string) => {
    const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
    if (isDesktop) {
      setSelectedId(taskId);
      // reflect in URL for refresh/deep-link, without a full navigation
      window.history.replaceState(null, '', `/dashboard/chats?open=${taskId}`);
    } else {
      router.push(`/dashboard/chats/${taskId}`);
    }
  };

  const clearSelection = () => {
    setSelectedId(null);
    window.history.replaceState(null, '', '/dashboard/chats');
  };

  return (
    <div className="lg:flex lg:h-[calc(100vh-3.5rem)] lg:overflow-hidden">
      {/* Left: list. Full width on mobile, fixed column on desktop. */}
      <div className="lg:w-[640px] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-line">
        <ChatList rows={rows} currentUserId={currentUserId} onOpen={handleOpen} selectedId={selectedId} />
      </div>

      {/* Right: chat pane — desktop only. Mobile uses the full-page route. */}
      <div className="hidden lg:flex lg:flex-1 lg:flex-col lg:overflow-hidden">
        <ChatPane taskId={selectedId} currentUserId={currentUserId} onCleared={clearSelection} />
      </div>
    </div>
  );
}
