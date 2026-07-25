import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import NewProjectDialog from '@/components/new-project-dialog';
import { PROJECT_STATUS_STAMP, projectStatusLabel } from '@/lib/ui-tokens';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Get all project_members rows for this user, joined to the project itself
  const { data: memberships } = await supabase
    .from('project_members')
    .select('role, projects(id, title, description, status, created_at)')
    .eq('user_id', user!.id)
    .order('joined_at', { ascending: false });

  const { data: unreadRows } = await supabase.rpc('unread_counts_by_project');
  const unreadMap = new Map((unreadRows || []).map((r: any) => [r.project_id, r.unread_count]));

  const projects = (memberships || []).map((m: any) => ({
    ...m.projects,
    myRole: m.role,
    unreadCount: unreadMap.get(m.projects.id) || 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Your projects</h1>
          <p className="mt-0.5 text-sm text-ink-3">Everything you own or belong to</p>
        </div>
        <NewProjectDialog userId={user!.id} />
      </div>

      {projects.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line bg-surface px-6 py-14 text-center">
          <p className="font-display text-lg font-bold text-ink">Start your first project</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-3">
            A project holds your tasks, drawings and the chat around them.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p: any) => (
            <Link
              key={p.id}
              href={`/dashboard/projects/${p.id}`}
              className="group flex flex-col rounded-[10px] border border-line bg-surface p-4 transition-colors hover:border-signal"
            >
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <span className={`stamp ${PROJECT_STATUS_STAMP[p.status] ?? 'bg-chip text-ink-2'}`}>
                  {projectStatusLabel(p.status)}
                </span>
                <div className="flex items-center gap-2">
                  {p.unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-signal px-1.5 text-[11px] font-medium text-white">
                      {p.unreadCount > 99 ? '99+' : p.unreadCount}
                    </span>
                  )}
                  <span className="rule-label text-ink-4">
                    {p.myRole === 'admin' ? 'Admin' : 'Member'}
                  </span>
                </div>
              </div>

              <h2 className="font-display text-lg font-bold leading-snug text-ink">
                {p.title}
              </h2>
              <p className="mt-1 line-clamp-2 text-sm text-ink-3">
                {p.description || 'No description'}
              </p>

              <p className="mt-4 border-t border-line-soft pt-2.5 text-xs text-ink-4">
                Created {new Date(p.created_at).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}