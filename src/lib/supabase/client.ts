import { createBrowserClient } from '@supabase/ssr';
import { getAuthCookieName } from './cookie';

export function createClient() {
  const cookieName = getAuthCookieName();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    cookieName ? { cookieOptions: { name: cookieName } } : undefined
  );
}

