import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ProfileForm from '@/components/profile-form';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url')
    .eq('id', user.id)
    .single();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-ink-3 transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} /> Back to projects
      </Link>

      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Edit profile</h1>
        <p className="mt-0.5 text-sm text-ink-3">Update your name and photo</p>
      </div>

      <ProfileForm profile={profile as any} />
    </div>
  );
}