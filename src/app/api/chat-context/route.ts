import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');
  if (!taskId) {
    return NextResponse.json({ error: 'Missing taskId' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Launch initial concurrent queries directly over internal Docker network (<15ms)
  const taskPromise = supabase
    .from('tasks')
    .select('*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email, avatar_url)')
    .eq('id', taskId)
    .single();

  const messagesPromise = supabase
    .from('messages')
    .select(
      '*, sender:profiles!messages_sender_id_fkey(id, full_name, email, avatar_url), reads:message_reads(user_id)'
    )
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  const participantsPromise = supabase
    .from('task_participants')
    .select('*', { count: 'exact', head: true })
    .eq('task_id', taskId);

  const mePromise = supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  const { data: task } = await taskPromise;
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Fetch project context in parallel with the remaining running promises
  const [
    { data: members },
    { data: channels },
    { data: me },
    { data: initialMessages },
    { count: participantCount },
  ] = await Promise.all([
    supabase
      .from('project_members')
      .select('id, role, user_id, profiles(id, full_name, email, avatar_url)')
      .eq('project_id', task.project_id),
    supabase
      .from('channels')
      .select('id, name')
      .eq('project_id', task.project_id)
      .order('position', { ascending: true }),
    mePromise,
    messagesPromise,
    participantsPromise,
  ]);

  const myMembership = (members || []).find((m: any) => m.user_id === user.id);
  const isAdmin = myMembership?.role === 'admin' || !!me?.is_super_admin;

  return NextResponse.json(
    {
      task,
      members: members || [],
      channels: channels || [],
      isAdmin,
      initialMessages: initialMessages || [],
      participantCount: participantCount ?? 0,
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
}
