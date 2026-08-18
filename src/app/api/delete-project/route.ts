import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Deletes a project AND its storage files.
 *
 * DB rows cascade via foreign keys, but storage objects don't — so we remove
 * them here before deleting the row. Order: gather file paths → delete files
 * (best-effort) → delete the project row (authoritative). If file cleanup
 * partially fails, the project still deletes; we just log the leftover.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await request.json();
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  // Authorize: only a project admin may delete (matches projects_delete_admin RLS).
  const { data: membership } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .single();
  if (membership?.role !== 'admin') {
    return NextResponse.json({ error: 'Only a project admin can delete' }, { status: 403 });
  }

  const admin = createAdminClient();

  // ── Gather storage paths BEFORE deleting the row (cascade will remove tasks) ──
  // Task attachments live under {task_id}/..., announcement attachments under {project_id}/...
  const { data: tasks } = await admin
    .from('tasks')
    .select('id')
    .eq('project_id', projectId);
  const taskIds = (tasks || []).map((t) => t.id);

  // Helper: list every object under a folder prefix and delete them.
  const purgeFolder = async (bucket: string, prefix: string) => {
    const { data: files, error } = await admin.storage.from(bucket).list(prefix, {
      limit: 1000,
    });
    if (error || !files || files.length === 0) return;
    const paths = files.map((f) => `${prefix}/${f.name}`);
    await admin.storage.from(bucket).remove(paths);
  };

  // Best-effort file cleanup — never blocks the actual project deletion.
  try {
    for (const taskId of taskIds) {
      await purgeFolder('task-attachments', taskId);
    }
    await purgeFolder('announcement-attachments', projectId);
  } catch (e) {
    console.error('Storage cleanup partial failure for project', projectId, e);
    // continue — we still delete the project row below
  }

  // ── Delete the project row (cascade removes channels/tasks/messages/etc.) ──
  const { error: delErr } = await admin.from('projects').delete().eq('id', projectId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
