--
-- SEVAK Production Database Schema Baseline
-- Dumped from Postgres 17 (Supabase)
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: block_delete_nonempty_channel(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.block_delete_nonempty_channel() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  -- If the parent project no longer exists, this delete is part of a project
  -- cascade — allow it through so the whole project can be torn down.
  if not exists (select 1 from public.projects where id = old.project_id) then
    return old;
  end if;

  -- Otherwise it's a direct channel delete in a live project: block if non-empty.
  if exists (select 1 from public.tasks where channel_id = old.id) then
    raise exception 'Cannot delete a channel that still has tasks. Move or delete its tasks first.';
  end if;

  return old;
end;
$$;


--
-- Name: can_access_task(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_access_task(t_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = t_id
      AND ( t.created_by = auth.uid()
         OR t.assignee_id = auth.uid()
         OR is_project_admin(t.project_id)
         OR EXISTS (SELECT 1 FROM task_participants tp
                    WHERE tp.task_id = t.id AND tp.user_id = auth.uid()) )
  );
$$;


--
-- Name: chat_list_for_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.chat_list_for_user() RETURNS TABLE(task_id uuid, task_title text, channel_id uuid, channel_name text, project_id uuid, project_title text, last_message text, last_at timestamp with time zone, last_sender_id uuid, last_has_attachment boolean, unread_count bigint, is_pinned boolean, is_channel_chat boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  with my_tasks as (
    select t.id, t.title, t.channel_id, t.project_id, t.is_channel_chat
    from public.tasks t
    where public.is_task_participant(t.id)
  ),
  last_msg as (
    select distinct on (m.task_id)
      m.task_id, m.content, m.created_at, m.sender_id, m.attachment_url
    from public.messages m
    where m.task_id in (select id from my_tasks)
    order by m.task_id, m.created_at desc
  ),
  unread as (
    select m.task_id, count(*)::bigint as cnt
    from public.messages m
    where m.task_id in (select id from my_tasks)
      and m.sender_id != auth.uid()
      and not exists (
        select 1 from public.message_reads mr
        where mr.message_id = m.id and mr.user_id = auth.uid()
      )
    group by m.task_id
  )
  select
    mt.id,
    case when mt.is_channel_chat then coalesce(c.name, mt.title) else mt.title end,
    mt.channel_id,
    c.name,
    mt.project_id,
    p.title,
    lm.content, lm.created_at, lm.sender_id,
    (lm.attachment_url is not null),
    coalesce(u.cnt, 0),
    exists (
      select 1 from public.task_pins tp
      where tp.task_id = mt.id and tp.user_id = auth.uid()
    ),
    mt.is_channel_chat
  from my_tasks mt
  left join public.channels c on c.id = mt.channel_id
  left join public.projects p on p.id = mt.project_id
  left join last_msg lm on lm.task_id = mt.id
  left join unread   u  on u.task_id  = mt.id
  order by (lm.created_at is null), lm.created_at desc nulls last;
$$;


--
-- Name: current_user_is_primary_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_is_primary_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select coalesce(
    (select is_primary_admin from public.profiles where id = auth.uid()),
    false
  );
$$;


--
-- Name: current_user_is_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_is_super_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select coalesce(
    (select is_super_admin from public.profiles where id = auth.uid()),
    false
  );
$$;


--
-- Name: enable_channel_chat(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enable_channel_chat(p_channel_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_project_id uuid;
  v_channel_name text;
  v_task_id uuid;
begin
  select project_id, name into v_project_id, v_channel_name
  from public.channels where id = p_channel_id;

  if v_project_id is null then
    raise exception 'Channel not found';
  end if;

  -- Caller must be an admin of the project (or super admin).
  if not exists (
    select 1 from public.project_members
    where project_id = v_project_id and user_id = auth.uid() and role = 'admin'
  ) and not public.current_user_is_super_admin() then
    raise exception 'Only a project admin can enable channel chat';
  end if;

  -- Already enabled? return the existing one.
  select id into v_task_id
  from public.tasks
  where channel_id = p_channel_id and is_channel_chat
  limit 1;
  if v_task_id is not null then
    return v_task_id;
  end if;

  -- Create the hidden channel-chat task.
  insert into public.tasks (project_id, channel_id, title, created_by, is_channel_chat)
  values (v_project_id, p_channel_id, v_channel_name, auth.uid(), true)
  returning id into v_task_id;

  -- Seed every current project member as a participant.
  insert into public.task_participants (task_id, user_id)
  select v_task_id, pm.user_id
  from public.project_members pm
  where pm.project_id = v_project_id
  on conflict do nothing;

  return v_task_id;
end;
$$;


--
-- Name: enforce_task_channel_project(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_task_channel_project() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  ch_project uuid;
begin
  if new.channel_id is not null then
    select project_id into ch_project from public.channels where id = new.channel_id;
    if ch_project is null then
      raise exception 'channel_id % does not exist', new.channel_id;
    end if;
    if ch_project <> new.project_id then
      raise exception 'Task channel must belong to the same project as the task';
    end if;
  end if;
  return new;
end;
$$;


--
-- Name: guard_privileged_profile_columns(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_privileged_profile_columns() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if (new.is_super_admin is distinct from old.is_super_admin
      or new.is_primary_admin is distinct from old.is_primary_admin
      or new.must_change_password is distinct from old.must_change_password)
     and not public.current_user_is_primary_admin() then
    raise exception 'Only the primary admin can change privileged columns';
  end if;

  return new;
end;
$$;


--
-- Name: handle_new_task(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_task() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into public.task_participants (task_id, user_id)
  values (new.id, new.created_by)
  on conflict do nothing;

  if new.assignee_id is not null then
    insert into public.task_participants (task_id, user_id)
    values (new.id, new.assignee_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, full_name, email, must_change_password)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    coalesce((new.raw_user_meta_data->>'must_change_password')::boolean, false)
  );
  return new;
end;
$$;


--
-- Name: handle_task_assignee_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_task_assignee_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  if new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id then
    insert into public.task_participants (task_id, user_id)
    values (new.id, new.assignee_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;


--
-- Name: is_project_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_project_admin(pid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select exists (
    select 1 from public.project_members
    where project_id = pid and user_id = auth.uid() and role = 'admin'
  );
$$;


--
-- Name: is_project_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_project_member(pid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select exists (
    select 1 from public.project_members
    where project_id = pid and user_id = auth.uid()
  );
$$;


--
-- Name: is_task_participant(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_task_participant(tid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select exists (
    select 1 from public.task_participants
    where task_id = tid and user_id = auth.uid()
  )
  or exists (
    select 1 from public.tasks t
    where t.id = tid and public.is_project_admin(t.project_id)
  )
  or exists (
    select 1 from public.tasks t
    where t.id = tid and t.created_by = auth.uid()
  );
$$;


--
-- Name: sync_new_member_to_channel_chats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_new_member_to_channel_chats() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  insert into public.task_participants (task_id, user_id)
  select t.id, new.user_id
  from public.tasks t
  where t.project_id = new.project_id and t.is_channel_chat
  on conflict do nothing;
  return new;
end;
$$;


--
-- Name: touch_announcement_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_announcement_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: touch_channel_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_channel_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: unread_counts_by_project(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unread_counts_by_project() RETURNS TABLE(project_id uuid, unread_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select t.project_id, count(*)::bigint
  from public.messages m
  join public.tasks t on t.id = m.task_id
  where public.is_task_participant(t.id)
    and m.sender_id != auth.uid()
    and not exists (
      select 1 from public.message_reads mr
      where mr.message_id = m.id and mr.user_id = auth.uid()
    )
  group by t.project_id;
$$;


--
-- Name: unread_counts_by_task(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unread_counts_by_task(project_id_param uuid) RETURNS TABLE(task_id uuid, unread_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select m.task_id, count(*)::bigint
  from public.messages m
  join public.tasks t on t.id = m.task_id
  where t.project_id = project_id_param
    and public.is_task_participant(t.id)
    and m.sender_id != auth.uid()
    and not exists (
      select 1 from public.message_reads mr
      where mr.message_id = m.id and mr.user_id = auth.uid()
    )
  group by m.task_id;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    author_id uuid NOT NULL,
    body text,
    attachment_url text,
    attachment_type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: message_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_reads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.message_reads REPLICA IDENTITY FULL;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    content text,
    attachment_url text,
    attachment_type text,
    reply_to_id uuid,
    status text DEFAULT 'sent'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT messages_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'delivered'::text, 'read'::text])))
);

ALTER TABLE ONLY public.messages REPLICA IDENTITY FULL;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    email text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now(),
    is_super_admin boolean DEFAULT false NOT NULL,
    must_change_password boolean DEFAULT false NOT NULL,
    is_primary_admin boolean DEFAULT false NOT NULL
);


--
-- Name: project_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT now(),
    CONSTRAINT project_members_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text])))
);


--
-- Name: project_pins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_pins (
    user_id uuid NOT NULL,
    project_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'active'::text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT projects_status_check CHECK ((status = ANY (ARRAY['active'::text, 'on_hold'::text, 'completed'::text, 'archived'::text])))
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: task_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.task_participants REPLICA IDENTITY FULL;


--
-- Name: task_pins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_pins (
    user_id uuid NOT NULL,
    task_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'todo'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    assignee_id uuid,
    due_date date,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    channel_id uuid,
    is_channel_chat boolean DEFAULT false NOT NULL,
    CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'done'::text])))
);

ALTER TABLE ONLY public.tasks REPLICA IDENTITY FULL;


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: channels channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_pkey PRIMARY KEY (id);


--
-- Name: message_reads message_reads_message_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reads
    ADD CONSTRAINT message_reads_message_id_user_id_key UNIQUE (message_id, user_id);


--
-- Name: message_reads message_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reads
    ADD CONSTRAINT message_reads_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: project_members project_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_pkey PRIMARY KEY (id);


--
-- Name: project_members project_members_project_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_project_id_user_id_key UNIQUE (project_id, user_id);


--
-- Name: project_pins project_pins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_pins
    ADD CONSTRAINT project_pins_pkey PRIMARY KEY (user_id, project_id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: task_participants task_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_participants
    ADD CONSTRAINT task_participants_pkey PRIMARY KEY (id);


--
-- Name: task_participants task_participants_task_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_participants
    ADD CONSTRAINT task_participants_task_id_user_id_key UNIQUE (task_id, user_id);


--
-- Name: task_pins task_pins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_pins
    ADD CONSTRAINT task_pins_pkey PRIMARY KEY (user_id, task_id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: announcements_project_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX announcements_project_created_idx ON public.announcements USING btree (project_id, created_at DESC);


--
-- Name: channels_project_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX channels_project_position_idx ON public.channels USING btree (project_id, "position");


--
-- Name: tasks_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_channel_idx ON public.tasks USING btree (channel_id);


--
-- Name: tasks_one_channel_chat; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tasks_one_channel_chat ON public.tasks USING btree (channel_id) WHERE is_channel_chat;


--
-- Name: channels block_delete_nonempty_channel; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER block_delete_nonempty_channel BEFORE DELETE ON public.channels FOR EACH ROW EXECUTE FUNCTION public.block_delete_nonempty_channel();


--
-- Name: tasks enforce_task_channel_project; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_task_channel_project BEFORE INSERT OR UPDATE OF channel_id, project_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.enforce_task_channel_project();


--
-- Name: profiles guard_privileged_profile_columns; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_privileged_profile_columns BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_privileged_profile_columns();


--
-- Name: tasks on_task_assignee_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_task_assignee_updated AFTER UPDATE OF assignee_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.handle_task_assignee_change();


--
-- Name: tasks on_task_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_task_created AFTER INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.handle_new_task();


--
-- Name: announcements touch_announcement_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_announcement_updated_at BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.touch_announcement_updated_at();


--
-- Name: channels touch_channel_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_channel_updated_at BEFORE UPDATE ON public.channels FOR EACH ROW EXECUTE FUNCTION public.touch_channel_updated_at();


--
-- Name: project_members trg_sync_member_channel_chats; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_member_channel_chats AFTER INSERT ON public.project_members FOR EACH ROW EXECUTE FUNCTION public.sync_new_member_to_channel_chats();


--
-- Name: announcements announcements_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: announcements announcements_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: channels channels_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: channels channels_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: message_reads message_reads_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reads
    ADD CONSTRAINT message_reads_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- Name: message_reads message_reads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reads
    ADD CONSTRAINT message_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: messages messages_reply_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.messages(id);


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);


--
-- Name: messages messages_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_members project_members_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_members project_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: project_pins project_pins_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_pins
    ADD CONSTRAINT project_pins_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_pins project_pins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_pins
    ADD CONSTRAINT project_pins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: projects projects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: task_participants task_participants_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_participants
    ADD CONSTRAINT task_participants_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_participants task_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_participants
    ADD CONSTRAINT task_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: task_pins task_pins_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_pins
    ADD CONSTRAINT task_pins_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_pins task_pins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_pins
    ADD CONSTRAINT task_pins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.profiles(id);


--
-- Name: tasks tasks_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: tasks tasks_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: profiles Allow authenticated users to read profiles for searching; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to read profiles for searching" ON public.profiles FOR SELECT TO authenticated USING (true);


--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: announcements announcements_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY announcements_delete_admin ON public.announcements FOR DELETE USING ((public.is_project_admin(project_id) OR public.current_user_is_super_admin()));


--
-- Name: announcements announcements_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY announcements_insert_admin ON public.announcements FOR INSERT WITH CHECK (((author_id = auth.uid()) AND (public.is_project_admin(project_id) OR public.current_user_is_super_admin())));


--
-- Name: announcements announcements_select_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY announcements_select_member ON public.announcements FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: announcements announcements_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY announcements_update_admin ON public.announcements FOR UPDATE USING ((public.is_project_admin(project_id) OR public.current_user_is_super_admin())) WITH CHECK ((public.is_project_admin(project_id) OR public.current_user_is_super_admin()));


--
-- Name: channels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

--
-- Name: channels channels_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY channels_delete_admin ON public.channels FOR DELETE USING (public.is_project_admin(project_id));


--
-- Name: channels channels_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY channels_insert_admin ON public.channels FOR INSERT WITH CHECK (public.is_project_admin(project_id));


--
-- Name: channels channels_insert_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY channels_insert_member ON public.channels FOR INSERT WITH CHECK (public.is_project_member(project_id));


--
-- Name: channels channels_select_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY channels_select_member ON public.channels FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: channels channels_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY channels_update_admin ON public.channels FOR UPDATE USING (public.is_project_admin(project_id)) WITH CHECK (public.is_project_admin(project_id));


--
-- Name: project_members members_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY members_delete_admin ON public.project_members FOR DELETE USING (public.is_project_admin(project_id));


--
-- Name: project_members members_insert_admin_or_self_creator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY members_insert_admin_or_self_creator ON public.project_members FOR INSERT WITH CHECK ((public.is_project_admin(project_id) OR (user_id = auth.uid())));


--
-- Name: project_members members_select_if_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY members_select_if_member ON public.project_members FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: project_members members_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY members_update_admin ON public.project_members FOR UPDATE USING (public.is_project_admin(project_id));


--
-- Name: message_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

--
-- Name: message_reads message_reads_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY message_reads_insert_own ON public.message_reads FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: message_reads message_reads_select_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY message_reads_select_member ON public.message_reads FOR SELECT USING (public.is_project_member(( SELECT t.project_id
   FROM (public.tasks t
     JOIN public.messages m ON ((m.task_id = t.id)))
  WHERE (m.id = message_reads.message_id))));


--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: messages messages_insert_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_insert_participant ON public.messages FOR INSERT WITH CHECK (((sender_id = auth.uid()) AND public.is_task_participant(task_id)));


--
-- Name: messages messages_select_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_select_participant ON public.messages FOR SELECT USING (public.is_task_participant(task_id));


--
-- Name: messages messages_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_update_own ON public.messages FOR UPDATE USING ((sender_id = auth.uid()));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_all ON public.profiles FOR SELECT USING (true);


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING ((id = auth.uid()));


--
-- Name: profiles profiles_update_super_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_super_admin ON public.profiles FOR UPDATE USING (public.current_user_is_primary_admin()) WITH CHECK (public.current_user_is_primary_admin());


--
-- Name: project_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

--
-- Name: project_pins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_pins ENABLE ROW LEVEL SECURITY;

--
-- Name: project_pins project_pins_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_pins_delete_own ON public.project_pins FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: project_pins project_pins_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_pins_insert_own ON public.project_pins FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: project_pins project_pins_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_pins_select_own ON public.project_pins FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: projects projects_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_delete_admin ON public.projects FOR DELETE USING (public.is_project_admin(id));


--
-- Name: projects projects_insert_super_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_insert_super_admin ON public.projects FOR INSERT WITH CHECK (((created_by = auth.uid()) AND public.current_user_is_super_admin()));


--
-- Name: projects projects_select_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_select_member ON public.projects FOR SELECT USING ((public.is_project_member(id) OR (created_by = auth.uid())));


--
-- Name: projects projects_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_update_admin ON public.projects FOR UPDATE USING (public.is_project_admin(id));


--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions push_subscriptions_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: push_subscriptions push_subscriptions_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_subscriptions_insert_own ON public.push_subscriptions FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: push_subscriptions push_subscriptions_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_subscriptions_select_own ON public.push_subscriptions FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: task_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: task_participants task_participants_delete_admin_or_creator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_participants_delete_admin_or_creator ON public.task_participants FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_participants.task_id) AND (public.is_project_admin(t.project_id) OR (t.created_by = auth.uid()))))));


