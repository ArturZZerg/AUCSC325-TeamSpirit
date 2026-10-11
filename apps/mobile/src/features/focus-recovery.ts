import { z } from 'zod';
import { idSchema, saveFocusSessionSchema } from '@campusflow/contracts';
import { pauseFocusTimer, type FocusTimer } from './focus-timer';
import type { FocusTarget } from '@/store/focus';

const instant = z.number().int().min(0).max(8_640_000_000_000_000);
export const focusDraftSchema = z.object({
  version: z.literal(1), accountId: idSchema, checkpointAt: instant,
  timer: z.object({
    phase: z.literal('focus'), status: z.enum(['paused', 'finished']),
    durationMs: z.number().int().min(60_000).max(90 * 60_000).refine(value => value % 60_000 === 0),
    remainingMs: z.number().int().nonnegative(), endsAt: z.null(), startedAt: instant, finishedAt: instant.nullable(),
  }).strict(),
  target: z.object({ id: idSchema, title: z.string().trim().min(1).max(240) }).strict().nullable(),
  taskCompleted: z.boolean(), requestKey: z.string().min(8).max(120),
  recording: saveFocusSessionSchema.nullable(),
}).strict().refine(value => {
  const { timer, checkpointAt, recording, target } = value;
  const elapsed = timer.durationMs - timer.remainingMs;
  if (timer.remainingMs > timer.durationMs || timer.startedAt > checkpointAt || elapsed > checkpointAt - timer.startedAt) return false;
  if (timer.status === 'finished' ? timer.remainingMs !== 0 || timer.finishedAt === null
    || timer.finishedAt > checkpointAt || timer.finishedAt - timer.startedAt < elapsed : timer.finishedAt !== null || timer.remainingMs === 0) return false;
  return !recording || (recording.requestKey === value.requestKey && Date.parse(recording.startedAt) === timer.startedAt
    && Date.parse(recording.endedAt) <= checkpointAt && recording.focusedSeconds === Math.floor(elapsed / 1000)
    && recording.plannedMinutes === timer.durationMs / 60_000 && recording.title === (target?.title ?? 'Free study')
    && (recording.taskId === null || recording.taskId === target?.id)
    && recording.outcome === (timer.status === 'finished' ? 'completed' : 'interrupted')
    && (timer.status !== 'finished' || Date.parse(recording.endedAt) === timer.finishedAt));
}, 'Inconsistent focus draft');
export type FocusDraft = z.infer<typeof focusDraftSchema>;
type RecoverableBlock = {
  timer: FocusTimer; target: FocusTarget | null; taskCompleted: boolean; requestKey: string | null;
  recording: FocusDraft['recording']; recorded: boolean; recoveredAt: number | null;
};
export function makeFocusDraft(state: RecoverableBlock, accountId: string, now: number): FocusDraft | null {
  if (state.recorded || state.timer.phase !== 'focus' || state.timer.startedAt === null || !state.requestKey) return null;
  const checkpointAt = state.recoveredAt ?? now;
  const result = focusDraftSchema.safeParse({ version: 1, accountId, checkpointAt,
    timer: pauseFocusTimer(state.timer, checkpointAt), target: state.target,
    taskCompleted: state.taskCompleted, requestKey: state.requestKey, recording: state.recording });
  return result.success ? result.data : null;
}
export function parseFocusDraft(value: unknown, accountId: string, now: number): FocusDraft | null {
  const result = focusDraftSchema.safeParse(value);
  return result.success && result.data.accountId === accountId && result.data.checkpointAt <= now ? result.data : null;
}
