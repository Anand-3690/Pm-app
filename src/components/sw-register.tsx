'use client';

import { useEffect, useState } from 'react';

export default function SwRegister() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [showReload, setShowReload] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let refreshing = false;
    // When the new SW takes control, reload once to get fresh assets.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // A worker already waiting when the page loads.
        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
          setShowReload(true);
        }

        // A new worker started installing.
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            // Installed AND there's an existing controller => it's an update,
            // not a first install. Offer the reload.
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker);
              setShowReload(true);
            }
          });
        });
      })
      .catch((err) => {
        console.error('Service worker registration failed:', err);
      });

    // Check for updates when the app regains focus (e.g. reopening the PWA).
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.getRegistration().then((reg) => reg?.update());
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const reload = () => {
    if (!waitingWorker) {
      window.location.reload();
      return;
    }
    // Tell the waiting worker to activate; controllerchange handler reloads.
    waitingWorker.postMessage('SKIP_WAITING');
    setShowReload(false);
  };

  if (!showReload) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] flex justify-center px-4 pb-[env(safe-area-inset-bottom)]">
      <div className="mb-3 flex items-center gap-3 rounded-full border border-line bg-ink px-4 py-2.5 shadow-lg">
        <span className="text-sm font-medium text-white">A new version is available</span>
        <button
          onClick={reload}
          className="rounded-full bg-signal px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-signal-hover"
        >
          Update
        </button>
      </div>
    </div>
  );
}