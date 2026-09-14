'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Search, Pin, ChevronRight, ChevronDown, CheckCheck } from 'lucide-react';

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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function chatTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const daysAgo = (now.getTime() - d.getTime()) / 86400000;
  if (daysAgo < 7) return DAYS[d.getDay()];
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function preview(row: ChatRow, currentUserId: string) {
  const mine = row.last_sender_id === currentUserId;
  let text: string;
  if (row.last_message) text = row.last_message;
  else if (row.last_has_attachment) text = 'Attachment';
  else text = 'No messages yet';
  return mine ? `You: ${text}` : text;
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
// A small dot color per project, drawn from the same palette (solid, not gradient).
const DOTS = ['#dd4e1e', '#0d8a58', '#3a31a0', '#b23a20', '#245f9e', '#a3428a', '#b0741c', '#227a72'];
function dotFor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return DOTS[h % DOTS.length];
}

type Group = {
  projectId: string;
  projectTitle: string;
  chats: ChatRow[];
  unread: number;
  lastAt: number; // most recent activity in the group
};

export default function ChatList({
  rows: initial,
  currentUserId,
  onOpen,
  selectedId,
}: {
  rows: ChatRow[];
  currentUserId: string;
  onOpen: (taskId: string, view: 'chat' | 'specs') => void;
  selectedId?: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [rows, setRows] = useState<ChatRow[]>(initial);
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => { setRows(initial); }, [initial]);

  // Realtime: live-update rows as messages arrive / reads happen.
  useEffect(() => {
    const refreshList = async () => {
      const { data } = await supabase.rpc('chat_list_for_user');
      if (data) setRows(data as ChatRow[]);
    };
    const msgChannel = supabase
      .channel('chat-list-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as any;
        setRows((prev) => {
          const idx = prev.findIndex((r) => r.task_id === m.task_id);
          if (idx === -1) { refreshList(); return prev; }
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
          return [updated, ...next];
        });
      })
      .subscribe();
    const readsChannel = supabase
      .channel('chat-list-reads')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reads' }, (payload) => {
        if ((payload.new as any).user_id === currentUserId) refreshList();
      })
      .subscribe();
    return () => { supabase.removeChannel(msgChannel); supabase.removeChannel(readsChannel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  const togglePin = async (e: React.MouseEvent, row: ChatRow) => {
    e.stopPropagation();
    const next = !row.is_pinned;
    setRows((prev) => prev.map((r) => (r.task_id === row.task_id ? { ...r, is_pinned: next } : r)));
    if (next) await supabase.from('task_pins').insert({ user_id: currentUserId, task_id: row.task_id });
    else await supabase.from('task_pins').delete().eq('user_id', currentUserId).eq('task_id', row.task_id);
  };

  const matches = (r: ChatRow) => {
    if (!q.trim()) return true;
    const hay = `${r.task_title} ${r.project_title} ${r.channel_name ?? ''}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  };

  const searching = q.trim().length > 0;

  // Pinned strip (flat, sorted by recency).
  const pinned = useMemo(
    () =>
      rows
        .filter((r) => r.is_pinned && matches(r))
        .sort((a, b) => (b.last_at ? +new Date(b.last_at) : 0) - (a.last_at ? +new Date(a.last_at) : 0)),
    [rows, q]
  );

  // Groups: unpinned chats grouped by project.
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const r of rows) {
      if (r.is_pinned) continue;          // pinned live in the strip, not groups
      if (!matches(r)) continue;
      let g = map.get(r.project_id);
      if (!g) {
        g = { projectId: r.project_id, projectTitle: r.project_title, chats: [], unread: 0, lastAt: 0 };
        map.set(r.project_id, g);
      }
      g.chats.push(r);
      g.unread += r.unread_count;
      const t = r.last_at ? +new Date(r.last_at) : 0;
      if (t > g.lastAt) g.lastAt = t;
    }
    const arr = Array.from(map.values());
    // channel chats first, then by recency, within each group
    for (const g of arr) {
      g.chats.sort((a, b) => {
        if (a.is_channel_chat !== b.is_channel_chat) return a.is_channel_chat ? -1 : 1;
        return (b.last_at ? +new Date(b.last_at) : 0) - (a.last_at ? +new Date(a.last_at) : 0);
      });
    }
    // groups by most recent activity
    arr.sort((a, b) => b.lastAt - a.lastAt);
    return arr;
  }, [rows, q]);

  const selectedProjectId = selectedId
    ? rows.find((r) => r.task_id === selectedId)?.project_id
    : null;
  const isOpen = (pid: string) =>
    searching ? true : (expanded[pid] ?? pid === selectedProjectId);
  const toggleGroup = (pid: string) =>
    setExpanded((prev) => ({ ...prev, [pid]: !isOpen(pid) }));

  // ── Row renderers ──
  const ChatRowFull = (row: ChatRow) => {
    const unread = row.unread_count > 0;
    const isSelected = selectedId === row.task_id;
    return (
      <div
        key={row.task_id}
        onClick={() => onOpen ? onOpen(row.task_id, 'chat') : router.push(`/dashboard/chats/${row.task_id}`)}
        className={`relative mx-1.5 my-1 flex cursor-pointer gap-3 rounded-xl px-3 py-3 pl-3.5 transition-colors ${
          isSelected
            ? 'bg-[#fff6ec]'
            : unread
            ? 'bg-surface shadow-[0_1px_2px_rgba(30,70,107,0.05)] hover:bg-chip/40'
            : 'hover:bg-chip/50'
        }`}
      >
        {unread && <span className="absolute inset-y-3.5 left-0 w-[3px] rounded-full bg-signal" aria-hidden="true" />}
        <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px] text-[16px] font-bold tracking-tight text-white shadow-[0_2px_6px_rgba(30,70,107,0.12)]"
          style={{ background: gradientFor(row.task_id) }}>
          {initials(row.is_channel_chat ? (row.channel_name || row.task_title) : row.task_title)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[15.5px] font-semibold text-[#1a2e42]">
              {row.is_channel_chat && <span className="text-ink-4">#</span>}
              {row.task_title}
            </span>
            <span className={`shrink-0 text-[11px] ${unread ? 'font-semibold text-signal' : 'text-ink-4'}`}>{chatTime(row.last_at)}</span>
          </div>
          <div className="my-0.5 flex">
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-line bg-surface px-2 py-[1px] text-[10px] font-medium text-ink-3">
              <span className="truncate">{row.project_title}</span>
              {row.channel_name && (<><ChevronRight size={9} className="shrink-0 text-ink-4" /><span className="truncate">{row.channel_name}</span></>)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className={`truncate text-[13px] ${unread ? 'font-medium text-ink-2' : 'text-[#7a6f5f]'}`}>{preview(row, currentUserId)}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              <button onClick={(e) => togglePin(e, row)} aria-label={row.is_pinned ? 'Unpin' : 'Pin'}
                className={row.is_pinned ? 'text-signal' : 'text-transparent hover:text-ink-4'}>
                <Pin size={13} fill={row.is_pinned ? 'currentColor' : 'none'} />
              </button>
              {unread ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-signal px-1.5 text-[11px] font-bold text-white shadow-[0_1px_3px_rgba(255,107,44,0.4)]">
                  {row.unread_count > 99 ? '99+' : row.unread_count}
                </span>
              ) : row.last_sender_id === currentUserId ? <CheckCheck size={15} className="text-ink-4" /> : null}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Compact row inside an expanded group (project is implied by the group header).
  const ChatRowCompact = (row: ChatRow) => {
    const unread = row.unread_count > 0;
    return (
      <div
        key={row.task_id}
        onClick={() => onOpen ? onOpen(row.task_id, 'chat') : router.push(`/dashboard/chats/${row.task_id}`)}
        className={`group/row flex cursor-pointer gap-2.5 border-t border-[#f4ece0] px-3 py-2.5 transition-colors ${selectedId === row.task_id ? 'bg-[#fff6ec]' : 'hover:bg-chip/40'}`}
      >
        <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] text-[12px] font-bold text-white"
          style={{ background: gradientFor(row.task_id) }}>
          {initials(row.is_channel_chat ? (row.channel_name || row.task_title) : row.task_title)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className={`truncate text-[13.5px] ${unread ? 'font-bold text-[#1a2e42]' : 'font-semibold text-[#1a2e42]'}`}>
              {row.is_channel_chat && <span className="text-ink-4">#</span>}
              {row.channel_name && row.is_channel_chat ? row.task_title : row.task_title}
            </span>
            <span className={`shrink-0 text-[10px] ${unread ? 'font-semibold text-signal' : 'text-ink-4'}`}>{chatTime(row.last_at)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className={`truncate text-[12px] ${unread ? 'font-medium text-ink-2' : 'text-[#7a6f5f]'}`}>{preview(row, currentUserId)}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={(e) => togglePin(e, row)}
                aria-label={row.is_pinned ? 'Unpin' : 'Pin'}
                className={`transition-colors ${
                  row.is_pinned
                    ? 'text-signal'
                    : 'text-ink-4/40 hover:text-signal sm:opacity-0 sm:group-hover/row:opacity-100'
                }`}
              >
                <Pin size={12} fill={row.is_pinned ? 'currentColor' : 'none'} />
              </button>
              {unread ? (
                <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-signal px-1.5 text-[10px] font-bold text-white">
                  {row.unread_count > 99 ? '99+' : row.unread_count}
                </span>
              ) : row.last_sender_id === currentUserId ? <CheckCheck size={13} className="text-ink-4" /> : null}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const nothing = pinned.length === 0 && groups.length === 0;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="px-3 pb-2 pt-1">
        <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2.5">
          <Search size={16} className="text-ink-4" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-4" />
        </div>
      </div>

      {nothing && (
        <p className="px-4 py-16 text-center text-sm text-ink-3">
          {searching ? 'No chats match your search.' : 'No chats yet. Chats appear here once you\u2019re a participant on a task.'}
        </p>
      )}

      {/* Pinned strip */}
      {pinned.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 px-4 pb-1 pt-2">
            <Pin size={12} className="text-signal" fill="currentColor" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#b0a48f]">Pinned</span>
          </div>
          {pinned.map(ChatRowFull)}
        </>
      )}

      {/* Project groups */}
      {groups.length > 0 && (
        <div className="mt-2 space-y-2 px-1.5">
          {groups.map((g) => {
            const open = isOpen(g.projectId);
            return (
              <div key={g.projectId} className="overflow-hidden rounded-[13px] border border-line bg-surface">
                <button
                  onClick={() => toggleGroup(g.projectId)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left"
                >
                  {open ? <ChevronDown size={16} className="shrink-0 text-ink-4" /> : <ChevronRight size={16} className="shrink-0 text-ink-4" />}
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: dotFor(g.projectId) }} aria-hidden="true" />
                  <span className="flex-1 truncate text-[14.5px] font-bold text-ink">{g.projectTitle}</span>
                  {g.unread > 0 && (
                    <span className="ml-0.5 flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-signal px-1.5 text-[10px] font-bold text-white">
                      {g.unread > 99 ? '99+' : g.unread}
                    </span>
                  )}
                </button>
                {open && <div>{g.chats.map(ChatRowCompact)}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
