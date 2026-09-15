/**
 * Computes the consistent auth token cookie name across client and server.
 * Supabase SSR derives the cookie storage key from the project host: `sb-${host.split('.')[0]}-auth-token`.
 * When the server connects over the internal Docker network (e.g. `http://supabase-kong:8000`),
 * we explicitly preserve the public hostname cookie key (`sb-${projectRef}-auth-token`)
 * so browser and server auth cookies match 1:1.
 */
export function getAuthCookieName(): string | undefined {
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!publicUrl) return undefined;
  try {
    const projectRef = new URL(publicUrl).hostname.split('.')[0];
    return `sb-${projectRef}-auth-token`;
  } catch {
    return undefined;
  }
}
