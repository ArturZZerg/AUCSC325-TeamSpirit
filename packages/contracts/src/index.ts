import { z } from 'zod';

export const idSchema = z.string().uuid();
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD').refine(value => {
  const [year, month, day] = value.split('-').map(Number);
  const candidate = new Date(0);
  candidate.setUTCFullYear(year, month - 1, day);
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}, 'Expected a valid calendar date');
/** Wire instants are canonical UTC values. Local wall-clock values must be paired with an IANA zone before the boundary. */
export const instantSchema = z.string().datetime({ offset: false });
export const timeZoneSchema = z.string().min(1).max(100).refine(value => { try { Intl.DateTimeFormat(undefined, { timeZone: value }); return true; } catch { return false; } }, 'Expected an IANA time zone');
export const prioritySchema = z.enum(['low', 'medium', 'high']);
export const categorySchema = z.enum(['university', 'personal', 'health', 'fitness', 'work', 'social', 'other']);
export const recurrenceSchema = z.discriminatedUnion('frequency', [
  z.object({ frequency: z.literal('daily'), interval: z.number().int().positive().max(365).default(1) }),
  z.object({ frequency: z.literal('weekly'), weekdays: z.array(z.number().int().min(1).max(7)).min(1), interval: z.number().int().positive().max(52).default(1) }),
]);
export const scheduleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('date'), date: dateSchema }),
  z.object({ kind: z.literal('instant'), at: instantSchema }),
]);
export const dueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('date'), date: dateSchema }),
  z.object({ kind: z.literal('instant'), at: instantSchema }),
]);
export const userSchema = z.object({ id: idSchema, email: z.string().email(), displayName: z.string().min(1).max(100), timeZone: timeZoneSchema, createdAt: instantSchema });
export const registerRequestSchema = z.object({ email: z.string().email(), password: z.string().min(12).max(128), displayName: z.string().min(1).max(100), timeZone: timeZoneSchema });
export const loginRequestSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(128) });
export const sessionSchema = z.object({ accessToken: z.string().min(1), expiresAt: instantSchema, user: userSchema });

export const personalTaskSchema = z.object({ id: idSchema, title: z.string().min(1).max(240), description: z.string().max(10_000).nullable(), priority: prioritySchema, category: categorySchema, due: dueSchema.nullable(), scheduled: scheduleSchema.nullable(), recurrence: recurrenceSchema.nullable(), reminder: scheduleSchema.nullable(), estimatedMinutes: z.number().int().positive().max(1440).nullable(), completedAt: instantSchema.nullable(), snoozedUntil: instantSchema.nullable(), mainGoalDate: dateSchema.nullable(), createdAt: instantSchema, updatedAt: instantSchema });
export const createPersonalTaskSchema = personalTaskSchema.pick({ title: true, description: true, priority: true, category: true, due: true, scheduled: true, recurrence: true, reminder: true, estimatedMinutes: true }).partial({ description: true, priority: true, category: true, due: true, scheduled: true, recurrence: true, reminder: true, estimatedMinutes: true });
export const updatePersonalTaskSchema = createPersonalTaskSchema.partial().strict();
export const taskQuerySchema = z.object({
  search: z.string().trim().max(240).optional(),
  category: categorySchema.optional(),
  completed: z.enum(['true', 'false']).optional(),
}).strict();
export const completePersonalTaskSchema = z.object({ completed: z.boolean(), occurrenceKey: dateSchema.optional() }).strict();
export const snoozePersonalTaskSchema = z.object({ until: instantSchema });
export const setMainGoalSchema = z.object({ date: dateSchema.nullable() });

export const courseSchema = z.object({ id: idSchema, externalId: z.string().min(1), name: z.string().min(1), code: z.string().nullable(), active: z.boolean() });
export const academicItemSchema = z.object({ id: idSchema, courseId: idSchema.nullable(), title: z.string().min(1), kind: z.enum(['assignment', 'quiz', 'discussion', 'planner']), due: dueSchema.nullable(), submissionState: z.enum(['unsubmitted', 'submitted', 'graded', 'missing']).nullable(), source: z.string().min(1), externalId: z.string().min(1), mainGoalDate: dateSchema.nullable(), updatedAt: instantSchema });
export const manualAcademicSource = 'manual' as const;
export const createManualAcademicItemSchema = z.object({
  title: z.string().trim().min(1).max(240), kind: academicItemSchema.shape.kind,
  courseId: idSchema.nullable().optional(), due: dueSchema.nullable().optional(),
}).strict();
export const updateManualAcademicItemSchema = createManualAcademicItemSchema.partial().extend({
  submissionState: z.enum(['unsubmitted', 'submitted']).optional(),
}).strict().refine(value => Object.values(value).some(field => field !== undefined), 'Provide at least one change');

