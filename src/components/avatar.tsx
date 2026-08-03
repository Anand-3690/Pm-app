import { avatarColor } from '@/lib/avatar-color';

/**
 * Shared avatar. Renders the uploaded photo when `url` is present AND the
 * avatar is large enough to read a face (>= 24px by default). Below that, or
 * with no photo, it falls back to a coloured initial — the same look the app
 * used everywhere before.
 *
 * Keeping the photo threshold here means tiny overlapping avatars (task-card
 * clusters, participant rows) stay as clean initials without each caller
 * having to decide.
 */
export default function Avatar({
  url,
  name,
  size = 28,
  className = '',
}: {
  url?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const label = (name || '?').trim();
  const initial = (label[0] || '?').toUpperCase();
  const showPhoto = !!url && size >= 24;

  const dimension = { width: size, height: size };

  if (showPhoto) {
    return (
      <img
        src={url!}
        alt={label}
        style={dimension}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      style={{ ...dimension, fontSize: Math.max(9, Math.round(size * 0.42)) }}
      className={`flex shrink-0 items-center justify-center rounded-full font-medium text-white ${avatarColor(
        label
      )} ${className}`}
    >
      {initial}
    </div>
  );
}