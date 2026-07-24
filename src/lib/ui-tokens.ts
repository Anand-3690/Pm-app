import type { Task } from './types';

export const STATUS_LABEL: Record<Task['status'], string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};

/** Stamp chips. Orange is reserved for work that is actually moving. */
export const STATUS_STAMP: Record<Task['status'], string> = {
  todo: 'bg-chip text-ink-2',
  in_progress: 'bg-signal-tint text-signal-ink',
  done: 'bg-chip text-ink-3',
};

/** Column wells on the board — only the active column takes a tint. */
export const COLUMN_WELL: Record<Task['status'], string> = {
  todo: 'bg-chip/60',
  in_progress: 'bg-signal-tint/60',
  done: 'bg-chip/60',
};

export const PRIORITY_LABEL: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

/** Escalation ends in solid orange, so urgent is the loudest thing on screen. */
export const PRIORITY_STAMP: Record<string, string> = {
  low: 'bg-chip text-ink-3',
  medium: 'bg-chip text-ink-2',
  high: 'bg-signal-tint text-signal-ink',
  urgent: 'bg-signal text-white',
};

/** Left rule beside a priority label — monochrome until it matters. */
export const PRIORITY_RULE: Record<string, string> = {
  low: 'border-l-[#d6d0c6]',
  medium: 'border-l-ink-4',
  high: 'border-l-signal',
  urgent: 'border-l-signal-ink',
};

export const PROJECT_STATUS_STAMP: Record<string, string> = {
  active: 'bg-signal-tint text-signal-ink',
  on_hold: 'bg-chip text-ink-2',
  completed: 'bg-chip text-ink-3',
  archived: 'bg-chip text-ink-4',
};

export function projectStatusLabel(status: string) {
  return (status || '').replace('_', ' ');
}
