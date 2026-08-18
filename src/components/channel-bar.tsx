'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, X, Pencil, Trash2, Hash, Check } from 'lucide-react';

export type Channel = {
  id: string;
  project_id: string;
  name: string;
  position: number;
};

export default function ChannelBar({
  projectId,
  channels,
  activeId,
  onSelect,
  onChannelsChange,
  isAdmin,
  currentUserId,
}: {
  projectId: string;
  channels: Channel[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onChannelsChange: (next: Channel[], selectId?: string) => void;
  isAdmin: boolean;
  currentUserId: string;
}) {
  const supabase = createClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    const nextPos = channels.length
      ? Math.max(...channels.map((c) => c.position)) + 1
      : 0;
    const { data, error } = await supabase
      .from('channels')
      .insert({
        project_id: projectId,
        name: newName.trim(),
        position: nextPos,
        created_by: currentUserId,
      })
      .select('id, project_id, name, position')
      .single();
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    // Add to the parent's list AND select it — this makes the task board
    // (and its New task button) appear immediately, no refresh needed.
    onChannelsChange([...channels, data as Channel], (data as Channel).id);
    setNewName('');
    setCreating(false);
  };

  const rename = async (id: string) => {
    if (!editName.trim()) return;
    setBusy(true);
    await supabase.from('channels').update({ name: editName.trim() }).eq('id', id);
    setBusy(false);
    onChannelsChange(
      channels.map((c) => (c.id === id ? { ...c, name: editName.trim() } : c))
    );
    setEditingId(null);
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this channel? It must be empty.')) return;
    setError(null);
    const { error } = await supabase.from('channels').delete().eq('id', id);
    if (error) {
      setError(
        error.message.includes('still has tasks')
          ? 'That channel still has tasks. Move or delete them first.'
          : error.message
      );
      return;
    }
    onChannelsChange(channels.filter((c) => c.id !== id));
  };

  // Empty project — no channels at all.
  if (channels.length === 0) {
    return (
      <div className="rounded-[12px] border border-dashed border-line bg-surface px-6 py-8 text-center">
        {isAdmin ? (
          creating ? (
            <div className="mx-auto flex max-w-xs items-center gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
                placeholder="Channel name"
                className="flex-1 rounded-lg border border-line bg-ground px-3 py-2 text-sm text-ink outline-none focus:border-signal focus:ring-2 focus:ring-signal/25"
              />
              <button
                onClick={create}
                disabled={busy || !newName.trim()}
                className="rounded-lg bg-signal px-3 py-2 text-sm font-medium text-white hover:bg-signal-hover disabled:opacity-50"
              >
                Add
              </button>
            </div>
          ) : (
            <>
              <p className="font-display text-lg font-bold text-ink">No channels yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-3">
                Channels group tasks within a project. Create one to get started.
              </p>
              <button
                onClick={() => setCreating(true)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-signal px-3.5 py-2 text-sm font-medium text-white hover:bg-signal-hover"
              >
                <Plus size={16} /> New channel
              </button>
            </>
          )
        ) : (
          <p className="text-sm text-ink-3">This project has no channels yet.</p>
        )}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {channels.map((c) => {
          const active = c.id === activeId;
          if (editingId === c.id) {
            return (
              <div
                key={c.id}
                className="flex shrink-0 items-center gap-1 rounded-full border border-signal bg-surface px-2 py-1"
              >
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && rename(c.id)}
                  className="w-24 bg-transparent text-sm text-ink outline-none"
                />
                <button onClick={() => rename(c.id)} aria-label="Save" className="text-signal-ink">
                  <Check size={13} />
                </button>
                <button onClick={() => setEditingId(null)} aria-label="Cancel" className="text-ink-4">
                  <X size={13} />
                </button>
              </div>
            );
          }
          return (
            <div
              key={c.id}
              className={`group flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                active
                  ? 'border-signal bg-signal-tint text-signal-ink'
                  : 'border-line bg-surface text-ink-2 hover:border-signal'
              }`}
            >
              <button
                onClick={() => onSelect(c.id)}
                className="flex items-center gap-1 font-medium"
              >
                <Hash size={13} className={active ? 'text-signal-ink' : 'text-ink-4'} />
                {c.name}
              </button>
              {/* Controls show on the ACTIVE tab (works on touch — no hover
                  needed) and also on hover for mouse users on inactive tabs. */}
              {isAdmin && (
                <span
                  className={`ml-0.5 items-center gap-1 ${
                    active ? 'flex' : 'hidden group-hover:flex'
                  }`}
                >
                  <button
                    onClick={() => {
                      setEditingId(c.id);
                      setEditName(c.name);
                    }}
                    aria-label="Rename"
                    className="p-0.5 text-ink-4 hover:text-ink"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => remove(c.id)}
                    aria-label="Delete"
                    className="p-0.5 text-ink-4 hover:text-destructive"
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              )}
            </div>
          );
        })}

        {isAdmin &&
          (creating ? (
            <div className="flex shrink-0 items-center gap-1 rounded-full border border-signal bg-surface px-2 py-1">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
                placeholder="Name"
                className="w-24 bg-transparent text-sm text-ink outline-none"
              />
              <button onClick={create} disabled={busy} aria-label="Add" className="text-signal-ink">
                <Check size={13} />
              </button>
              <button onClick={() => setCreating(false)} aria-label="Cancel" className="text-ink-4">
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-line px-3 py-1.5 text-sm text-ink-3 transition-colors hover:border-signal hover:text-ink"
            >
              <Plus size={13} /> Channel
            </button>
          ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
