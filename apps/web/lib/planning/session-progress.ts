import type { SessionPlanTimelineItem } from './session-plan';

export type SessionProgressInput = {
  startedAt: string | null;
  durationMinutes: number;
  timeline: SessionPlanTimelineItem[];
  activeSegmentId?: string | null;
  activeTaskPending?: boolean;
  now?: number;
};

export type SessionProgress = {
  elapsedMinutes: number;
  remainingMinutes: number;
  activeIndex: number;
  activeSegmentId: string;
  activeSegment: SessionPlanTimelineItem;
  nextSegment: SessionPlanTimelineItem | null;
  segmentRemainingMinutes: number;
  transitionDue: boolean;
  isFinished: boolean;
};

function elapsedMinutes(startedAt: string | null, now: number) {
  if (!startedAt) return 0;
  const started = Date.parse(startedAt);
  return Number.isFinite(started) ? Math.max(0, (now - started) / 60_000) : 0;
}

export function resolveSessionProgress(
  input: SessionProgressInput,
): SessionProgress | null {
  if (!input.timeline.length || input.durationMinutes <= 0) return null;
  const now = input.now ?? Date.now();
  const elapsed = Math.min(
    input.durationMinutes,
    elapsedMinutes(input.startedAt, now),
  );
  let rawIndex = input.timeline.length - 1;
  let accumulated = 0;
  for (const [index, item] of input.timeline.entries()) {
    accumulated += item.minutes;
    if (elapsed < accumulated) {
      rawIndex = index;
      break;
    }
  }
  const storedIndex = input.activeSegmentId
    ? input.timeline.findIndex((item) => item.id === input.activeSegmentId)
    : -1;
  const hasStoredSegment = storedIndex >= 0;
  const transitionDue = hasStoredSegment && rawIndex > storedIndex;
  const activeIndex =
    transitionDue && input.activeTaskPending
      ? storedIndex
      : hasStoredSegment
        ? Math.max(storedIndex, rawIndex)
        : rawIndex;
  const activeSegment = input.timeline[activeIndex] ?? input.timeline[0]!;
  const nextSegment = input.timeline[activeIndex + 1] ?? null;
  const segmentStart = input.timeline
    .slice(0, activeIndex)
    .reduce((sum, item) => sum + item.minutes, 0);
  const segmentEnd = segmentStart + activeSegment.minutes;
  return {
    elapsedMinutes: elapsed,
    remainingMinutes: Math.max(0, input.durationMinutes - elapsed),
    activeIndex,
    activeSegmentId: activeSegment.id,
    activeSegment,
    nextSegment,
    segmentRemainingMinutes: Math.max(0, segmentEnd - elapsed),
    transitionDue: transitionDue || (!hasStoredSegment && rawIndex > 0),
    isFinished: elapsed >= input.durationMinutes && !input.activeTaskPending,
  };
}
