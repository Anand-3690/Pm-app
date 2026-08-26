import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import FullPageChat from '@/components/full-page-chat';

// Full-page chat for one task — the WhatsApp-style conversation view.
export default async function ChatTaskPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Task + project context
  const { data: task } = await supabase
    .from('tasks')
    .select('*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email, avatar_url)')
    .eq('id', taskId)
    .single();

  if (!task) redirect('/dashboard/chats');

  // Members of the task's project (drawer needs these)
  const { data: members } = await supabase
    .from('project_members')
    .select('id, role, user_id, profiles(id, full_name, email, avatar_url)')
    .eq('project_id', task.project_id);

  // Channels of the project (for the move menu)
  const { data: channels } = await supabase
    .from('channels')
    .select('id, name')
    .eq('project_id', task.project_id)
    .order('position', { ascending: true });

  // Is the user an admin of this project?
  const myMembership = (members || []).find((m: any) => m.user_id === user.id);
  const { data: me } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin = myMembership?.role === 'admin' || !!me?.is_super_admin;

  return (
    <FullPageChat
      task={task as any}
      members={(members as any) || []}
      channels={(channels as any) || []}
      currentUserId={user.id}
      isAdmin={isAdmin}
    />
  );
}
