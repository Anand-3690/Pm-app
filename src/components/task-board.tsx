'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Plus, X, Calendar, MessageSquare } from 'lucide-react';
import TaskDrawer from './task-drawer';
import type { Task } from '@/lib/types';

type Member = {
  id: string;
  role: string;
  user_id: string;
  profiles: { id: string; full_name: string | null; email: string | null };
};

const COLUMNS: { key: Task['status']; label: string }[] = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
];

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-700',
  urgent: 'bg-red-100 text-red-700',
};

export default function TaskBoard({
  projectId,
  initialTasks,
  members,
  currentUserId,
}: {
  projectId: string;
  initialTasks: Task[];
  members: Member[];
  currentUserId: string;
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
        <h2 className="font-semibold text-slate-900">Tasks</h2>
        <button
          onClick={() => setNewOpen(true)}
          className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus size={16} /> New Task
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {COLUMNS.map((col) => (
          <div key={col.key} className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-medium text-slate-500">{col.label}</h3>
              <span className="text-xs text-slate-400">
                {tasks.filter((t) => t.status === col.key).length}
              </span>
            </div>
            <div className="space-y-2">
              {tasks
                .filter((t) => t.status === col.key)
                .map((task) => (
                  <div
                    key={task.id}
                    onClick={() => setActiveTask(task)}
                    className="cursor-pointer rounded-lg border bg-white p-3 shadow-sm hover:shadow-md"
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">{task.title}</p>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_COLORS[task.priority]}`}
                      >
                        {task.priority}
                      </span>
                    </div>
                    {task.description && (
                      <p className="mb-2 line-clamp-2 text-xs text-slate-500">
                        {task.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <div className="flex items-center gap-1">
                        {task.assignee ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white">
                            {(task.assignee.full_name || task.assignee.email || '?')[0].toUpperCase()}
                          </span>
                        ) : (
                          <span className="text-slate-300">Unassigned</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {task.due_date && (
                          <span className="flex items-center gap-0.5">
                            <Calendar size={11} />
                            {new Date(task.due_date).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        )}
                        <MessageSquare size={12} />
                      </div>
                    </div>
                    {col.key !== 'done' && (
                      <select
                        value={task.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateStatus(task.id, e.target.value as Task['status'])}
                        className="mt-2 w-full rounded border px-1.5 py-1 text-xs text-slate-600"
                      >
                        <option value="todo">To Do</option>
                        <option value="in_progress">In Progress</option>
                        <option value="done">Done</option>
                      </select>
                    )}
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">New Task</h2>
              <button onClick={() => setNewOpen(false)}>
                <X size={18} className="text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="space-y-3">
              <input
                required
                placeholder="Task title (e.g. GroundFloor Ceiling)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
              />
              <textarea
                placeholder="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
              />
              <div className="flex gap-2">
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-1/2 rounded-md border px-3 py-2 text-sm"
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
                  className="w-1/2 rounded-md border px-3 py-2 text-sm"
                />
              </div>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
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
                className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Task'}
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTask && (
        <TaskDrawer
          task={activeTask}
          members={members}
          currentUserId={currentUserId}
          onClose={() => setActiveTask(null)}
          onStatusChange={(status) => {
            updateStatus(activeTask.id, status);
            setActiveTask({ ...activeTask, status });
          }}
        />
      )}
    </div>
  );
}
