'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Plus, X, Calendar, MessageSquare } from 'lucide-react';
import TaskDrawer from './task-drawer';
import TaskParticipants from './task-participants';
import { avatarColor } from '@/lib/avatar-color';
import {
  COLUMN_WELL,
  PRIORITY_LABEL,
  PRIORITY_STAMP,
  STATUS_LABEL,
} from '@/lib/ui-tokens';
import type { Task } from '@/lib/types';

type Member = {
  id: string;
  role: string;
  user_id: string;
  profiles: { id: string; full_name: string | null; email: string | null };
};

const COLUMNS: { key: Task['status'] }[] = [
  { key: 'todo' },
  { key: 'in_progress' },
  { key: 'done' },
];

const fieldClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-signal focus:ring-2 focus:ring-signal/25';

export default function TaskBoard({
  projectId,
  channels,
  channelId,
  initialTasks,
  members,
  currentUserId,
  unreadCounts = {},
  isAdmin = false,
}: {
  projectId: string;
  channels: { id: string; name: string }[];
  channelId: string;
  initialTasks: Task[];
  members: Member[];
  currentUserId: string;
  unreadCounts?: Record<string, number>;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [newOpen, setNewOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        project_id: projectId,
        channel_id: channelId,
        title,
        description,
        priority,
        assignee_id: assigneeId || null,
        due_date: dueDate || null,
        created_by: currentUserId,
      })
      .select('*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email)')
      .single();

    setLoading(false);
    if (!error && data) {
      setTasks((prev) => [data as any, ...prev]);
      setNewOpen(false);
      setTitle('');
      setDescription('');
      setPriority('medium');
      setAssigneeId('');
      setDueDate('');
    }
  };

  const updateStatus = async (taskId: string, status: Task['status']) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    await supabase.from('tasks').update({ status }).eq('id', taskId);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-ink">Tasks</h2>
        <button
          onClick={() => setNewOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-signal px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-signal-hover"
        >
          <Plus size={16} /> New task
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {COLUMNS.map((col) => {
          const columnTasks = tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="rule-label text-ink-2">{STATUS_LABEL[col.key]}</h3>
                <span className="font-display text-sm font-bold text-ink-4">
                  {columnTasks.length}
                </span>
              </div>

              <div className={`space-y-2 rounded-[10px] p-2 ${COLUMN_WELL[col.key]}`}>
                {columnTasks.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-ink-4">Nothing here</p>
                )}

                {columnTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => setActiveTask(task)}
                    className="cursor-pointer rounded-[10px] border border-line bg-surface p-3 transition-colors hover:border-signal"
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <p
                        className={`text-sm font-medium leading-snug ${
                          task.status === 'done' ? 'text-ink-3 line-through' : 'text-ink'
                        }`}
                      >
                        {task.title}
                      </p>
                      <span className={`stamp shrink-0 ${PRIORITY_STAMP[task.priority]}`}>
                        {PRIORITY_LABEL[task.priority] ?? task.priority}
                      </span>
                    </div>

                    {task.description && (
                      <p className="mb-2 line-clamp-2 text-xs text-ink-3">
                        {task.description}
                      </p>
                    )}

                    <div onClick={(e) => e.stopPropagation()} className="mb-2">
                      <TaskParticipants
                        taskId={task.id}
                        members={members}
                        canManage={isAdmin || task.created_by === currentUserId}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-ink-3">
                      <div className="flex items-center gap-1">
                        {task.assignee ? (
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-white ${avatarColor(
                              task.assignee.full_name || task.assignee.email || '?'
                            )}`}
                          >
                            {(task.assignee.full_name || task.assignee.email || '?')[0].toUpperCase()}
                          </span>
                        ) : (
                          <span className="text-ink-4">Unassigned</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5">
                        {task.due_date && (
                          <span className="flex items-center gap-1">
                            <Calendar size={11} />
                            {new Date(task.due_date).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        )}
                        <span className="relative flex items-center">
                          <MessageSquare size={12} />
                          {unreadCounts[task.id] > 0 && (
                            <span className="absolute -right-2 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-signal px-0.5 text-[8px] font-medium text-white">
                              {unreadCounts[task.id] > 9 ? '9+' : unreadCounts[task.id]}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    {col.key !== 'done' && (
                      <select
                        value={task.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateStatus(task.id, e.target.value as Task['status'])}
                        className="mt-2.5 w-full rounded-md border border-line bg-ground px-1.5 py-1 text-xs text-ink-2 outline-none focus:border-signal"
                      >
                        <option value="todo">To do</option>
                        <option value="in_progress">In progress</option>
                        <option value="done">Done</option>
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
          <div className="w-full max-w-md rounded-[12px] border border-line bg-surface p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-ink">New task</h2>
              <button
                onClick={() => setNewOpen(false)}
                aria-label="Close"
                className="rounded p-1 text-ink-3 transition-colors hover:bg-chip hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3">
              <input
                required
                placeholder="Ground floor ceiling"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={fieldClass}
              />
              <textarea
                placeholder="What needs doing?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className={fieldClass}
              />
              <div className="flex gap-2">
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className={fieldClass}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className={fieldClass}
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.profiles.full_name || m.profiles.email}
                  </option>
                ))}
              </select>
              <button
                disabled={loading}
                className="w-full rounded-lg bg-signal px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-signal-hover disabled:opacity-50"
              >
                {loading ? 'Creating…' : 'Create task'}
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTask && (
        <TaskDrawer
          task={activeTask}
          members={members}
          channels={channels}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onClose={() => {
            setActiveTask(null);
            router.refresh();
          }}
          onStatusChange={(status) => {
            updateStatus(activeTask.id, status);
            setActiveTask({ ...activeTask, status });
          }}
          onTaskMoved={(taskId) =>                          // ADD
            setTasks((prev) => prev.filter((t) => t.id !== taskId))
          }
          onTaskDeleted={(taskId) =>                        // ADD
            setTasks((prev) => prev.filter((t) => t.id !== taskId))
          }
        />
      )}
    </div>
  );
}
