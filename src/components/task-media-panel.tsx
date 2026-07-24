'use client';

import { useMemo, useState } from 'react';
import { X, Image as ImageIcon, FileText, Link2 } from 'lucide-react';
import type { Message } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { useSignedUrls } from '@/lib/use-signed-urls';

const URL_REGEX = /https?:\/\/[^\s]+/g;

export default function TaskMediaPanel({
  messages,
  onClose,
}: {
  messages: Message[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'media' | 'docs' | 'links'>('media');
  const supabase = createClient();
  const signedUrls = useSignedUrls(supabase, messages);

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
    <div className="absolute inset-0 z-10 flex flex-col bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="font-display text-lg font-bold text-ink">Shared in this task</h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-ink-3 transition-colors hover:bg-chip hover:text-ink"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex border-b border-line">
        {[
          { key: 'media', label: 'Media', icon: ImageIcon, count: images.length },
          { key: 'docs', label: 'Docs', icon: FileText, count: docs.length },
          { key: 'links', label: 'Links', icon: Link2, count: links.length },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'border-signal text-signal-ink'
                : 'border-transparent text-ink-3 hover:text-ink-2'
            }`}
          >
            <t.icon size={14} /> {t.label}
            {t.count > 0 && <span className="text-xs text-ink-4">({t.count})</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'media' &&
          (images.length === 0 ? (
            <EmptyState label="No photos shared yet" />
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {images.map((m) => {
                const key = m.attachment_url!;
                const href = signedUrls[key];
                const pending = !(key in signedUrls);

                if (pending) {
                  return (
                    <div
                      key={m.id}
                      className="aspect-square animate-pulse rounded-[10px] bg-chip"
                    />
                  );
                }

                if (!href) {
                  return (
                    <div
                      key={m.id}
                      className="flex aspect-square items-center justify-center rounded-[10px] bg-chip p-2 text-center text-[10px] text-ink-4"
                    >
                      Unavailable
                    </div>
                  );
                }

                return (
                  <a
                    key={m.id}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="block aspect-square overflow-hidden rounded-[10px] bg-chip"
                  >
                    <img
                      src={href}
                      alt={m.content || 'image'}
                      className="h-full w-full object-cover transition hover:scale-105"
                    />
                  </a>
                );
              })}
            </div>
          ))}

        {tab === 'docs' &&
          (docs.length === 0 ? (
            <EmptyState label="No documents shared yet" />
          ) : (
            <div className="space-y-2">
              {docs.map((m) => {
                const key = m.attachment_url!;
                const href = signedUrls[key];
                const pending = !(key in signedUrls);

                const inner = (
                  <>
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        href ? 'bg-signal-tint text-signal-ink' : 'bg-chip text-ink-4'
                      }`}
                    >
                      <FileText size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{m.content}</p>
                      <p className="text-xs text-ink-4">
                        {pending
                          ? 'Loading…'
                          : href
                          ? new Date(m.created_at).toLocaleDateString()
                          : 'File no longer available'}
                      </p>
                    </div>
                  </>
                );

                if (!href) {
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 rounded-[10px] border border-line-soft p-3 opacity-70"
                    >
                      {inner}
                    </div>
                  );
                }

                return (
                  <a
                    key={m.id}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-[10px] border border-line p-3 transition-colors hover:border-signal"
                  >
                    {inner}
                  </a>
                );
              })}
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
                  className="flex items-center gap-3 rounded-[10px] border border-line p-3 transition-colors hover:border-signal"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-chip text-ink-2">
                    <Link2 size={16} />
                  </div>
                  <p className="truncate text-sm text-ink-2">{l.url}</p>
                </a>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="pt-10 text-center text-sm text-ink-4">{label}</p>;
}
