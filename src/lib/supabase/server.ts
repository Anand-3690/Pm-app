import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAuthCookieName } from './cookie';

export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const cookieName = getAuthCookieName();

  return createServerClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: cookieName ? { name: cookieName } : undefined,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component — safe to ignore, middleware refreshes session
          }
        },
      },
    }
  );
}
