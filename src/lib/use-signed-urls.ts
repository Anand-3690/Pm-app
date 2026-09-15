import { useEffect, useState } from 'react';
import { signMany } from './storage';

type CachedUrl = {
  url: string;
  expiresAt: number;
};

// Global in-memory cache shared across components and re-mounts
const globalSignedUrlCache = new Map<string, CachedUrl>();

// Helper to check sessionStorage safely
function loadFromStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`sevak_surl_${key}`);
    if (!raw) return null;
    const parsed: CachedUrl = JSON.parse(raw);
    if (parsed.expiresAt > Date.now() + 60000) {
      globalSignedUrlCache.set(key, parsed);
      return parsed.url;
    }
  } catch {}
  return null;
}

function saveToStorage(key: string, url: string, expiresAt: number) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(`sevak_surl_${key}`, JSON.stringify({ url, expiresAt }));
  } catch {}
}

export function useSignedUrls(supabase: any, messages: { attachment_url?: string | null }[]) {
  const keys = messages.map((m) => m.attachment_url).filter(Boolean) as string[];
  const sig = keys.join('|');

  // Initialize with any already-cached unexpired URLs so frame 1 renders images immediately
  const [urls, setUrls] = useState<Record<string, string | null>>(() => {
    const initial: Record<string, string | null> = {};
    const now = Date.now();
    for (const k of keys) {
      const cached = globalSignedUrlCache.get(k);
      if (cached && cached.expiresAt > now + 60000) {
        initial[k] = cached.url;
      } else {
        const stored = loadFromStorage(k);
        if (stored) initial[k] = stored;
      }
    }
    return initial;
  });

  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    const missing = keys.filter((k) => {
      const cached = globalSignedUrlCache.get(k);
      return !(cached && cached.expiresAt > now + 60000) && !(k in urls && urls[k]);
    });

    if (!missing.length) return;

    signMany(supabase, missing).then((res) => {
      if (cancelled) return;
      if (res) {
        const expiresAt = Date.now() + 3500 * 1000; // valid for ~1 hour
        for (const [key, val] of Object.entries(res)) {
          if (val) {
            globalSignedUrlCache.set(key, { url: val, expiresAt });
            saveToStorage(key, val, expiresAt);
          }
        }
      }
      setUrls((prev) => ({ ...prev, ...res }));
    });

    return () => {
      cancelled = true;
    };
  }, [sig]);

  return urls;
}