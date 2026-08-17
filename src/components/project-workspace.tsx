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
 * Client wrapper that owns the active-channel state and renders the channel
 * tab strip above the task board. Tasks are fetched once on the server (all
 * tasks for the project) and filtered here by the selected channel, so
 * switching channels is instant with no server round-trip.
 */
export default function ProjectWorkspace({
  projectId,
  channels,
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
  const [activeChannelId, setActiveChannelId] = useState<string>(
    channels[0]?.id ?? ''
  );

  const channelTasks = useMemo(
    () => allTasks.filter((t: any) => t.channel_id === activeChannelId),
    [allTasks, activeChannelId]
  );

  const hasChannels = channels.length > 0;

  return (
    <div className="space-y-4">
      <ChannelBar
        projectId={projectId}
        channels={channels}
        activeId={activeChannelId || null}
        onSelect={setActiveChannelId}
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
