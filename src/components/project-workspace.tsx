'use client';

import { useMemo, useState } from 'react';
import ChannelBar, { type Channel } from './channel-bar';
import TaskBoard from './task-board';
import type { Task } from '@/lib/types';

type Member = {
  id: string;
  role: string;
  user_id: string;
  profiles: { id: string; full_name: string | null; email: string | null; avatar_url: string | null };
};

/**
 * Owns the channel list AND the active channel, so creating/deleting a
 * channel in ChannelBar updates the workspace immediately — the task board
 * and its "New task" button appear without a page refresh.
 */
export default function ProjectWorkspace({
  projectId,
  channels: initialChannels,
  allTasks,
  members,
  currentUserId,
  unreadCounts,
  isAdmin,
}: {
  projectId: string;
  channels: Channel[];
  allTasks: Task[];
  members: Member[];
  currentUserId: string;
  unreadCounts: Record<string, number>;
  isAdmin: boolean;
}) {
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [activeChannelId, setActiveChannelId] = useState<string>(
    initialChannels[0]?.id ?? ''
  );

  const channelTasks = useMemo(
    () => allTasks.filter((t: any) => t.channel_id === activeChannelId),
    [allTasks, activeChannelId]
  );

  const hasChannels = channels.length > 0;

  // Called by ChannelBar whenever the channel set changes.
  const handleChannelsChange = (next: Channel[], selectId?: string) => {
    setChannels(next);
    if (selectId) {
      setActiveChannelId(selectId);
    } else if (!next.find((c) => c.id === activeChannelId)) {
      // active channel was deleted — fall back to the first remaining one
      setActiveChannelId(next[0]?.id ?? '');
    }
  };

  return (
    <div className="space-y-4">
      <ChannelBar
        projectId={projectId}
        channels={channels}
        activeId={activeChannelId || null}
        onSelect={setActiveChannelId}
        onChannelsChange={handleChannelsChange}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
      />

      {hasChannels && activeChannelId ? (
        <TaskBoard
          key={activeChannelId}
          projectId={projectId}
          channelId={activeChannelId}
          channels={channels}
          initialTasks={channelTasks}
          members={members}
          currentUserId={currentUserId}
          unreadCounts={unreadCounts}
          isAdmin={isAdmin}
        />
      ) : (
        <p className="rounded-[12px] border border-line bg-surface px-6 py-8 text-center text-sm text-ink-3">
          {hasChannels
            ? 'Select a channel to see its tasks.'
            : 'Create a channel to start adding tasks.'}
        </p>
      )}
    </div>
  );
}
