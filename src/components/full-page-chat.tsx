'use client';

import { useRouter } from 'next/navigation';
import TaskDrawer from './task-drawer';
import type { Task } from '@/lib/types';

type Member = {
  id: string;
  role: string;
  user_id: string;
  profiles: { id: string; full_name: string | null; email: string | null; avatar_url: string | null };
};

// Renders the existing TaskDrawer in full-page mode, wiring its callbacks to
// navigate back to the chat list. Reuses ALL of the drawer's chat logic.
export default function FullPageChat({
  task,
  members,
  channels,
  currentUserId,
  isAdmin,
}: {
  task: Task;
  members: Member[];
  channels: { id: string; name: string }[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const backToList = () => router.push('/dashboard/chats');

  return (
    <TaskDrawer
      fullPage
      task={task}
      members={members}
      channels={channels}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
      onClose={backToList}
      onTaskMoved={backToList}
      onTaskDeleted={backToList}
      onStatusChange={backToList}
    />
  );
}
