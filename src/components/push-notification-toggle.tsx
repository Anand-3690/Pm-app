'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Bell, BellOff } from 'lucide-react';
import { isPushSubscribed, subscribeToPush, unsubscribeFromPush } from '@/lib/push-subscribe';

export default function PushNotificationToggle({ userId }: { userId: string }) {
  const supabase = createClient();
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setSupported(false);
      return;
    }
    isPushSubscribed().then(setSubscribed);
  }, []);

  const handleToggle = async () => {
    setLoading(true);
    setError(null);

    try {
      if (subscribed) {
        await unsubscribeFromPush(supabase);
        setSubscribed(false);
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setError(`Permission result: ${permission}. Enable notifications in Settings and try again.`);
          setLoading(false);
          return;
        }

        if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
          setError('VAPID public key is missing from the build.');
          setLoading(false);
          return;
        }

        await subscribeToPush(userId, supabase);
        setSubscribed(true);
      }
    } catch (err: any) {
      setError(`${err.name || 'Error'}: ${err.message || JSON.stringify(err)}`);
    }

    setLoading(false);
  };

  if (!supported) return null;

  return (
    <div className="rounded-[12px] border border-line bg-surface p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Notifications</h2>
          <p className="mt-0.5 text-sm text-ink-3">
            Get notified about new messages and task assignments, even when the app is closed.
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={loading}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
            subscribed
              ? 'border border-line text-ink-2 hover:border-signal hover:text-ink'
              : 'bg-signal text-white hover:bg-signal-hover'
          }`}
        >
          {subscribed ? <BellOff size={15} /> : <Bell size={15} />}
          {loading ? 'Working…' : subscribed ? 'Turn off' : 'Turn on'}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}