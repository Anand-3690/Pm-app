'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Trash2, X } from 'lucide-react';

export default function DeleteProjectButton({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    if (error) {
      setError(error.message);
      setDeleting(false);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Delete project"
        className="flex items-center gap-1 rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 size={16} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-red-600">Delete Project</h2>
              <button onClick={() => setOpen(false)}>
                <X size={18} className="text-slate-400" />
              </button>
            </div>
            <p className="mb-3 text-sm text-slate-600">
              This permanently deletes <strong>{projectTitle}</strong>, all its tasks, and all chat
              history. This cannot be undone.
            </p>
            <p className="mb-1.5 text-xs text-slate-500">
              Type <strong>{projectTitle}</strong> to confirm:
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="mb-3 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400"
            />
            {error && <p className="mb-2 text-sm text-red-500">{error}</p>}
            <button
              onClick={handleDelete}
              disabled={confirmText !== projectTitle || deleting}
              className="w-full rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
            >
              {deleting ? 'Deleting...' : 'Delete permanently'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
