'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Megaphone, Paperclip, X, Trash2, Pencil, FileText, Send } from 'lucide-react';
import Avatar from './avatar';

const BUCKET = 'announcement-attachments';

type Announcement = {
  id: string;
  project_id: string;
  author_id: string;
  body: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  created_at: string;
  author?: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
};

function toPath(stored: string) {
  if (!stored.startsWith('http')) return stored.replace(/^\/+/, '');
  const marker = `/object/public/${BUCKET}/`;
  const i = stored.indexOf(marker);
  const raw = i === -1 ? stored : stored.slice(i + marker.length);
  return decodeURIComponent(raw.split('?')[0]);
}

/** Render URLs in announcement text as clickable links. */
function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noreferrer"
        className="text-signal-ink underline underline-offset-2"
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

export default function Announcements({
  projectId,
  currentUserId,
  canPost,
}: {
  projectId: string;
  currentUserId: string;
  canPost: boolean;
}) {
  const supabase = createClient();
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [signed, setSigned] = useState<Record<string, string | null>>({});
  const [collapsed, setCollapsed] = useState(false);

  // compose / edit state
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data } = await supabase
      .from('announcements')
      .select(
        '*, author:profiles!announcements_author_id_fkey(full_name, email, avatar_url)'
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    setItems((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`announcements-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'announcements', filter: `project_id=eq.${projectId}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // sign attachment paths
  useEffect(() => {
    const paths = items
      .map((a) => a.attachment_url)
      .filter(Boolean)
      .filter((p) => !(p! in signed)) as string[];
    if (!paths.length) return;
    supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths.map(toPath), 3600)
      .then(({ data }) => {
        if (!data) return;
        setSigned((prev) => {
          const next = { ...prev };
          data.forEach((r, i) => {
            next[paths[i]] = r.error ? null : r.signedUrl;
          });
          return next;
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const submit = async () => {
    if (!body.trim() && !file) return;
    setPosting(true);

    let attachment_url: string | null = null;
    let attachment_type: string | null = null;

    if (file) {
      const path = `${projectId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (upErr) {
        alert('Upload failed: ' + upErr.message);
        setPosting(false);
        return;
      }
      attachment_url = path;
      attachment_type = file.type.startsWith('image/') ? 'image' : 'file';
    }

    if (editingId) {
      const patch: any = { body: body.trim() || null };
      if (file) {
        patch.attachment_url = attachment_url;
        patch.attachment_type = attachment_type;
      }
      await supabase.from('announcements').update(patch).eq('id', editingId);
    } else {
      await supabase.from('announcements').insert({
        project_id: projectId,
        author_id: currentUserId,
        body: body.trim() || null,
        attachment_url,
        attachment_type,
      });
    }

    setBody('');
    setFile(null);
    setEditingId(null);
    if (fileRef.current) fileRef.current.value = '';
    setPosting(false);
    load();
  };

  const startEdit = (a: Announcement) => {
    setEditingId(a.id);
    setBody(a.body || '');
    setFile(null);
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    await supabase.from('announcements').delete().eq('id', id);
    load();
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="rounded-[12px] border border-line bg-surface">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between px-5 py-3"
      >
        <div className="flex items-center gap-2">
          <Megaphone size={17} className="text-signal-ink" />
          <h2 className="font-display text-lg font-bold text-ink">Announcements</h2>
          {items.length > 0 && (
            <span className="rounded-full bg-chip px-2 py-0.5 text-xs text-ink-3">
              {items.length}
            </span>
          )}
        </div>
        <span className="text-xs text-ink-4">{collapsed ? 'Show' : 'Hide'}</span>
      </button>

      {!collapsed && (
        <div className="border-t border-line px-5 py-4">
          {canPost && (
            <div className="mb-4 rounded-[10px] border border-line bg-ground p-3">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={2}
                placeholder={editingId ? 'Edit announcement…' : 'Post an announcement to all members…'}
                className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-4 focus:border-signal focus:ring-2 focus:ring-signal/25"
              />
              <input
                ref={fileRef}
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xlsx"
              />
              <div className="mt-2 flex items-center justify-between">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-2 transition-colors hover:bg-chip"
                >
                  <Paperclip size={14} />
                  {file ? file.name.slice(0, 24) : 'Attach'}
                </button>
                <div className="flex items-center gap-2">
                  {editingId && (
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setBody('');
                        setFile(null);
                      }}
                      className="rounded-md px-2 py-1.5 text-xs text-ink-3 hover:text-ink"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={submit}
                    disabled={posting || (!body.trim() && !file)}
                    className="flex items-center gap-1.5 rounded-lg bg-signal px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-signal-hover disabled:opacity-40"
                  >
                    <Send size={13} />
                    {posting ? 'Posting…' : editingId ? 'Save' : 'Post'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <p className="py-4 text-center text-sm text-ink-3">Loading…</p>
          ) : items.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-4">No announcements yet.</p>
          ) : (
            <div className="space-y-3">
              {items.map((a) => {
                const href = a.attachment_url ? signed[a.attachment_url] : null;
                const authorLabel = a.author?.full_name || a.author?.email || 'Admin';
                
                return (
                  <div key={a.id} className="rounded-[10px] border border-line-soft bg-ground p-3">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Avatar url={a.author?.avatar_url} name={authorLabel} size={24} />
                        <span className="text-sm font-medium text-ink">{authorLabel}</span>
                        <span className="text-xs text-ink-4">{fmt(a.created_at)}</span>
                      </div>
                      {canPost && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEdit(a)}
                            aria-label="Edit"
                            className="rounded p-1 text-ink-4 hover:bg-chip hover:text-ink"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => remove(a.id)}
                            aria-label="Delete"
                            className="rounded p-1 text-ink-4 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>

                    {a.body && (
                      <p className="whitespace-pre-wrap break-words text-sm text-ink-2">{linkify(a.body)}</p>
                    )}

                    {a.attachment_url && a.attachment_type === 'image' && href && (
                      <a href={href} target="_blank" rel="noreferrer">
                        <img src={href} alt="" className="mt-2 max-h-64 rounded-lg object-cover" />
                      </a>
                    )}
                    {a.attachment_url && a.attachment_type === 'file' && (
                      href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 flex items-center gap-2 rounded-lg border-l-[3px] border-l-signal bg-chip px-2.5 py-2 text-xs text-ink hover:bg-line"
                        >
                          <FileText size={15} className="text-signal-ink" /> Attachment
                        </a>
                      ) : (
                        <p className="mt-2 text-xs text-ink-4">Attachment unavailable</p>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
