'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle2, RotateCcw } from 'lucide-react';

export default function ProjectStatusToggle({
  projectId,
  status,
}: {
  projectId: string;
  status: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  const isCompleted = status === 'completed';

  const toggle = async () => {
    setBusy(true);
    const next = isCompleted ? 'active' : 'completed';
    const { error } = await supabase
      .from('projects')
      .update({ status: next })
      .eq('id', projectId);
    setBusy(false);
    if (error) {
      alert('Could not update status: ' + error.message);
      return;
    }
    router.refresh();
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:border-signal hover:text-ink disabled:opacity-50"
    >
      {isCompleted ? (
        <>
          <RotateCcw size={13} /> Reopen
        </>
      ) : (
        <>
          <CheckCircle2 size={13} /> Mark completed
        </>
      )}
    </button>
  );
}
