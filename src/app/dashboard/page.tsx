import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import NewProjectDialog from '@/components/new-project-dialog';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Get all project_members rows for this user, joined to the project itself
  const { data: memberships } = await supabase
    .from('project_members')
    .select('role, projects(id, title, description, status, created_at)')
    .eq('user_id', user!.id)
    .order('joined_at', { ascending: false });

  const projects = (memberships || []).map((m: any) => ({
    ...m.projects,
    myRole: m.role,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Your Projects</h1>
          <p className="text-sm text-slate-500">Projects you own or are a member of</p>
        </div>
        <NewProjectDialog userId={user!.id} />
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-slate-500">
          No projects yet. Create your first one above.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p: any) => (
            <Link
              key={p.id}
              href={`/dashboard/projects/${p.id}`}
              className="rounded-xl border bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="mb-2 flex items-center justify-between">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    p.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : p.status === 'completed'
                      ? 'bg-blue-100 text-blue-700'
                      : p.status === 'on_hold'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {p.status.replace('_', ' ')}
                </span>
                <span className="text-xs text-slate-400">
                  {p.myRole === 'admin' ? 'Admin' : 'Member'}
                </span>
              </div>
              <h2 className="font-semibold text-slate-900">{p.title}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                {p.description || 'No description'}
              </p>
              <p className="mt-3 text-xs text-slate-400">
                Created {new Date(p.created_at).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
