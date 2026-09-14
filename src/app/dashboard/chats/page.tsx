import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ChatsTwoPane from '@/components/chats-two-pane';

export const dynamic = 'force-dynamic';

export default async function ChatsPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  const { open } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rows } = await supabase.rpc('chat_list_for_user');

  return (
    <div className="-mx-4 -my-6">
      <ChatsTwoPane
        rows={(rows as any) || []}
        currentUserId={user.id}
        initialOpenTaskId={open ?? null}
      />
    </div>
  );
}