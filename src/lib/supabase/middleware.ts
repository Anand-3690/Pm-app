import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && !request.nextUrl.pathname.startsWith('/login') && !request.nextUrl.pathname.startsWith('/signup')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (
    user &&
    request.nextUrl.pathname.startsWith('/dashboard') &&
    !request.nextUrl.pathname.startsWith('/dashboard/change-password')
  ) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('must_change_password')
      .eq('id', user.id)
      .single();

    if (profile?.must_change_password) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard/change-password';
      return NextResponse.redirect(url);
    }
  }

  return response;
}