--
-- Name: task_participants task_participants_insert_admin_or_creator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_participants_insert_admin_or_creator ON public.task_participants FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_participants.task_id) AND (public.is_project_admin(t.project_id) OR (t.created_by = auth.uid()))))));


--
-- Name: task_participants task_participants_select_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_participants_select_member ON public.task_participants FOR SELECT USING (public.is_project_member(( SELECT tasks.project_id
   FROM public.tasks
  WHERE (tasks.id = task_participants.task_id))));


--
-- Name: task_pins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_pins ENABLE ROW LEVEL SECURITY;

--
-- Name: task_pins task_pins_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_pins_delete_own ON public.task_pins FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: task_pins task_pins_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_pins_insert_own ON public.task_pins FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: task_pins task_pins_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_pins_select_own ON public.task_pins FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks tasks_delete_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_delete_own_or_admin ON public.tasks FOR DELETE USING (((created_by = auth.uid()) OR public.is_project_admin(project_id)));


--
-- Name: tasks tasks_insert_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_insert_member ON public.tasks FOR INSERT WITH CHECK (public.is_project_member(project_id));


--
-- Name: tasks tasks_select_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_select_participant ON public.tasks FOR SELECT USING ((public.is_task_participant(id) OR (created_by = auth.uid())));


--
-- Name: tasks tasks_update_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_update_member ON public.tasks FOR UPDATE USING (public.is_project_member(project_id));


--
-- PostgreSQL database dump complete
--

