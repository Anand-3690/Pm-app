'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Search, Pin, ChevronRight, Check, CheckCheck } from 'lucide-react';
import Avatar from './avatar';

export type ChatRow = {
  task_id: string;
  task_title: string;
  channel_id: string | null;
  channel_name: string | null;
  project_id: string;
  project_title: string;
  last_message: string | null;
  last_at: string | null;
  last_sender_id: string | null;
  last_has_attachment: boolean;
  unread_count: number;
  is_pinned: boolean;
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// WhatsApp-style relative time: HH:MM today, weekday this week, else date.
function chatTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const daysAgo = (now.getTime() - d.getTime()) / 86400000;
  if (daysAgo < 7) return DAYS[d.getDay()];
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function preview(row: ChatRow, currentUserId: string) {
  const mine = row.last_sender_id === currentUserId;
  const who = mine ? 'You' : null;
  let text: string;
  if (row.last_message) text = row.last_message;
  else if (row.last_has_attachment) text = 'Attachment';
  else text = 'No messages yet';
  return who ? `${who}: ${text}` : text;
}

export default function ChatList({
  rows: initial,
  currentUserId,
}: {
  rows: ChatRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [rows, setRows] = useState<ChatRow[]>(initial);
  const [q, setQ] = useState('');

  const togglePin = async (e: React.MouseEvent, row: ChatRow) => {
    e.stopPropagation();
    const next = !row.is_pinned;
    setRows((prev) =>
      prev.map((r) => (r.task_id === row.task_id ? { ...r, is_pinned: next } : r))
    );
    if (next) {
      await supabase.from('task_pins').insert({ user_id: currentUserId, task_id: row.task_id });
    } else {
      await supabase
        .from('task_pins')
        .delete()
        .eq('user_id', currentUserId)
        .eq('task_id', row.task_id);
    }
  };

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const hay = `${r.task_title} ${r.project_title} ${r.channel_name ?? ''}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  const sorted = [...filtered].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    const at = a.last_at ? new Date(a.last_at).getTime() : 0;
    const bt = b.last_at ? new Date(b.last_at).getTime() : 0;
    return bt - at;
  });

  const pinned = sorted.filter((r) => r.is_pinned);
  const recent = sorted.filter((r) => !r.is_pinned);

  const Row = (row: ChatRow) => {
    const unread = row.unread_count > 0;
    return (
      <div
        key={row.task_id}
        onClick={() => router.push(`/dashboard/chats/${row.task_id}`)}
        className="flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-chip/50 active:bg-chip"
      >
        <div className="relative shrink-0">
          <Avatar url={null} name={row.task_title} size={44} />
        </div>
        <div className="min-w-0 flex-1 border-b border-line-soft pb-3">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={`truncate text-[15px] ${unread ? 'font-semibold text-ink' : 'font-medium text-ink'}`}
            >
              {row.task_title}
            </span>
            <span className={`shrink-0 text-[11px] ${unread ? 'text-signal' : 'text-ink-4'}`}>
              {chatTime(row.last_at)}
            </span>
          </div>

          {/* breadcrumb — a subtle pill so it reads as context, not another text line */}
          <div className="mt-1 flex">
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] text-ink-3">
              <span className="truncate">{row.project_title}</span>
              {row.channel_name && (
                <>
                  <ChevronRight size={9} className="shrink-0 text-ink-4" />
                  <span className="truncate">{row.channel_name}</span>
                </>
              )}
            </span>
          </div>

          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className={`truncate text-[13px] ${unread ? 'text-ink-2' : 'text-ink-3'}`}>
              {preview(row, currentUserId)}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={(e) => togglePin(e, row)}
                aria-label={row.is_pinned ? 'Unpin' : 'Pin'}
                className={row.is_pinned ? 'text-signal' : 'text-ink-4/0 hover:text-ink-4'}
              >
                <Pin size={13} fill={row.is_pinned ? 'currentColor' : 'none'} />
              </button>
              {unread ? (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-signal px-1.5 text-[11px] font-medium text-white">
                  {row.unread_count > 99 ? '99+' : row.unread_count}
                </span>
              ) : row.last_sender_id === currentUserId ? (
                <CheckCheck size={15} className="text-ink-4" />
              ) : null}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-2xl">
      {/* Search */}
      <div className="px-4 pb-2 pt-1">
        <div className="flex items-center gap-2 rounded-full border border-line bg-chip px-3 py-2">
          <Search size={16} className="text-ink-4" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-4"
          />
        </div>
      </div>

      {sorted.length === 0 && (
        <p className="px-4 py-16 text-center text-sm text-ink-3">
          {q.trim() ? 'No chats match your search.' : 'No chats yet. Chats appear here once you\u2019re a participant on a task.'}
        </p>
      )}

      {pinned.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 px-4 pb-1 pt-2">
            <Pin size={12} className="text-ink-4" />
            <span className="rule-label text-ink-4">Pinned</span>
          </div>
          {pinned.map(Row)}
        </>
      )}

      {recent.length > 0 && (
        <>
          {pinned.length > 0 && (
            <div className="px-4 pb-1 pt-2">
              <span className="rule-label text-ink-4">Recent</span>
            </div>
          )}
          {recent.map(Row)}
        </>
      )}
    </div>
  );
}
