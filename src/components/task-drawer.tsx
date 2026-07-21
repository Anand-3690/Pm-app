'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Send, Paperclip, CornerUpLeft, Check, CheckCheck, FileText } from 'lucide-react';
import type { Task, Message } from '@/lib/types';

type Member = {
  id: string;
  role: string;
  user_id: string;
  profiles: { id: string; full_name: string | null; email: string | null };
};

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [sending, setSending] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const profileById = (id: string) => members.find((m) => m.user_id === id)?.profiles;

  // ---- Load messages + subscribe to realtime ----
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel>;

    const load = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*, sender:profiles!messages_sender_id_fkey(id, full_name, email, avatar_url)')
        .eq('task_id', task.id)
        .order('created_at', { ascending: true });

      setMessages((data as any) || []);
      setLoading(false);

      // Mark any messages from others as read
      const unread = (data || []).filter(
        (m: any) => m.sender_id !== currentUserId && m.status !== 'read'
      );
      if (unread.length > 0) {
        await supabase
          .from('messages')
          .update({ status: 'read' })
          .in('id', unread.map((m: any) => m.id));
      }
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
            .select('*, sender:profiles!messages_sender_id_fkey(id, full_name, email, avatar_url)')
            .eq('id', payload.new.id)
            .single();

          if (fullMessage) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === fullMessage.id)) return prev;
              return [...prev, fullMessage as any];
            });
            if ((fullMessage as any).sender_id !== currentUserId) {
              supabase.from('messages').update({ status: 'read' }).eq('id', fullMessage.id).then();
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `task_id=eq.${task.id}` },
        (payload) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === payload.new.id ? { ...m, status: payload.new.status } : m))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // ---- Send text message ----
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

  // ---- Send attachment ----
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
