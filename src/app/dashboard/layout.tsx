import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SignOutButton from '@/components/sign-out-button';
import Link from 'next/link';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single();

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-100 via-sky-50 to-orange-100">
      <header className="border-b bg-white/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text font-bold text-transparent">
            SEVAK
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/dashboard/profile" className="text-slate-600 hover:text-slate-900 hover:underline">
              {profile?.full_name || profile?.email}
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
