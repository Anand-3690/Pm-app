'use client';

import { useMemo, useState } from 'react';
import { X, Image as ImageIcon, FileText, Link2 } from 'lucide-react';
import type { Message } from '@/lib/types';

const URL_REGEX = /https?:\/\/[^\s]+/g;

export default function TaskMediaPanel({
  messages,
  onClose,
}: {
  messages: Message[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'media' | 'docs' | 'links'>('media');

  const images = useMemo(
    () => messages.filter((m) => m.attachment_type === 'image'),
    [messages]
  );
  const docs = useMemo(
    () => messages.filter((m) => m.attachment_type === 'file'),
    [messages]
  );
  const links = useMemo(() => {
    const found: { url: string; messageId: string }[] = [];
    messages.forEach((m) => {
      if (!m.content || m.attachment_url) return;
      const matches = m.content.match(URL_REGEX);
      matches?.forEach((url) => found.push({ url, messageId: m.id }));
    });
    return found;
  }, [messages]);

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-white">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="font-semibold text-slate-900">Shared in this task</h3>
        <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
          <X size={18} className="text-slate-500" />
        </button>
      </div>

      <div className="flex border-b">
        {[
          { key: 'media', label: 'Media', icon: ImageIcon, count: images.length },
          { key: 'docs', label: 'Docs', icon: FileText, count: docs.length },
          { key: 'links', label: 'Links', icon: Link2, count: links.length },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-sm font-medium ${
              tab === t.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500'
            }`}
          >
            <t.icon size={14} /> {t.label}
            {t.count > 0 && <span className="text-xs text-slate-400">({t.count})</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'media' &&
          (images.length === 0 ? (
            <EmptyState label="No photos shared yet" />
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {images.map((m) => (
                <a
                  key={m.id}
                  href={m.attachment_url!}
                  target="_blank"
                  rel="noreferrer"
                  className="block aspect-square overflow-hidden rounded-lg bg-slate-100"
                >
                  <img
                    src={m.attachment_url!}
                    alt={m.content || 'image'}
                    className="h-full w-full object-cover transition hover:scale-105"
                  />
                </a>
              ))}
            </div>
          ))}

        {tab === 'docs' &&
          (docs.length === 0 ? (
            <EmptyState label="No documents shared yet" />
          ) : (
            <div className="space-y-2">
              {docs.map((m) => (
                <a
                  key={m.id}
                  href={m.attachment_url!}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-lg border p-3 hover:bg-slate-50"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                    <FileText size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{m.content}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(m.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          ))}

        {tab === 'links' &&
          (links.length === 0 ? (
            <EmptyState label="No links shared yet" />
          ) : (
            <div className="space-y-2">
              {links.map((l, i) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-lg border p-3 hover:bg-slate-50"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-100 text-cyan-600">
                    <Link2 size={16} />
                  </div>
                  <p className="truncate text-sm text-cyan-700">{l.url}</p>
                </a>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="pt-10 text-center text-sm text-slate-400">{label}</p>;
}
