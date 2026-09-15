import type { Task, MessageWithReads } from './types';

export type Member = {
  id: string;
  role: string;
  user_id: string;
  profiles: { id: string; full_name: string | null; email: string | null; avatar_url: string | null };
};

export type ChatCacheItem = {
  task: Task;
  members: Member[];
  channels: { id: string; name: string }[];
  isAdmin: boolean;
  initialMessages: MessageWithReads[];
  participantCount: number;
  timestamp: number;
};

// Global in-memory cache across chat switches and prefetching.
// Used for 0ms optimistic UI transitions.
export const chatContextCache = new Map<string, ChatCacheItem>();
export const projectContextCache = new Map<
  string,
  { members: Member[]; channels: { id: string; name: string }[] }
>();

export function invalidateChatCache(taskId?: string) {
  if (taskId) {
    chatContextCache.delete(taskId);
  } else {
    chatContextCache.clear();
  }
}

// Invalidate message cache when returning from background so stale snapshots are never served
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      invalidateChatCache();
    }
  });
  window.addEventListener('focus', () => {
    invalidateChatCache();
  });
}
