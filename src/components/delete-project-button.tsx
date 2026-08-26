'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, X } from 'lucide-react';

export default function DeleteProjectButton({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    // Server route removes storage files, then deletes the project row.
    const res = await fetch('/api/delete-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Delete failed' }));
      setError(error || 'Delete failed');
      setDeleting(false);
      return;
    }
    router.push('/dashboard/projects');
    router.refresh();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Delete project"
        aria-label="Delete project"
        className="flex items-center gap-1 rounded-full p-1.5 text-ink-4 transition-colors hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 size={16} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
          <div className="w-full max-w-sm rounded-[12px] border border-line bg-surface p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-red-600">Delete project</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded p-1 text-ink-3 transition-colors hover:bg-chip hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mb-3 text-sm text-ink-2">
              This permanently deletes <strong className="text-ink">{projectTitle}</strong>, all its
              tasks, chat history, and uploaded files. This cannot be undone.
            </p>
            <p className="mb-1.5 text-xs text-ink-3">
              Type <strong className="text-ink">{projectTitle}</strong> to confirm:
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="mb-3 w-full rounded-lg border border-line bg-ground px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-red-400 focus:ring-2 focus:ring-red-400/25"
            />
            {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
            <button
              onClick={handleDelete}
              disabled={confirmText !== projectTitle || deleting}
              className="w-full rounded-lg bg-red-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40"
            >
              {deleting ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
