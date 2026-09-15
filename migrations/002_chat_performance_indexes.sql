-- Performance indexes for chat message retrieval and project queries
-- Applied to production postgres on 2026-09-15

CREATE INDEX IF NOT EXISTS messages_task_id_created_at_idx ON public.messages (task_id, created_at ASC);
CREATE INDEX IF NOT EXISTS tasks_project_id_idx ON public.tasks (project_id);
CREATE INDEX IF NOT EXISTS message_reads_user_id_idx ON public.message_reads (user_id);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx ON public.messages (sender_id);
