import { useRef, useState } from 'react';

/**
 * WhatsApp-style swipe-to-reply for a single message row.
 *
 * Returns touch handlers plus the live horizontal offset and a progress value
 * (0..1) so the row can translate with the finger and reveal a reply icon.
 *
 * Key detail: a DIRECTION LOCK. In the first few pixels of movement we decide
 * whether the gesture is a horizontal swipe or a vertical scroll and commit to
 * one. Without this, dragging to reply fights the chat's own vertical scroll —
 * especially inside a flex-col-reverse scroller. Only right-swipes engage;
 * vertical drags are ignored entirely and left to the browser to scroll.
 *
 * Touch only — desktop keeps the reply button, so pointer/mouse never triggers this.
 */

const TRIGGER_PX = 60; // distance past which a reply fires
const MAX_PULL = 80; // clamp so the bubble can't slide off
const LOCK_PX = 8; // movement before we decide swipe-vs-scroll

export function useSwipeToReply(onReply: () => void) {
  const startX = useRef(0);
  const startY = useRef(0);
  const locked = useRef<null | 'horizontal' | 'vertical'>(null);
  const [offset, setOffset] = useState(0);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    locked.current = null;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;

    // Decide direction once, in the first few px of travel.
    if (locked.current === null) {
      if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
      locked.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }

    // Vertical: leave it alone — the scroller handles it.
    if (locked.current === 'vertical') return;

    // Horizontal: only rightward pulls reply; ignore leftward.
    if (dx <= 0) {
      setOffset(0);
      return;
    }

    // Follow the finger with mild resistance, clamped.
    const pulled = Math.min(dx * 0.6, MAX_PULL);
    setOffset(pulled);
  };

  const onTouchEnd = () => {
    if (locked.current === 'horizontal' && offset >= TRIGGER_PX * 0.6) {
      onReply();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(15);
      }
    }
    setOffset(0);
    locked.current = null;
  };

  const progress = Math.min(offset / (TRIGGER_PX * 0.6), 1);

  return {
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
    offset,
    progress,
  };
}
