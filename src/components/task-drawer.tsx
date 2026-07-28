'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  X, Send, Paperclip, CornerUpLeft, Check, CheckCheck, FileText, Image as ImageIcon,
} from 'lucide-react';
import { avatarColor } from '@/lib/avatar-color';
import { useSignedUrls } from '@/lib/use-signed-urls';
import { useSwipeToReply } from '@/lib/use-swipe-to-reply';
import TaskMediaPanel from './task-media-panel';
import TaskParticipants from './task-participants';
import type { Task, Message } from '@/lib/types';

type Member = {
  id: string;
  role: string;
  user_id: string;
  profiles: { id: string; full_name: string | null; email: string | null };
};

type MessageWithReads = Message & { reads?: { user_id: string }[] };

/** Local-date key, so messages near midnight group under the correct day. */
const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (dayKey(iso) === dayKey(today.toISOString())) return 'Today';
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return 'Yesterday';

  const daysAgo = (today.getTime() - d.getTime()) / 86400000;
  if (daysAgo < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });

  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export default function TaskDrawer({
  task,
  members,
  currentUserId,
  isAdmin,
  onClose,
  onStatusChange,
}: {
  task: Task;
  members: Member[];
  currentUserId: string;
  isAdmin: boolean;
  onClose: () => void;
  onStatusChange: (status: Task['status']) => void;
}) {
  const supabase = createClient();
  const [messages, setMessages] = useState<MessageWithReads[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [sending, setSending] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const signedUrls = useSignedUrls(supabase, messages);

  const profileById = (id: string) => members.find((m) => m.user_id === id)?.profiles;
  const recipientCount = members.length - 1; // everyone except the sender

  const markRead = async (messageIds: string[]) => {
    if (messageIds.length === 0) return;
    const rows = messageIds.map((message_id) => ({ message_id, user_id: currentUserId }));
    await supabase.from('message_reads').upsert(rows, { onConflict: 'message_id,user_id', ignoreDuplicates: true });
  };

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel>;
    let readsChannel: ReturnType<typeof supabase.channel>;

    const load = async () => {
      const { data } = await supabase
        .from('messages')
        .select(
          '*, sender:profiles!messages_sender_id_fkey(id, full_name, email, avatar_url), reads:message_reads(user_id)'
        )
        .eq('task_id', task.id)
        .order('created_at', { ascending: true });

      setMessages((data as any) || []);
      setLoading(false);

      const unreadFromOthers = (data || []).filter(
        (m: any) => m.sender_id !== currentUserId
      );
      markRead(unreadFromOthers.map((m: any) => m.id));
    };

    load();

    channel = supabase
      .channel(`task-messages-${task.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `task_id=eq.${task.id}` },
        async (payload) => {
          const { data: fullMessage } = await supabase
            .from('messages')
            .select(
              '*, sender:profiles!messages_sender_id_fkey(id, full_name, email, avatar_url), reads:message_reads(user_id)'
            )
            .eq('id', payload.new.id)
            .single();

          if (fullMessage) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === fullMessage.id)) return prev;
              return [...prev, fullMessage as any];
            });
            if ((fullMessage as any).sender_id !== currentUserId) {
              markRead([(fullMessage as any).id]);
            }
          }
        }
      )
      .subscribe();

    readsChannel = supabase
      .channel(`task-reads-${task.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reads' },
        (payload) => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== payload.new.message_id) return m;
              const already = (m.reads || []).some((r) => r.user_id === payload.new.user_id);
              if (already) return m;
              return { ...m, reads: [...(m.reads || []), { user_id: payload.new.user_id }] };
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(readsChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);

    const { error } = await supabase.from('messages').insert({
      task_id: task.id,
      sender_id: currentUserId,
      content: text.trim(),
      reply_to_id: replyTo?.id || null,
    });

    if (!error) {
      setText('');
      setReplyTo(null);
    }
    setSending(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);

    const filePath = `${task.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('task-attachments')
      .upload(filePath, file);

    if (uploadError) {
      alert('Upload failed: ' + uploadError.message);
      setUploadingFile(false);
      return;
    }

    const isImage = file.type.startsWith('image/');

    // Store the object PATH, not an absolute URL. URLs are minted at render
    // time via createSignedUrl, so attachments survive host/protocol changes.
    await supabase.from('messages').insert({
      task_id: task.id,
      sender_id: currentUserId,
      content: file.name,
      attachment_url: filePath,
      attachment_type: isImage ? 'image' : 'file',
      reply_to_id: replyTo?.id || null,
    });

    setReplyTo(null);
    setUploadingFile(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const renderTicks = (msg: MessageWithReads) => {
    const readCount = (msg.reads || []).length;
    if (recipientCount <= 0) return <Check size={13} className="text-ink-4" />;
    if (readCount >= recipientCount) return <CheckCheck size={13} className="text-signal" />;
    if (readCount > 0) return <CheckCheck size={13} className="text-ink-4" />;
    return <Check size={13} className="text-ink-4" />;
  };

  const renderAttachment = (msg: MessageWithReads, isMine: boolean) => {
    if (!msg.attachment_url) return null;

    const key = msg.attachment_url;
    const href = signedUrls[key];
    const pending = !(key in signedUrls);

    if (msg.attachment_type === 'image') {
      if (pending) {
        return <div className="mb-1 h-40 w-40 animate-pulse rounded-lg bg-line" />;
      }
      if (!href) {
        return (
          <div className="mb-1 rounded-lg bg-chip px-3 py-3 text-center text-[11px] text-ink-3">
            Image no longer available
          </div>
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer">
          <img
            src={href}
            alt={msg.content || 'attachment'}
            className="mb-1 max-h-64 rounded-lg object-cover"
          />
        </a>
      );
    }

    if (msg.attachment_type === 'file') {
      const shell = isMine ? 'bg-surface/70' : 'bg-chip';
      if (!href) {
        return (
          <div
            className={`mb-1 flex items-center gap-2 rounded-lg border-l-[3px] border-l-line px-2.5 py-2 text-xs text-ink-3 ${shell}`}
          >
            <FileText size={16} className="shrink-0" />
            <span className="truncate">{msg.content}</span>
            <span className="ml-auto shrink-0 text-[10px]">
              {pending ? 'Loading…' : 'unavailable'}
            </span>
          </div>
        );
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={`mb-1 flex items-center gap-2.5 rounded-lg border-l-[3px] border-l-signal px-2.5 py-2 text-xs text-ink transition-colors hover:bg-chip ${shell}`}
        >
          <FileText size={16} className="shrink-0 text-signal-ink" />
          <span className="truncate font-medium">{msg.content}</span>
        </a>
      );
    }

    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40">
      <div className="relative flex h-full w-full max-w-lg flex-col bg-surface sm:max-w-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line bg-surface px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-bold text-ink">{task.title}</h2>
            {task.description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-ink-3">{task.description}</p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={task.status}
                onChange={(e) => onStatusChange(e.target.value as Task['status'])}
                className="rounded-md border border-line bg-ground px-2 py-1 text-xs text-ink-2 outline-none focus:border-signal"
              >
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
              {task.due_date && (
                <span className="text-xs text-ink-3">
                  Due {new Date(task.due_date).toLocaleDateString()}
                </span>
              )}
              {task.assignee && (
                <span className="text-xs text-ink-3">
                  → {task.assignee.full_name || task.assignee.email}
                </span>
              )}
            </div>

            <div className="mt-2">
              <TaskParticipants
                taskId={task.id}
                members={members}
                canManage={isAdmin || task.created_by === currentUserId}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => setShowMedia(true)}
              title="Shared media"
              aria-label="Shared media"
              className="rounded-md p-1.5 text-signal-ink transition-colors hover:bg-signal-tint"
            >
              <ImageIcon size={18} />
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-chip hover:text-ink"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Chat messages — flex-col-reverse anchors to the bottom with no scroll jump.
            Messages render newest-first in the DOM; the reverse makes them appear
            oldest-top, newest-bottom, and the browser opens already scrolled to the
            latest message. */}
        <div className="flex flex-1 flex-col-reverse space-y-2.5 space-y-reverse overflow-y-auto overflow-x-hidden bg-[#f4f1ec] px-3 py-4">
          {loading ? (
            <p className="text-center text-sm text-ink-3">Loading messages…</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-sm text-ink-3">No messages yet. Say hello.</p>
          ) : (
            [...messages].reverse().map((msg, i, arr) => {
              const isMine = msg.sender_id === currentUserId;
              const sender = msg.sender || profileById(msg.sender_id);
              const repliedMsg = msg.reply_to_id
                ? messages.find((m) => m.id === msg.reply_to_id)
                : null;
              const senderLabel = sender?.full_name || sender?.email || 'Unknown';

              // In reversed order, arr[i + 1] is the chronologically-earlier message.
              // A day divider caps the top of each day's group, so it shows when the
              // older neighbour is a different day (or this is the oldest message).
              const olderMsg = arr[i + 1];
              const showDayDivider =
                !olderMsg || dayKey(msg.created_at) !== dayKey(olderMsg.created_at);

              return (
                <Fragment key={msg.id}>
                  <MessageRow
                    msg={msg}
                    isMine={isMine}
                    senderLabel={senderLabel}
                    repliedMsg={repliedMsg as MessageWithReads | null}
                    currentUserId={currentUserId}
                    onReply={() => setReplyTo(msg)}
                    renderAttachment={renderAttachment}
                    renderTicks={renderTicks}
                  />

                  {/* Divider renders AFTER the bubble in source; in a reversed column
                      that places it visually ABOVE the day's first message. */}
                  {showDayDivider && (
                    <div className="flex justify-center py-2">
                      <span className="stamp bg-chip text-ink-2">{dayLabel(msg.created_at)}</span>
                    </div>
                  )}
                </Fragment>
              );
            })
          )}
        </div>

        {/* Reply preview */}
        {replyTo && (
          <div className="flex items-center justify-between gap-3 border-t border-line bg-ground px-3 py-2">
            <div className="min-w-0 border-l-[3px] border-l-signal pl-2">
              <p className="text-xs font-medium text-signal-ink">
                Replying to{' '}
                {replyTo.sender_id === currentUserId
                  ? 'yourself'
                  : replyTo.sender?.full_name || 'Unknown'}
              </p>
              <p className="truncate text-xs text-ink-3">{replyTo.content || 'Attachment'}</p>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              aria-label="Cancel reply"
              className="shrink-0 rounded p-1 text-ink-3 hover:text-ink"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={handleSend}
          className="flex items-center gap-2 border-t border-line bg-surface px-3 py-2.5"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.xlsx,.zip"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingFile}
            aria-label="Attach a file"
            className="shrink-0 rounded-full p-2 text-ink-2 transition-colors hover:bg-chip disabled:opacity-50"
          >
            <Paperclip size={20} />
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={uploadingFile ? 'Uploading…' : 'Type a message'}
            disabled={uploadingFile}
            className="flex-1 rounded-full border border-line bg-ground px-4 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-signal focus:ring-2 focus:ring-signal/25"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            aria-label="Send"
            className="shrink-0 rounded-full bg-signal p-2.5 text-white transition-colors hover:bg-signal-hover disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </form>

        {showMedia && <TaskMediaPanel messages={messages} onClose={() => setShowMedia(false)} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Single message row. Extracted so it can own a swipe hook (hooks    */
/* can't be called inside .map()). Swipe right → reply, WhatsApp-style.*/
/*                                                                     */
/* No overflow property on the row — clipping is handled by the        */
/* scroll container's overflow-x-hidden (Safari-safe). Row-level       */
/* overflow clip was collapsing bubble height on iOS.                  */
/* ------------------------------------------------------------------ */
function MessageRow({
  msg,
  isMine,
  senderLabel,
  repliedMsg,
  currentUserId,
  onReply,
  renderAttachment,
  renderTicks,
}: {
  msg: MessageWithReads;
  isMine: boolean;
  senderLabel: string;
  repliedMsg: MessageWithReads | null;
  currentUserId: string;
  onReply: () => void;
  renderAttachment: (msg: MessageWithReads, isMine: boolean) => React.ReactNode;
  renderTicks: (msg: MessageWithReads) => React.ReactNode;
}) {
  const { handlers, offset, progress } = useSwipeToReply(onReply);

  return (
    <div
      {...handlers}
      className={`relative flex items-end gap-2 ${
        isMine ? 'justify-end' : 'justify-start'
      }`}
    >
      {/* Reply icon revealed as the bubble slides right */}
      <div
        className="pointer-events-none absolute inset-y-0 left-1 flex items-center"
        style={{ opacity: progress }}
        aria-hidden="true"
      >
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full bg-signal text-white"
          style={{ transform: `scale(${0.7 + progress * 0.3})` }}
        >
          <CornerUpLeft size={15} />
        </div>
      </div>

      {!isMine && (
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-white ${avatarColor(senderLabel)}`}
          style={{
            transform: `translateX(${offset}px)`,
            transition: offset === 0 ? 'transform 0.18s ease-out' : 'none',
          }}
        >
          {senderLabel[0].toUpperCase()}
        </div>
      )}

      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: offset === 0 ? 'transform 0.18s ease-out' : 'none',
        }}
        className={`max-w-[76%] rounded-[10px] border px-3 py-2 ${
          isMine ? 'border-bubble-line bg-bubble' : 'border-line bg-surface'
        }`}
      >
        {!isMine && (
          <p className="rule-label mb-0.5 text-signal-ink">{senderLabel}</p>
        )}

        {repliedMsg && (
          <div className="mb-1.5 rounded-md border-l-[3px] border-l-signal bg-ink/5 px-2 py-1">
            <p className="text-[11px] font-medium text-signal-ink">
              {repliedMsg.sender_id === currentUserId
                ? 'You'
                : repliedMsg.sender?.full_name || 'Unknown'}
            </p>
            <p className="truncate text-[11px] text-ink-2">
              {repliedMsg.content || 'Attachment'}
            </p>
          </div>
        )}

        {renderAttachment(msg, isMine)}

        {!msg.attachment_url && (
          <p className={`whitespace-pre-wrap break-words text-sm ${isMine ? 'text-white' : 'text-ink'}`}>
            {msg.content}
          </p>
        )}

        <div className="mt-1 flex items-center justify-end gap-1.5">
          <button
            onClick={onReply}
            className={`mr-auto text-[10px] transition-colors ${
              isMine ? 'text-[#9fb4cb] hover:text-white' : 'text-ink-4 hover:text-ink-2'
            }`}
          >
            <CornerUpLeft size={11} className="inline" /> reply
          </button>
          <span className={`text-[10px] ${isMine ? 'text-[#9fb4cb]' : 'text-ink-4'}`}>
            {formatTime(msg.created_at)}
          </span>
          {isMine && renderTicks(msg)}
        </div>
      </div>
    </div>
  );
}