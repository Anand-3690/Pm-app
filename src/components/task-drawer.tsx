'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  X, Send, Paperclip, CornerUpLeft, Check, CheckCheck, FileText, Image as ImageIcon,
} from 'lucide-react';
import { avatarColor } from '@/lib/avatar-color';
import TaskMediaPanel from './task-media-panel';
import type { Task, Message } from '@/lib/types';

type Member = {
  id: string;
  role: string;
  user_id: string;
  profiles: { id: string; full_name: string | null; email: string | null };
};

type MessageWithReads = Message & { reads?: { user_id: string }[] };

export default function TaskDrawer({
  task,
  members,
  currentUserId,
  onClose,
  onStatusChange,
}: {
  task: Task;
  members: Member[];
  currentUserId: string;
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
  const bottomRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

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

    const { data: urlData } = supabase.storage.from('task-attachments').getPublicUrl(filePath);
    const isImage = file.type.startsWith('image/');

    await supabase.from('messages').insert({
      task_id: task.id,
      sender_id: currentUserId,
      content: file.name,
      attachment_url: urlData.publicUrl,
      attachment_type: isImage ? 'image' : 'file',
      reply_to_id: replyTo?.id || null,
    });

    setReplyTo(null);
    setUploadingFile(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const renderTicks = (msg: MessageWithReads) => {
    const readCount = (msg.reads || []).length;
    if (recipientCount <= 0) return <Check size={13} className="text-slate-400" />;
    if (readCount >= recipientCount) return <CheckCheck size={13} className="text-blue-500" />;
    if (readCount > 0) return <CheckCheck size={13} className="text-slate-400" />;
    return <Check size={13} className="text-slate-400" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-xl sm:max-w-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b bg-gradient-to-r from-indigo-50 to-white px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-slate-900">{task.title}</h2>
            {task.description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{task.description}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={task.status}
                onChange={(e) => onStatusChange(e.target.value as Task['status'])}
                className="rounded border px-2 py-1 text-xs text-slate-600"
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
              {task.due_date && (
                <span className="text-xs text-slate-400">
                  Due {new Date(task.due_date).toLocaleDateString()}
                </span>
              )}
              {task.assignee && (
                <span className="text-xs text-slate-400">
                  → {task.assignee.full_name || task.assignee.email}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => setShowMedia(true)}
              title="Shared media"
              className="rounded p-1.5 text-indigo-500 hover:bg-indigo-100"
            >
              <ImageIcon size={18} />
            </button>
            <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100">
              <X size={20} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* Chat messages */}
        <div className="flex-1 space-y-3 overflow-y-auto bg-[#efeae2] px-3 py-4">
          {loading ? (
            <p className="text-center text-sm text-slate-400">Loading messages...</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-sm text-slate-400">No messages yet. Say hello 👋</p>
          ) : (
            messages.map((msg) => {
              const isMine = msg.sender_id === currentUserId;
              const sender = msg.sender || profileById(msg.sender_id);
              const repliedMsg = msg.reply_to_id
                ? messages.find((m) => m.id === msg.reply_to_id)
                : null;
              const senderLabel = sender?.full_name || sender?.email || 'Unknown';

              return (
                <div key={msg.id} className={`flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                  {!isMine && (
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${avatarColor(senderLabel)}`}
                    >
                      {senderLabel[0].toUpperCase()}
                    </div>
                  )}
                  <div
                    className={`max-w-[72%] rounded-lg px-3 py-2 shadow-sm ${
                      isMine ? 'bg-[#d9fdd3]' : 'bg-white'
                    }`}
                  >
                    {!isMine && (
                      <p className="mb-0.5 text-xs font-semibold text-emerald-600">{senderLabel}</p>
                    )}

                    {repliedMsg && (
                      <div className="mb-1.5 rounded border-l-2 border-emerald-500 bg-black/5 px-2 py-1">
                        <p className="text-[11px] font-medium text-emerald-700">
                          {repliedMsg.sender_id === currentUserId
                            ? 'You'
                            : repliedMsg.sender?.full_name || 'Unknown'}
                        </p>
                        <p className="truncate text-[11px] text-slate-600">
                          {repliedMsg.content || 'Attachment'}
                        </p>
                      </div>
                    )}

                    {msg.attachment_url && msg.attachment_type === 'image' && (
                      <a href={msg.attachment_url} target="_blank" rel="noreferrer">
                        <img
                          src={msg.attachment_url}
                          alt={msg.content || 'attachment'}
                          className="mb-1 max-h-64 rounded-md object-cover"
                        />
                      </a>
                    )}
                    {msg.attachment_url && msg.attachment_type === 'file' && (
                      <a
                        href={msg.attachment_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mb-1 flex items-center gap-2 rounded bg-black/5 px-2 py-1.5 text-xs text-slate-700 hover:bg-black/10"
                      >
                        <FileText size={14} /> {msg.content}
                      </a>
                    )}
                    {!msg.attachment_url && (
                      <p className="whitespace-pre-wrap break-words text-sm text-slate-800">
                        {msg.content}
                      </p>
                    )}

                    <div className="mt-1 flex items-center justify-end gap-1">
                      <button
                        onClick={() => setReplyTo(msg)}
                        className="mr-auto text-[10px] text-slate-400 hover:text-slate-700"
                      >
                        <CornerUpLeft size={11} className="inline" /> reply
                      </button>
                      <span className="text-[10px] text-slate-400">{formatTime(msg.created_at)}</span>
                      {isMine && renderTicks(msg)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Reply preview */}
        {replyTo && (
          <div className="flex items-center justify-between border-t bg-slate-50 px-3 py-2">
            <div className="min-w-0 border-l-2 border-emerald-500 pl-2">
              <p className="text-xs font-medium text-emerald-700">
                Replying to {replyTo.sender_id === currentUserId ? 'yourself' : replyTo.sender?.full_name || 'Unknown'}
              </p>
              <p className="truncate text-xs text-slate-500">{replyTo.content || 'Attachment'}</p>
            </div>
            <button onClick={() => setReplyTo(null)}>
              <X size={14} className="text-slate-400" />
            </button>
          </div>
        )}

        {/* Composer */}
        <form onSubmit={handleSend} className="flex items-center gap-2 border-t bg-white px-3 py-2.5">
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
            className="shrink-0 rounded-full p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            <Paperclip size={20} />
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={uploadingFile ? 'Uploading...' : 'Type a message'}
            disabled={uploadingFile}
            className="flex-1 rounded-full border bg-slate-50 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="shrink-0 rounded-full bg-emerald-500 p-2.5 text-white hover:bg-emerald-600 disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </form>

        {showMedia && <TaskMediaPanel messages={messages} onClose={() => setShowMedia(false)} />}
      </div>
    </div>
  );
}
