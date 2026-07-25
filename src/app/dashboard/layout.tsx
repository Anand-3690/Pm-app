import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SignOutButton from '@/components/sign-out-button';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, is_super_admin')
    .eq('id', user.id)
    .single();

  return (
    <div className="min-h-screen bg-ground">
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="h-5 w-1.5 rounded-full bg-signal" aria-hidden="true" />
            <span className="font-display text-xl font-bold tracking-wide text-ink">
              SEVAK
            </span>
          </Link>

          <div className="flex items-center gap-3 text-sm">
            {profile?.is_super_admin && (
              <Link
                href="/dashboard/admin"
                className="flex items-center gap-1.5 text-ink-2 transition-colors hover:text-ink"
              >
                <ShieldCheck size={15} /> Admin
              </Link>
            )}
            <Link
              href="/dashboard/profile"
              className="max-w-[40vw] truncate text-ink-2 transition-colors hover:text-ink"
            >
              {profile?.full_name || profile?.email}
            </Link>
            <SignOutButton />
          </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}