export const goalScheduleSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('daily') }), z.object({ kind: z.literal('weekly'), weekdays: z.array(z.number().int().min(1).max(7)).min(1) }), z.object({ kind: z.literal('weeklyTarget'), target: z.number().int().positive().max(7) })]);
export const goalSchema = z.object({ id: idSchema, title: z.string().min(1).max(240), category: categorySchema, schedule: goalScheduleSchema, timeZone: timeZoneSchema, reminder: scheduleSchema.nullable(), pausedAt: instantSchema.nullable(), snoozedUntil: instantSchema.nullable(), createdAt: instantSchema, updatedAt: instantSchema });
export const createGoalSchema = goalSchema.pick({ title: true, category: true, schedule: true, timeZone: true, reminder: true }).partial({ category: true, reminder: true });
export const updateGoalSchema = createGoalSchema.partial();
export const goalCompletionSchema = z.object({ id: idSchema, goalId: idSchema, occurrenceKey: dateSchema, state: z.enum(['completed', 'skipped']), completedAt: instantSchema.nullable(), createdAt: instantSchema });
export const completeGoalSchema = z.object({ occurrenceKey: dateSchema, state: z.enum(['completed', 'skipped']) }).strict();
export const pauseGoalSchema = z.object({ paused: z.boolean() }).strict();
export const snoozeGoalSchema = z.object({ until: instantSchema, occurrenceKey: dateSchema.optional() });

export const eventSchema = z.object({ id: idSchema, title: z.string().min(1), description: z.string().nullable(), category: z.string().nullable(), source: z.string().min(1), externalId: z.string().min(1), timing: z.discriminatedUnion('kind', [z.object({ kind: z.literal('timed'), startsAt: instantSchema, endsAt: instantSchema.nullable() }), z.object({ kind: z.literal('allDay'), startDate: dateSchema, endDateExclusive: dateSchema })]), location: z.string().nullable(), url: z.string().url().nullable() });
export const savedEventSchema = z.object({ eventId: idSchema, includedInPlan: z.boolean(), reminder: scheduleSchema.nullable(), savedAt: instantSchema });
// Optional metadata keeps older cached event reads usable without inventing saved state.
export const campusEventSchema = eventSchema.extend({ saved: z.boolean().optional(), includedInPlan: z.boolean().optional(), savedReminder: scheduleSchema.nullable().optional() }).superRefine((event, context) => {
  if (event.saved !== true && event.savedReminder != null) context.addIssue({ code: 'custom', path: ['savedReminder'], message: 'Reminder configuration requires a saved event.' });
  if (event.saved === false && event.includedInPlan === true) context.addIssue({ code: 'custom', path: ['includedInPlan'], message: 'Plan inclusion requires a saved event.' });
});
export const saveEventSchema = z.object({ includedInPlan: z.boolean().default(false), reminder: scheduleSchema.nullable().optional() });
export const updateSavedEventSchema = saveEventSchema.partial();
export type CampusEvent = z.infer<typeof campusEventSchema>;

export const wellnessEntrySchema = z.object({ id: idSchema, date: dateSchema, mood: z.number().int().min(1).max(5).nullable(), energy: z.number().int().min(1).max(5).nullable(), stress: z.number().int().min(1).max(5).nullable(), note: z.string().max(2_000).nullable(), createdAt: instantSchema });
export const createWellnessEntrySchema = wellnessEntrySchema.pick({ date: true, mood: true, energy: true, stress: true, note: true });
export const localTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM');
export const notificationPreferencesSchema = z.object({ academicEnabled: z.boolean(), personalEnabled: z.boolean(), goalEnabled: z.boolean(), eventEnabled: z.boolean(), dailyOverviewEnabled: z.boolean(), quietHoursStart: localTimeSchema.nullable(), quietHoursEnd: localTimeSchema.nullable() });
export const updateNotificationPreferencesSchema = notificationPreferencesSchema.partial();
export const reminderSchema = z.object({ id: idSchema, targetKind: z.enum(['personalTask', 'goal', 'savedEvent', 'academicItem']), targetId: idSchema, occurrenceKey: dateSchema.nullable(), fireAt: instantSchema, enabled: z.boolean() });

