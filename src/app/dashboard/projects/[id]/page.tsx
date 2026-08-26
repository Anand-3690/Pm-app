import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import MembersPanel from '@/components/members-panel';
import ProjectStatusToggle from '@/components/project-status-toggle';
import DeleteProjectButton from '@/components/delete-project-button';
import { PROJECT_STATUS_STAMP, projectStatusLabel } from '@/lib/ui-tokens';
import Announcements from '@/components/announcements';
import ProjectWorkspace from '@/components/project-workspace';

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

  const { data: me } = await supabase
  .from('profiles')
  .select('is_super_admin')
  .eq('id', user.id)
  .single();
  const canPostAnnouncements = isAdmin || !!me?.is_super_admin;

  const { data: channels } = await supabase
  .from('channels')
  .select('id, project_id, name, position')
  .eq('project_id', id)
  .order('position', { ascending: true })
  .order('created_at', { ascending: true });

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
          href="/dashboard/projects"
          className="mb-3 inline-flex items-center gap-1 text-sm text-ink-3 transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} /> Back to projects
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold text-ink">{project.title}</h1>
            {project.description && (
              <p className="mt-1 text-sm text-ink-3">{project.description}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`stamp ${PROJECT_STATUS_STAMP[project.status] ?? 'bg-chip text-ink-2'}`}>
              {projectStatusLabel(project.status)}
            </span>
            {isAdmin && <ProjectStatusToggle projectId={id} status={project.status} />}
            {isAdmin && <DeleteProjectButton projectId={id} projectTitle={project.title} />}
          </div>
        </div>
      </div>

      <MembersPanel projectId={id} members={(members as any) || []} isAdmin={isAdmin} />
      
      <Announcements
        projectId={id}
        currentUserId={user.id}
        canPost={canPostAnnouncements}
      />

      <ProjectWorkspace
        projectId={id}
        channels={(channels as any) || []}
        allTasks={(tasks as any) || []}
        members={(members as any) || []}
        currentUserId={user.id}
        unreadCounts={unreadMap}
        isAdmin={isAdmin}
      />
    </div>
  );
}