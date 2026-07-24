/**
 * Warm, muted avatar fills. Deliberately narrow and low-saturation so a wall
 * of avatars reads as one family rather than a rainbow — signal orange stays
 * reserved for status, never identity.
 *
 * Every value is dark enough to carry white text, so existing callers can keep
 * using `text-white` alongside this class.
 */
const COLORS = [
  'bg-[#6e675c]',
  'bg-[#7a6a55]',
  'bg-[#5f6350]',
  'bg-[#8a5f4f]',
  'bg-[#5c5c54]',
  'bg-[#7d5a6a]',
];

export function avatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}
