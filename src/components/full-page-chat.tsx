'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import TaskDrawer from './task-drawer';
import type { Task, MessageWithReads } from '@/lib/types';

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
  initialMessages,
  initialParticipantCount,
}: {
  task: Task;
  members: Member[];
  channels: { id: string; name: string }[];
  currentUserId: string;
  isAdmin: boolean;
  initialMessages?: MessageWithReads[];
  initialParticipantCount?: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [currentTask, setCurrentTask] = useState<Task>(task);
  const backToList = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/dashboard/chats');
    }
  };

  const handleStatusChange = async (status: Task['status']) => {
    setCurrentTask((prev) => ({ ...prev, status }));
    await supabase.from('tasks').update({ status }).eq('id', task.id);
  };

  return (
    <TaskDrawer
      fullPage
      task={currentTask}
      members={members}
      channels={channels}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
      initialMessages={initialMessages}
      initialParticipantCount={initialParticipantCount}
      onClose={backToList}
      onTaskMoved={backToList}
      onTaskDeleted={backToList}
      onStatusChange={handleStatusChange}
    />
  );
}
