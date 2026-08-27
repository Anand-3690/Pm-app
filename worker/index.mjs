import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const SUPABASE_URL = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function sendToUsers(userIds, payload) {
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) return;

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', uniqueIds);
    console.log('sendToUsers: users', uniqueIds.length, 'subs found', subs?.length ?? 0);
    
  for (const sub of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      } else {
        console.error('Push send failed:', err.statusCode, err.message);
      }
    }
  }
}

// New chat message → notify other task participants
supabase
  .channel('worker-messages')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
    const msg = payload.new;

    const { data: task } = await supabase
      .from('tasks')
      .select('id, title, project_id')
      .eq('id', msg.task_id)
      .single();
    if (!task) return;

    const { data: sender } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', msg.sender_id)
      .single();

    const { data: participants } = await supabase
      .from('task_participants')
      .select('user_id')
      .eq('task_id', msg.task_id);

    const recipientIds = (participants || [])
      .map((p) => p.user_id)
      .filter((id) => id !== msg.sender_id);
      // console.log('MSG task', msg.task_id, 'parts', participants?.length, 'recips', recipientIds.length);

    const senderName = sender?.full_name || sender?.email || 'Someone';
    const body = msg.attachment_url ? `${senderName} sent an attachment` : `${senderName}: ${msg.content}`;

    await sendToUsers(recipientIds, {
      title: task.title,
      body: body.slice(0, 150),
      url: `${APP_URL}/dashboard/chats/${task.id}`,
    });
  })
  .subscribe((status) => console.log('worker-messages status:', status));

// New task with an assignee → notify them
supabase
  .channel('worker-tasks-insert')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, async (payload) => {
    const task = payload.new;
    if (!task.assignee_id || task.assignee_id === task.created_by) return;

    await sendToUsers([task.assignee_id], {
      title: 'New task assigned to you',
      body: task.title,
      url: `${APP_URL}/dashboard/chats/${task.id}`,
    });
  })
  .subscribe();

// Task reassigned → notify the newly assigned person
supabase
  .channel('worker-tasks-update')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, async (payload) => {
    const task = payload.new;
    const old = payload.old;
    if (!task.assignee_id || task.assignee_id === old.assignee_id) return;

    await sendToUsers([task.assignee_id], {
      title: 'You were assigned a task',
      body: task.title,
      url: `${APP_URL}/dashboard/chats/${task.id}`,
    });
  })
  .subscribe();

// Added to a project → notify the new member
supabase
  .channel('worker-project-members')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'project_members' }, async (payload) => {
    const member = payload.new;

    const { data: project } = await supabase
      .from('projects')
      .select('title')
      .eq('id', member.project_id)
      .single();
    if (!project) return;

    await sendToUsers([member.user_id], {
      title: 'Added to a project',
      body: project.title,
      url: `${APP_URL}/dashboard/projects/${member.project_id}`,
    });
  })
  .subscribe();

// ─────────────────────────────────────────────────────────────
// New announcement → notify all OTHER members of the project.
// Same fan-out pattern as the other listeners: reuse sendToUsers().
// Paste this block into worker/index.mjs, just before the final
// console.log('Push worker connected and listening.').
// ─────────────────────────────────────────────────────────────
supabase
  .channel('worker-announcements')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, async (payload) => {
    const ann = payload.new;

    const { data: project } = await supabase
      .from('projects')
      .select('title')
      .eq('id', ann.project_id)
      .single();
    if (!project) return;

    const { data: author } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', ann.author_id)
      .single();

    // Every member of the project except the author.
    const { data: members } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', ann.project_id);

    const recipientIds = (members || [])
      .map((m) => m.user_id)
      .filter((id) => id !== ann.author_id);

    const authorName = author?.full_name || author?.email || 'An admin';
    const body = ann.body
      ? `${authorName}: ${ann.body}`
      : `${authorName} posted an attachment`;

    await sendToUsers(recipientIds, {
      title: `📢 ${project.title}`,
      body: body.slice(0, 150),
      url: `${APP_URL}/dashboard/projects/${ann.project_id}`,
    });
  })
  .subscribe();

console.log('Push worker connected and listening.');