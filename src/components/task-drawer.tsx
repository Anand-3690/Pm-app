'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  X, Send, Paperclip, CornerUpLeft, Check, CheckCheck, FileText, Image as ImageIcon, MoreVertical, Trash2,
  ArrowLeft, User
} from 'lucide-react';
import { avatarColor } from '@/lib/avatar-color';
import { useSignedUrls } from '@/lib/use-signed-urls';
import { useSwipeToReply } from '@/lib/use-swipe-to-reply';
import TaskMediaPanel from './task-media-panel';
import TaskParticipants from './task-participants';
import type { Task, Message } from '@/lib/types';
import Avatar from './avatar';

type Member = {
  id: string;
  role: string;
  user_id: string;
  profiles: { id: string; full_name: string | null; email: string | null };
};

type MessageWithReads = Message & { reads?: { user_id: string }[] };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
  if (daysAgo < 7) return DAYS[d.getDay()];

  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === today.getFullYear() ? '' : ` ${d.getFullYear()}`}`;
};

const formatDueDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`}`;
};

const formatReplyPreview = (msg: MessageWithReads | Message | null) => {
  if (!msg) return '';
  if (msg.attachment_type === 'image') return '📷 Photo';
  if (msg.attachment_type === 'file') return `📄 ${msg.content || 'Document'}`;
  return msg.content || 'Message';
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** Render URLs in message text as clickable links; stopPropagation so a tap
 *  on a link doesn't trigger swipe-to-reply. */
function linkify(text: string) {
  if (!text) return null;
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="font-medium text-signal-ink underline underline-offset-2 transition-colors hover:text-signal"
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

export default function TaskDrawer({
  task,
  members,
  channels,
  currentUserId,
  isAdmin,
  onClose,
  onStatusChange,
  onTaskMoved,       // ADD
  onTaskDeleted,
  fullPage = false,
  embedded = false,
}: {
  task: Task;
  members: Member[];
  channels: { id: string; name: string }[];
  currentUserId: string;
  isAdmin: boolean;
  onClose: () => void;
  onStatusChange: (status: Task['status']) => void;
  onTaskMoved?: (taskId: string) => void;       // ADD
  onTaskDeleted?: (taskId: string) => void;     // ADD
  fullPage?: boolean;
  embedded?: boolean;
}) {
  const supabase = createClient();
  const [messages, setMessages] = useState<MessageWithReads[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [sending, setSending] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const canManage = isAdmin || task.created_by === currentUserId;
  const initialIdsRef = useRef<Set<string> | null>(null);

  const moveToChannel = async (channelId: string) => {
    if (task.is_channel_chat) return;
    setMoving(true);
    const { error } = await supabase
      .from('tasks')
      .update({ channel_id: channelId })
      .eq('id', task.id);
    setMoving(false);
    setMenuOpen(false);
    if (!error) {
      onTaskMoved?.(task.id);
      onClose();
    } else {
      alert('Move failed: ' + error.message);
    }
  };

  const deleteTask = async () => {
    if (task.is_channel_chat) return;
    if (!confirm('Delete this task and all its chat? This cannot be undone.')) return;
    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    if (!error) {
      onTaskDeleted?.(task.id);
      onClose();
    } else {
      alert('Delete failed: ' + error.message);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const signedUrls = useSignedUrls(supabase, messages);

  const [participantCount, setParticipantCount] = useState(0);
  const profileById = (id: string) => members.find((m) => m.user_id === id)?.profiles;
  const recipientCount = Math.max(0, participantCount - 1); // participants except the sender

  const markRead = async (messageIds: string[]) => {
    if (messageIds.length === 0) return;
    const rows = messageIds.map((message_id) => ({ message_id, user_id: currentUserId }));
    await supabase.from('message_reads').upsert(rows, { onConflict: 'message_id,user_id', ignoreDuplicates: true });
  };

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel>;
    let readsChannel: ReturnType<typeof supabase.channel>;

    const load = async () => {

      const { count } = await supabase
        .from('task_participants')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', task.id);
      setParticipantCount(count ?? 0);

      const { data } = await supabase
        .from('messages')
        .select(
          '*, sender:profiles!messages_sender_id_fkey(id, full_name, email, avatar_url), reads:message_reads(user_id)'
        )
        .eq('task_id', task.id)
        .order('created_at', { ascending: true });

      setMessages((data as any) || []);
      if (initialIdsRef.current === null) {
        initialIdsRef.current = new Set(((data as any) || []).map((m: any) => m.id));
      }
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
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
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
        return <div className="mb-1 h-44 w-56 max-w-full animate-pulse rounded-lg bg-line/60" />;
      }
      if (!href) {
        return (
          <div className="mb-1 rounded-lg bg-chip px-3 py-3 text-center text-[11px] text-ink-3">
            Image no longer available
          </div>
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg">
          <img
            src={href}
            alt={msg.content || 'attachment'}
            loading="lazy"
            className="mb-1 max-h-72 w-auto max-w-full rounded-lg object-contain shadow-sm transition-opacity duration-200"
          />
        </a>
      );
    }

    if (msg.attachment_type === 'file') {
      const shell = isMine ? 'bg-white/80 border border-bubble-line/60' : 'bg-chip';
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
    <div className={embedded ? 'flex h-full w-full' : fullPage ? 'fixed inset-0 z-50 flex' : 'fixed inset-0 z-50 flex justify-end bg-ink/40'}>
      <div
        className={`relative flex h-full flex-col overflow-hidden bg-[#faf6f0] ${embedded ? 'w-full' : fullPage ? 'w-full' : 'w-full max-w-lg sm:max-w-xl'}`}
      >
        {/* Custom SEVAK background wallpaper with reduced opacity */}
        <div
          className="pointer-events-none absolute inset-0 z-0 bg-repeat opacity-[0.14]"
          style={{
            backgroundImage: "url('/chat-bg.webp')",
            backgroundSize: '390px auto',
            backgroundPosition: 'center top',
          }}
          aria-hidden="true"
        />

        {/* Header */}
        <div className="relative z-10 flex items-start justify-between gap-2.5 border-b border-line bg-surface px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex min-w-0 flex-1 items-start gap-1.5 sm:gap-2">
            {fullPage && (
              <button
                onClick={onClose}
                aria-label="Back to chats"
                className="touch-manipulation -ml-1 mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-chip active:bg-chip/80"
              >
                <ArrowLeft size={21} />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-lg font-bold leading-tight text-ink">
                {task.is_channel_chat && <span className="mr-0.5 text-ink-4">#</span>}
                {task.title}
              </h2>
              {task.description && (
                <p className="mt-0.5 line-clamp-2 text-xs text-ink-3">{task.description}</p>
              )}

              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {!task.is_channel_chat && (
                  <select
                    value={task.status}
                    onChange={(e) => onStatusChange(e.target.value as Task['status'])}
                    className="touch-manipulation rounded-md border border-line bg-ground px-2 py-1 text-xs font-semibold text-ink-2 outline-none transition-colors focus:border-signal"
                  >
                    <option value="todo">To do</option>
                    <option value="in_progress">In progress</option>
                    <option value="done">Done</option>
                  </select>
                )}
                {task.assignee && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-line bg-ground px-2 py-1 text-xs text-ink-2">
                    <User size={12} className="shrink-0 text-ink-4" />
                    <span className="max-w-[140px] truncate font-medium">
                      {task.assignee.full_name || task.assignee.email}
                    </span>
                  </span>
                )}
                {task.due_date && (
                  <span className="text-xs font-medium text-ink-3">
                    Due {formatDueDate(task.due_date)}
                  </span>
                )}
              </div>

              <div className="mt-1.5">
                <TaskParticipants
                  taskId={task.id}
                  members={members}
                  canManage={isAdmin || task.created_by === currentUserId}
                />
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {canManage && !task.is_channel_chat && (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-label="Task options"
                  className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-chip hover:text-ink"
                >
                  <MoreVertical size={18} />
                </button>

                {menuOpen && (
                  <>
                    {/* click-away backdrop */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setMenuOpen(false)}
                      aria-hidden="true"
                    />
                    <div className="absolute right-0 z-50 mt-1 w-56 rounded-lg border border-line bg-surface py-1 shadow-lg">
                      <p className="rule-label px-3 py-1.5 text-ink-4">Move to channel</p>
                      <div className="max-h-48 overflow-y-auto">
                        {channels
                          .filter((c) => c.id !== task.channel_id)
                          .map((c) => (
                            <button
                              key={c.id}
                              onClick={() => moveToChannel(c.id)}
                              disabled={moving}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-chip disabled:opacity-50"
                            >
                              <span className="text-ink-4">#</span>
                              {c.name}
                            </button>
                          ))}
                        {channels.filter((c) => c.id !== task.channel_id).length === 0 && (
                          <p className="px-3 py-2 text-xs text-ink-4">No other channels</p>
                        )}
                      </div>

                      <div className="my-1 border-t border-line" />

                      <button
                        onClick={deleteTask}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                      >
                        <Trash2 size={14} /> Delete task
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            <button
              onClick={() => setShowMedia(true)}
              title="Shared media"
              aria-label="Shared media"
              className="touch-manipulation rounded-lg p-2 text-signal-ink transition-colors hover:bg-signal-tint"
            >
              <ImageIcon size={19} />
            </button>
            {!embedded && !fullPage && (
              <button
                onClick={onClose}
                aria-label="Close"
                className="touch-manipulation rounded-lg p-2 text-ink-3 transition-colors hover:bg-chip hover:text-ink"
              >
                <X size={21} />
              </button>
            )}
          </div>
        </div>

        {/* Chat messages — flex-col-reverse anchors to the bottom with no scroll jump.
            Messages render newest-first in the DOM; the reverse makes them appear
            oldest-top, newest-bottom, and the browser opens already scrolled to the
            latest message. */}
        <div className="relative z-10 flex flex-1 flex-col-reverse overflow-y-auto overflow-x-hidden">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col-reverse space-y-2.5 space-y-reverse px-3.5 py-4 sm:px-6">
          {loading ? (
            <div className="w-full space-y-3 py-4 animate-pulse">
              <div className="flex justify-start">
                <div className="h-10 w-44 rounded-2xl bg-line/60" />
              </div>
              <div className="flex justify-end">
                <div className="h-14 w-56 rounded-2xl bg-line/80" />
              </div>
              <div className="flex justify-start">
                <div className="h-11 w-40 rounded-2xl bg-line/60" />
              </div>
            </div>
          ) : messages.length === 0 ? (
            <p className="text-center text-sm text-ink-3">No messages yet. Say hello.</p>
          ) : (
            [...messages].reverse().map((msg, i, arr) => {
              const isNew = initialIdsRef.current !== null && !initialIdsRef.current.has(msg.id);
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
                    isNew={isNew}
                    senderLabel={senderLabel}
                    repliedMsg={repliedMsg as MessageWithReads | null}
                    currentUserId={currentUserId}
                    onReply={() => {
                      setReplyTo(msg);
                      textareaRef.current?.focus();
                    }}
                    renderAttachment={renderAttachment}
                    renderTicks={renderTicks}
                  />

                  {/* Divider renders AFTER the bubble in source; in a reversed column
                      that places it visually ABOVE the day's first message. */}
                  {showDayDivider && (
                    <div className="flex items-center justify-center py-2">
                      <span className="rounded-full border border-line bg-surface/80 px-2.5 py-0.5 text-[11px] font-medium text-ink-3 backdrop-blur-sm">
                        {dayLabel(msg.created_at)}
                      </span>
                    </div>
                  )}
                </Fragment>
              );
            })
          )}
          </div>
        </div>

        {/* Reply preview */}
        {replyTo && (
          <div className="relative z-10 flex items-center justify-between gap-3 border-t border-line bg-ground px-3 py-2">
            <div className="min-w-0 border-l-[3px] border-l-signal pl-2">
              <p className="text-xs font-medium text-signal-ink">
                Replying to{' '}
                {replyTo.sender_id === currentUserId
                  ? 'yourself'
                  : replyTo.sender?.full_name || 'Unknown'}
              </p>
              <p className="truncate text-xs text-ink-3">{formatReplyPreview(replyTo)}</p>
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
          className="relative z-10 mx-auto flex w-full max-w-3xl items-center gap-2 bg-transparent px-4 py-3"
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
            className="touch-manipulation flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-chip disabled:opacity-50 sm:h-9 sm:w-9"
          >
            <Paperclip size={20} />
          </button>
          <textarea ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
            }}
            placeholder={uploadingFile ? 'Uploading…' : 'Type a message'}
            disabled={uploadingFile}
            rows={1}
            className="max-h-32 flex-1 resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-[15.5px] text-ink shadow-sm outline-none transition-colors placeholder:text-ink-4 focus:border-signal focus:ring-2 focus:ring-signal/25 sm:py-2.5 sm:text-sm"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            aria-label="Send"
            className="touch-manipulation flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-signal text-white shadow-sm transition-colors hover:bg-signal-hover disabled:opacity-40 sm:h-9 sm:w-9"
          >
            <Send size={17} />
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
  isNew,
  senderLabel,
  repliedMsg,
  currentUserId,
  onReply,
  renderAttachment,
  renderTicks,
}: {
  msg: MessageWithReads;
  isMine: boolean;
  isNew: boolean;
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
      className={`group relative flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'
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
          style={{
            transform: `translateX(${offset}px)`,
            transition: offset === 0 ? 'transform 0.18s ease-out' : 'none',
          }}
        >
          <Avatar
            url={msg.sender?.avatar_url}
            name={senderLabel}
            size={28}
          />
        </div>
      )}

      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: offset === 0 ? 'transform 0.18s ease-out' : 'none',
        }}
        className={`max-w-[min(82%,540px)] rounded-[10px] border px-3 py-2 ${isNew ? 'animate-bubble-in' : ''} ${isMine ? 'border-bubble-line bg-bubble' : 'border-line bg-surface'
          }`}
      >
        {!isMine && (
          <p className="rule-label mb-0.5 text-signal-ink">{senderLabel}</p>
        )}

        {repliedMsg && (
          <div
            className={`mb-1.5 rounded-md border-l-[3px] border-l-signal px-2 py-1 ${
              isMine ? 'bg-white/75' : 'bg-ink/5'
            }`}
          >
            <p className="text-[11px] font-medium text-signal-ink">
              {repliedMsg.sender_id === currentUserId
                ? 'You'
                : repliedMsg.sender?.full_name || 'Unknown'}
            </p>
            <p className="truncate text-[11px] text-ink-2">
              {formatReplyPreview(repliedMsg)}
            </p>
          </div>
        )}

        {renderAttachment(msg, isMine)}

        {!msg.attachment_url && (
          <p className="whitespace-pre-wrap break-words text-sm text-ink">
            {linkify(msg.content ?? '')}
          </p>
        )}

        <div className="mt-1 flex items-center justify-end gap-1.5">
          <button
            onClick={onReply}
            className="mr-auto text-[10px] text-ink-4 opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink-2"
          >
            <CornerUpLeft size={11} className="inline" /> reply
          </button>
          <span className="text-[10px] text-ink-4">
            {formatTime(msg.created_at)}
          </span>
          {isMine && renderTicks(msg)}
        </div>
      </div>
    </div >
  );
}