'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ChevronDown, ChevronRight, Pin, PinOff } from 'lucide-react';
import { PROJECT_STATUS_STAMP, projectStatusLabel } from '@/lib/ui-tokens';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatDate(iso: string) {
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

type Project = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  created_by: string;
  myRole: string;
  unreadCount: number;
  isPinned: boolean;
};

function ProjectCard({
  p,
  currentUserId,
  onTogglePin,
}: {
  p: Project;
  currentUserId: string;
  onTogglePin: (id: string, next: boolean) => void;
}) {
  const isOwner = p.created_by === currentUserId;
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  const togglePin = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    const next = !p.isPinned;
    if (next) {
      await supabase.from('project_pins').insert({ user_id: currentUserId, project_id: p.id });
    } else {
      await supabase
        .from('project_pins')
        .delete()
        .eq('user_id', currentUserId)
        .eq('project_id', p.id);
    }
    setBusy(false);
    onTogglePin(p.id, next);
  };

  return (
    <Link
      href={`/dashboard/projects/${p.id}`}
      className={`group relative flex flex-col rounded-[10px] border bg-surface p-4 transition-colors hover:border-signal ${
        p.status === 'completed' ? 'border-line-soft opacity-75' : 'border-line'
      }`}
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
          <span
            className={`rule-label ${isOwner ? 'text-signal-ink' : 'text-ink-4'}`}
            title={isOwner ? 'You created this project' : 'You were added to this project'}
          >
            {isOwner ? 'Owner' : 'Member'}
          </span>
          <button
            onClick={togglePin}
            disabled={busy}
            aria-label={p.isPinned ? 'Unpin' : 'Pin to top'}
            title={p.isPinned ? 'Unpin' : 'Pin to top'}
            className={`rounded p-0.5 transition-colors ${
              p.isPinned ? 'text-signal' : 'text-ink-4 hover:text-ink-2'
            }`}
          >
            {p.isPinned ? <Pin size={14} fill="currentColor" /> : <Pin size={14} />}
          </button>
        </div>
      </div>

      <h2 className="font-display text-lg font-bold leading-snug text-ink">{p.title}</h2>
      <p className="mt-1 line-clamp-2 text-sm text-ink-3">
        {p.description || 'No description'}
      </p>

      <p className="mt-4 border-t border-line-soft pt-2.5 text-xs text-ink-4">
        Created {formatDate(p.created_at)}
      </p>
    </Link>
  );
}

export default function ProjectList({
  projects: initial,
  currentUserId,
}: {
  projects: Project[];
  currentUserId: string;
}) {
  const [projects, setProjects] = useState<Project[]>(initial);
  const [showCompleted, setShowCompleted] = useState(false);

  const onTogglePin = (id: string, next: boolean) =>
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, isPinned: next } : p)));

  const sortActive = (list: Project[]) =>
    [...list].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;        // pinned first
      const aOwner = a.created_by === currentUserId ? 0 : 1;
      const bOwner = b.created_by === currentUserId ? 0 : 1;
      if (aOwner !== bOwner) return aOwner - bOwner;                    // then owner
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); // then newest
    });

  const active = sortActive(projects.filter((p) => p.status !== 'completed'));
  const completed = projects.filter((p) => p.status === 'completed');

  return (
    <div className="space-y-6">
      {active.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((p) => (
            <ProjectCard key={p.id} p={p} currentUserId={currentUserId} onTogglePin={onTogglePin} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-3">No active projects.</p>
      )}

      {completed.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted((s) => !s)}
            className="mb-3 flex items-center gap-1.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink"
          >
            {showCompleted ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            Completed
            <span className="rounded-full bg-chip px-2 py-0.5 text-xs text-ink-3">
              {completed.length}
            </span>
          </button>

          {showCompleted && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {completed.map((p) => (
                <ProjectCard key={p.id} p={p} currentUserId={currentUserId} onTogglePin={onTogglePin} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}