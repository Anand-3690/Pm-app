'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Search, Pin, ChevronRight, CheckCheck } from 'lucide-react';

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
  is_channel_chat: boolean;
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

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

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

const GRADIENTS = [
  'linear-gradient(135deg,#ff7a33,#dd4e1e)',
  'linear-gradient(135deg,#2fc47f,#0d8a58)',
  'linear-gradient(135deg,#5b52d0,#3a31a0)',
  'linear-gradient(135deg,#e2664a,#b23a20)',
  'linear-gradient(135deg,#3d8ed0,#245f9e)',
  'linear-gradient(135deg,#d072b5,#a3428a)',
  'linear-gradient(135deg,#d99a34,#b0741c)',
  'linear-gradient(135deg,#48b0a8,#227a72)',
];
function gradientFor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
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

  // Keep state in sync if the server sends fresh rows (e.g. after navigation).
  useEffect(() => {
    setRows(initial);
  }, [initial]);

  // ── Realtime: live-update rows as messages arrive / reads happen ──
  useEffect(() => {
    const refreshList = async () => {
      const { data } = await supabase.rpc('chat_list_for_user');
      if (data) setRows(data as ChatRow[]);
    };

    const msgChannel = supabase
      .channel('chat-list-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const m = payload.new as any;
          setRows((prev) => {
            const idx = prev.findIndex((r) => r.task_id === m.task_id);
            if (idx === -1) {
              // Message for a task not in the list → brand-new chat; refresh to get its breadcrumb.
              refreshList();
              return prev;
            }
            const fromMe = m.sender_id === currentUserId;
            const updated: ChatRow = {
              ...prev[idx],
              last_message: m.content ?? null,
              last_at: m.created_at,
              last_sender_id: m.sender_id,
              last_has_attachment: m.attachment_url != null,
              unread_count: fromMe ? prev[idx].unread_count : prev[idx].unread_count + 1,
            };
            const next = [...prev];
            next.splice(idx, 1);
            return [updated, ...next]; // move to top; render sort re-orders anyway
          });
        }
      )
      .subscribe();

    const readsChannel = supabase
      .channel('chat-list-reads')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reads' },
        (payload) => {
          const r = payload.new as any;
          if (r.user_id !== currentUserId) return; // only my own reads clear my badges
          // We don't know which task from a single read row cheaply; clear optimistically
          // by refreshing the unread picture. Cheap enough (only fires on my reads).
          refreshList();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(readsChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

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
        className={`relative mx-1.5 my-1 flex cursor-pointer gap-3 rounded-xl px-3 py-3 pl-3.5 transition-colors ${
          row.is_pinned
            ? 'bg-[#fffaf3] hover:bg-[#fff5e9]'
            : unread
            ? 'bg-surface shadow-[0_1px_2px_rgba(30,70,107,0.05)] hover:bg-chip/40'
            : 'hover:bg-chip/50'
        }`}
      >
        {unread && (
          <span className="absolute inset-y-3.5 left-0 w-[3px] rounded-full bg-signal" aria-hidden="true" />
        )}

        <div
          className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px] text-[16px] font-bold tracking-tight text-white shadow-[0_2px_6px_rgba(30,70,107,0.12)]"
          style={{ background: gradientFor(row.task_id) }}
        >
          {initials(row.task_title)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className={`truncate text-[15.5px] ${unread ? 'font-semibold text-[#1a2e42]' : 'font-semibold text-[#1a2e42]'}`}>
              {row.is_channel_chat && <span className="text-ink-4">#</span>}
              {row.task_title}
            </span>
            <span className={`shrink-0 text-[11px] ${unread ? 'font-semibold text-signal' : 'text-ink-4'}`}>
              {chatTime(row.last_at)}
            </span>
          </div>

          <div className="my-0.5 flex">
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-line bg-surface px-2 py-[1px] text-[10px] font-medium text-ink-3">
              <span className="truncate">{row.project_title}</span>
              {row.channel_name && (
                <>
                  <ChevronRight size={9} className="shrink-0 text-ink-4" />
                  <span className="truncate">{row.channel_name}</span>
                </>
              )}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span
              className={`truncate text-[13px] ${unread ? 'font-medium text-ink-2' : 'text-[#7a6f5f]'}`}
            >
              {preview(row, currentUserId)}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={(e) => togglePin(e, row)}
                aria-label={row.is_pinned ? 'Unpin' : 'Pin'}
                className={row.is_pinned ? 'text-signal' : 'text-transparent hover:text-ink-4'}
              >
                <Pin size={13} fill={row.is_pinned ? 'currentColor' : 'none'} />
              </button>
              {unread ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-signal px-1.5 text-[11px] font-bold text-white shadow-[0_1px_3px_rgba(255,107,44,0.4)]">
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
      <div className="px-3 pb-2 pt-1">
        <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2.5">
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
            <Pin size={12} className="text-signal" fill="currentColor" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#b0a48f]">Pinned</span>
          </div>
          {pinned.map(Row)}
        </>
      )}

      {recent.length > 0 && (
        <>
          {pinned.length > 0 && (
            <div className="px-4 pb-1 pt-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#b0a48f]">Recent</span>
            </div>
          )}
          {recent.map(Row)}
        </>
      )}
    </div>
  );
}
