'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, Folders, User } from 'lucide-react';

// Mobile bottom tab bar. Chats is home, Projects is the structured view, You is profile.
export default function BottomTabs() {
  const pathname = usePathname();

  const tabs = [
    { href: '/dashboard/chats', label: 'Chats', icon: MessageCircle, match: (p: string) => p.startsWith('/dashboard/chats') },
    { href: '/dashboard/projects', label: 'Projects', icon: Folders, match: (p: string) => p.startsWith('/dashboard/projects') || p === '/dashboard' },
    { href: '/dashboard/profile', label: 'You', icon: User, match: (p: string) => p.startsWith('/dashboard/profile') },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden">
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {tabs.map((t) => {
          const active = t.match(pathname);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className="flex flex-1 flex-col items-center gap-0.5 py-2"
            >
              <Icon size={22} className={active ? 'text-signal' : 'text-ink-4'} />
              <span className={`text-[11px] ${active ? 'font-medium text-signal' : 'text-ink-4'}`}>
                {t.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
