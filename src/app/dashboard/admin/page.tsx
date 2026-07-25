import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AdminPanel from '../../../components/admin-panel';

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_super_admin) redirect('/dashboard');

  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_super_admin, created_at')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Admin</h1>
        <p className="mt-0.5 text-sm text-ink-3">Create accounts and manage super admins</p>
      </div>
      <AdminPanel currentUserId={user.id} initialUsers={(allProfiles as any) || []} />
    </div>
  );
}