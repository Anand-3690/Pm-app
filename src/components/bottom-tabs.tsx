'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, Folders, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// Modern mobile floating island dock with glassmorphism, responsive highlights, and realtime unread count
export default function BottomTabs() {
  const pathname = usePathname();
  const [unreadTotal, setUnreadTotal] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    let active = true;

    const fetchUnreads = async () => {
      const { data } = await supabase.rpc('unread_counts_by_project');
      if (!active) return;
      if (data && Array.isArray(data)) {
        const sum = data.reduce((acc: number, r: any) => acc + (Number(r.unread_count) || 0), 0);
        setUnreadTotal(sum);
      }
    };

    fetchUnreads();

    const ch = supabase
      .channel('bottom-tabs-unreads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        fetchUnreads();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reads' }, () => {
        fetchUnreads();
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, []);

  const tabs = [
    {
      href: '/dashboard/chats',
      label: 'Chats',
      icon: MessageCircle,
      match: (p: string) => p.startsWith('/dashboard/chats'),
    },
    {
      href: '/dashboard/projects',
      label: 'Projects',
      icon: Folders,
      match: (p: string) => p.startsWith('/dashboard/projects') || p === '/dashboard',
    },
    {
      href: '/dashboard/profile',
      label: 'You',
      icon: User,
      match: (p: string) => p.startsWith('/dashboard/profile'),
    },
  ];

  return (
    <nav
      aria-label="Mobile navigation dock"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))] sm:hidden"
    >
      <div className="pointer-events-auto mx-auto flex max-w-[360px] items-center justify-between gap-1 rounded-full border border-white/85 bg-white/92 p-1.5 shadow-[0_12px_32px_rgba(30,70,107,0.15),0_2px_8px_rgba(30,70,107,0.06)] backdrop-blur-2xl transition-all">
        {tabs.map((t) => {
          const active = t.match(pathname);
          const Icon = t.icon;
          const showBadge = t.href.includes('chats') && unreadTotal > 0;

          return (
            <Link
              key={t.href}
              href={t.href}
              className={`relative flex flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-full py-2 px-2.5 transition-all duration-200 active:scale-95 ${
                active
                  ? 'border border-signal/20 bg-gradient-to-b from-[#fff5ed] to-[#ffede0] font-bold text-signal shadow-xs'
                  : 'font-medium text-ink-3 hover:bg-black/5 hover:text-ink'
              }`}
            >
              <div className="relative flex shrink-0 items-center justify-center">
                <Icon
                  size={19}
                  className={`transition-transform duration-200 ${
                    active ? 'scale-105 text-signal stroke-[2.2]' : 'text-ink-4 stroke-[1.8]'
                  }`}
                />
                {showBadge && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 text-[9px] font-black text-white shadow-[0_1px_4px_rgba(255,107,44,0.5)]">
                    {unreadTotal > 99 ? '99+' : unreadTotal}
                  </span>
                )}
              </div>
              <span
                className={`text-[12.5px] tracking-tight ${
                  active ? 'font-bold text-signal' : 'font-medium text-ink-3'
                }`}
              >
                {t.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
