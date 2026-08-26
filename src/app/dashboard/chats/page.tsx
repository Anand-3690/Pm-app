import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ChatList from '@/components/chat-list';

// Chat-first home: flat list of task chats the user participates in.
export default async function ChatsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rows } = await supabase.rpc('chat_list_for_user');

  return (
    <div className="-mx-4 -my-6">
      <div className="px-1 pt-3">
        <h1 className="px-4 pb-1 font-display text-2xl font-bold text-ink">Chats</h1>
      </div>
      <ChatList rows={(rows as any) || []} currentUserId={user.id} />
    </div>
  );
}
