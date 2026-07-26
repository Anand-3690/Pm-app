import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_super_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { email, fullName, password } = await request.json();

  if (!email?.trim() || !fullName?.trim() || !password || password.length < 6) {
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: created, error } = await admin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName.trim(), must_change_password: true },
  });

  if (error || !created.user) {
    return NextResponse.json(
      { error: error?.message || 'Failed to create user' },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true, userId: created.user.id });
}