export const canvasConnectionStatusSchema = z.object({ connected: z.boolean(), baseUrl: z.string().url().nullable(), externalAccountId: z.string().nullable(), lastSuccessfulSyncAt: instantSchema.nullable(), lastSyncAttemptAt: instantSchema.nullable(), lastError: z.string().nullable() });
export const canvasSyncResultSchema = z.object({ startedAt: instantSchema, finishedAt: instantSchema, coursesUpdated: z.number().int().nonnegative(), academicItemsUpdated: z.number().int().nonnegative(), eventsUpdated: z.number().int().nonnegative(), status: z.enum(['succeeded', 'failed']) });
export const sourceFreshnessSchema = z.object({ lastSuccessfulSyncAt: instantSchema.nullable(), availability: z.enum(['available', 'stale', 'unavailable', 'notConnected']), coveredFrom: dateSchema.nullable(), coveredThrough: dateSchema.nullable() });

export const dailyPlanItemSchema = z.object({ key: z.string().min(1), kind: z.enum(['academic', 'personalTask', 'goal', 'event']), entityId: idSchema, occurrenceKey: dateSchema.nullable(), title: z.string(), schedule: scheduleSchema.nullable(), due: dueSchema.nullable(), state: z.enum(['upcoming', 'today', 'completed', 'overdue', 'skipped', 'snoozed', 'submitted', 'graded']), isMainGoal: z.boolean(), priority: prioritySchema.nullable(), allowedActions: z.array(z.enum(['complete', 'uncomplete', 'skip', 'snooze', 'open', 'save'])) });
export const todayResponseSchema = z.object({ date: dateSchema, timeZone: timeZoneSchema, generatedAt: instantSchema, sourceStatus: sourceFreshnessSchema, items: z.array(dailyPlanItemSchema), upcoming: z.array(dailyPlanItemSchema), campusEvents: z.array(eventSchema) });
export const taskCompletionSchema = z.object({ taskId: idSchema, occurrenceKey: dateSchema, completedAt: instantSchema });
/** Inclusive local-date window for reproducing the persisted Today read model at capturedAt.
 * Includes all open overdue work and records needed for each day's seven-day upcoming list.
 * This is database coverage, NOT a claim that an external source has synchronized this window.
 * Consumers must also retain sourceStatus and must not treat an out-of-window date as empty.
 */
export const snapshotCoverageSchema = z.object({
  from: dateSchema, through: dateSchema,
  includesOverdue: z.literal(true), basis: z.literal('persisted'),
}).refine(value => value.from <= value.through, 'Coverage end precedes start');
export const offlineSnapshotSchema = z.object({
  accountId: idSchema, capturedAt: instantSchema, timeZone: timeZoneSchema,
  coverage: snapshotCoverageSchema, sourceStatus: sourceFreshnessSchema,
  courses: z.array(courseSchema), academicItems: z.array(academicItemSchema),
  personalTasks: z.array(personalTaskSchema), taskCompletions: z.array(taskCompletionSchema),
  goals: z.array(goalSchema), goalCompletions: z.array(goalCompletionSchema),
  events: z.array(eventSchema), savedEvents: z.array(savedEventSchema),
});
export const todayQuerySchema = z.object({ date: dateSchema.optional() });

export type User = z.infer<typeof userSchema>; export type PersonalTask = z.infer<typeof personalTaskSchema>; export type Goal = z.infer<typeof goalSchema>; export type GoalCompletion = z.infer<typeof goalCompletionSchema>; export type AcademicItem = z.infer<typeof academicItemSchema>; export type Event = z.infer<typeof eventSchema>; export type Reminder = z.infer<typeof reminderSchema>; export type DailyPlanItem = z.infer<typeof dailyPlanItemSchema>; export type TodayResponse = z.infer<typeof todayResponseSchema>; export type OfflineSnapshot = z.infer<typeof offlineSnapshotSchema>;

export type TaskCompletion = z.infer<typeof taskCompletionSchema>;
export type SnapshotCoverage = z.infer<typeof snapshotCoverageSchema>;

/** Half-open event range. Date boundaries are local midnight in the account zone. */
const eventRangeBoundarySchema = z.union([dateSchema, instantSchema]).refine(value => dateSchema.safeParse(value.slice(0, 10)).success, 'Invalid calendar date');
export const eventQuerySchema = z.object({
  from: eventRangeBoundarySchema.optional(), through: eventRangeBoundarySchema.optional(),
  category: z.string().trim().min(1).max(240).optional(),
}).strict();

// Explicit relative intent; null clears configuration. Bounded by PostgreSQL Int.
export const configureAcademicReminderSchema = z.object({ leadMinutes: z.number().int().min(0).max(2147483647).nullable() }).strict();
export const academicReminderConfigurationSchema = configureAcademicReminderSchema.extend({ academicItemId: idSchema });
