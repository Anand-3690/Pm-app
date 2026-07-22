import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import MembersPanel from '@/components/members-panel';
import TaskBoard from '@/components/task-board';
import DeleteProjectButton from '@/components/delete-project-button';

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();

  if (!project) notFound();

  const { data: members } = await supabase
    .from('project_members')
    .select('id, role, user_id, profiles(id, full_name, email, avatar_url)')
    .eq('project_id', id);

  const myMembership = members?.find((m: any) => m.user_id === user.id);
  const isAdmin = myMembership?.role === 'admin';

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email, avatar_url)')
    .eq('project_id', id)
    .order('created_at', { ascending: false });

  const { data: unreadRows } = await supabase.rpc('unread_counts_by_task', { project_id_param: id });
  const unreadMap = Object.fromEntries((unreadRows || []).map((r: any) => [r.task_id, r.unread_count]));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft size={14} /> Back to projects
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{project.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{project.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                project.status === 'active'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {project.status.replace('_', ' ')}
            </span>
            {isAdmin && <DeleteProjectButton projectId={id} projectTitle={project.title} />}
          </div>
        </div>
      </div>

      <MembersPanel
        projectId={id}
        members={(members as any) || []}
        isAdmin={isAdmin}
      />

      <TaskBoard
        projectId={id}
        initialTasks={(tasks as any) || []}
        members={(members as any) || []}
        currentUserId={user.id}
        unreadCounts={unreadMap}
        isAdmin={isAdmin}
      />
    </div>
  );
}
