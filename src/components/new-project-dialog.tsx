'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Plus, X } from 'lucide-react';

const fieldClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-signal focus:ring-2 focus:ring-signal/25';

export default function NewProjectDialog({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // 1. Create the project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({ title, description, created_by: userId })
      .select()
      .single();

    if (projectError || !project) {
      setError(projectError?.message || 'Failed to create project');
      setLoading(false);
      return;
    }

    // 2. Add creator as admin member
    const { error: memberError } = await supabase.from('project_members').insert({
      project_id: project.id,
      user_id: userId,
      role: 'admin',
    });

    if (memberError) {
      setError(memberError.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    setOpen(false);
    setTitle('');
    setDescription('');
    router.push(`/dashboard/projects/${project.id}`);
    router.refresh();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-signal px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-signal-hover"
      >
        <Plus size={16} /> New project
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
          <div className="w-full max-w-md rounded-[12px] border border-line bg-surface p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-ink">New project</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded p-1 text-ink-3 transition-colors hover:bg-chip hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3">
              <input
                required
                placeholder="Nadiad Mandir"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={fieldClass}
              />
              <textarea
                placeholder="What's this project about?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={fieldClass}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button
                disabled={loading}
                className="w-full rounded-lg bg-signal px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-signal-hover disabled:opacity-50"
              >
                {loading ? 'Creating…' : 'Create project'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
