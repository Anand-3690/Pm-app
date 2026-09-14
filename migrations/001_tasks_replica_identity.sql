-- Enable REPLICA IDENTITY FULL on tasks table so UPDATE events in Supabase Realtime
-- include the old row's values (specifically old.assignee_id).
-- This enables worker/index.mjs to detect when a task's assignee actually changed
-- and avoid sending false push notifications on other edits.

ALTER TABLE public.tasks REPLICA IDENTITY FULL;
