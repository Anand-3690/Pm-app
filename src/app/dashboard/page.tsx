import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import NewProjectDialog from '@/components/new-project-dialog';
import ProjectList from '@/components/project-list';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Get all project_members rows for this user, joined to the project itself
  const { data: memberships } = await supabase
    .from('project_members')
    .select('role, projects(id, title, description, status, created_at, created_by)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false });

  const { data: pins } = await supabase
    .from('project_pins')
    .select('project_id')
    .eq('user_id', user.id);
  const pinnedIds = new Set((pins || []).map((p: any) => p.project_id));
  
  const { data: unreadRows } = await supabase.rpc('unread_counts_by_project');
  const unreadMap = new Map((unreadRows || []).map((r: any) => [r.project_id, r.unread_count]));

  const projects = (memberships || []).map((m: any) => ({
    ...m.projects,
    myRole: m.role,
    unreadCount: unreadMap.get(m.projects.id) || 0,
    isPinned: pinnedIds.has(m.projects.id),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Your projects</h1>
          <p className="mt-0.5 text-sm text-ink-3">Everything you own or belong to</p>
        </div>
        <NewProjectDialog userId={user.id} />
      </div>

    {projects.length === 0 ? (
      <div className="rounded-[10px] border border-dashed border-line bg-surface px-6 py-14 text-center">
        <p className="font-display text-lg font-bold text-ink">Start your first project</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-ink-3">
          A project holds your tasks, drawings and the chat around them.
        </p>
      </div>
    ) : (
      <ProjectList projects={projects} currentUserId={user.id} />
    )} 
    </div>
  );
}