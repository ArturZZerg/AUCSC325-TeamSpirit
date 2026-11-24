import {
  campusSourcesSchema, canvasConnectionStatusSchema, completeGoalSchema, completePersonalTaskSchema, createChecklistItemSchema, createGoalSchema, createPersonalTaskRequestSchema,
  focusHistorySchema, gymOverviewSchema, notificationPreferencesSchema, offlineSnapshotSchema, pauseGoalSchema, personalTaskSchema, saveEventSchema, setMainGoalSchema,
  snoozeGoalSchema, snoozePersonalTaskSchema, updateChecklistItemSchema, updateGoalSchema, updatePersonalTaskSchema, updateSavedEventSchema,
  wellnessJournalSchema, type OfflineSnapshot,
} from '@campusflow/contracts';
import { addCalendarDays, instantAtLocalTime, localDateAt } from '@campusflow/domain';
import { composeOfflineToday } from '@/features/offline-today';
import type { Session } from '@/lib/types';

// Explicitly opt-in, disposable sample data. This adapter never contacts the API
// or represents its in-memory writes as a real student's persisted records.
const id = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
let sequence = 100;
let sample: OfflineSnapshot | undefined;

function initialSnapshot(session: Session): OfflineSnapshot {
  const now = new Date().toISOString(), zone = session.user.timeZone;
  const today = localDateAt(now, zone), tomorrow = addCalendarDays(today, 1);
  const at = (day: string, time: string) => new Date(instantAtLocalTime(day, time, zone)).toISOString();
  const task = (number: number, title: string, extra: Partial<OfflineSnapshot['personalTasks'][number]> = {}) => ({
    id: id(number), title, description: null, priority: 'medium' as const, category: 'personal' as const,
    due: null, scheduled: { kind: 'date' as const, date: today }, recurrence: null, reminder: null,
    estimatedMinutes: 25, completedAt: null, snoozedUntil: null, mainGoalDate: null,
    checklist: [], courseId: null, createdAt: now, updatedAt: now, ...extra,
  });
  return offlineSnapshotSchema.parse({
    accountId: session.user.id, capturedAt: now, timeZone: zone,
    coverage: { from: addCalendarDays(today, -30), through: addCalendarDays(today, 60), includesOverdue: true, basis: 'persisted' },
    sourceStatus: { availability: 'available', lastSuccessfulSyncAt: now, coveredFrom: today, coveredThrough: addCalendarDays(today, 60) },
    courses: [
      { id: id(1), externalId: 'preview-software', name: 'Software Engineering', code: 'AUCSC 325', active: true, source: 'manual', color: 'moss' },
      { id: id(2), externalId: 'preview-statistics', name: 'Applied Statistics', code: 'AUSTA 213', active: true, source: 'manual', color: 'plum' },
      { id: id(3), externalId: 'preview-design', name: 'Design & Visual Culture', code: 'AUART 215', active: true, source: 'manual', color: 'coral' },
    ],
    personalTasks: [
      task(10, 'Finish the project proposal', { category: 'university', priority: 'high', courseId: id(1), mainGoalDate: today, estimatedMinutes: 45,
        due: { kind: 'date', date: today }, checklist: [{ id: id(70), title: 'Review the requirements', done: true }, { id: id(71), title: 'Write the final draft', done: false }] }),
      task(11, 'Review lecture notes', { category: 'university', courseId: id(2), estimatedMinutes: 30 }),
      task(12, 'Pick up a few groceries', { estimatedMinutes: 20 }),
      task(13, 'Plan the week over coffee', { completedAt: now, estimatedMinutes: 15 }),
    ],
    taskCompletions: [],
    academicItems: [
      { id: id(20), courseId: id(2), title: 'Statistics problem set', kind: 'assignment', due: { kind: 'date', date: tomorrow }, submissionState: 'unsubmitted', source: 'manual', externalId: 'preview-stats', mainGoalDate: null, updatedAt: now },
      { id: id(21), courseId: id(1), title: 'Sprint demo & reflection', kind: 'assignment', due: { kind: 'date', date: addCalendarDays(today, 3) }, submissionState: 'unsubmitted', source: 'manual', externalId: 'preview-demo', mainGoalDate: null, updatedAt: now },
      { id: id(22), courseId: id(3), title: 'Visual research journal', kind: 'assignment', due: { kind: 'date', date: addCalendarDays(today, 5) }, submissionState: 'unsubmitted', source: 'manual', externalId: 'preview-art', mainGoalDate: null, updatedAt: now },
    ],
    goals: [
      { id: id(30), title: 'Get outside for a little while', category: 'health', schedule: { kind: 'daily' }, timeZone: zone, reminder: null, pausedAt: null, snoozedUntil: null, createdAt: now, updatedAt: now },
      { id: id(31), title: 'Start the day with a glass of water', category: 'health', schedule: { kind: 'daily' }, timeZone: zone, reminder: null, pausedAt: null, snoozedUntil: null, createdAt: now, updatedAt: now },
    ],
    goalCompletions: [{ id: id(32), goalId: id(31), occurrenceKey: today, state: 'completed', completedAt: now, createdAt: now }],
    events: [
      { id: id(40), title: 'Coffee & creative connections', description: 'Meet other students, share ideas, and take a well-earned break.', category: 'Social', source: 'preview', externalId: 'preview-coffee', timing: { kind: 'timed', startsAt: at(today, '16:00'), endsAt: at(today, '17:30') }, location: 'The Students’ Lounge', url: null },
      { id: id(41), title: 'A night of board games', description: 'Bring a friend or find your next favourite game. Everyone is welcome.', category: 'Clubs', source: 'preview', externalId: 'preview-games', timing: { kind: 'timed', startsAt: at(tomorrow, '18:00'), endsAt: at(tomorrow, '20:00') }, location: 'Augustana Library', url: null },
    ],
    savedEvents: [],
  });
}

/** Kept exported for the focused fixture tests, never used by the real API path. */
export function resetLocalPreview() { sample = undefined; sequence = 100; }

export async function localPreviewRequest(path: string, init: RequestInit, session: Session): Promise<unknown> {
  if (init.signal?.aborted) throw new Error('Preview request cancelled.');
  if (!sample || sample.accountId !== session.user.id || sample.timeZone !== session.user.timeZone) sample = initialSnapshot(session);
  const data = sample;
  const [route, search = ''] = path.split('?'), params = new URLSearchParams(search);
  const method = (init.method ?? 'GET').toUpperCase();
  const now = new Date().toISOString(), today = localDateAt(now, data.timeZone);
  const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
  if (method === 'GET') {
    if (route === '/me') return session.user;
    if (route === '/today') {
      data.capturedAt = now;
      const result = composeOfflineToday(data, session.user.id, data.timeZone, params.get('date') ?? today, now);
      if (!result) throw new Error('Choose a date within the local preview range.');
      return result;
    }
    if (route === '/snapshot') return { ...data, capturedAt: now };
    if (route === '/tasks') return data.personalTasks;
    if (route === '/courses') return data.courses;
    if (route === '/academic-items') return data.academicItems;
    if (route === '/goals') return data.goals;
    if (route === '/events') return data.events.map(event => {
      const saved = data.savedEvents.find(row => row.eventId === event.id);
      return { ...event, saved: !!saved, includedInPlan: saved?.includedInPlan ?? false, savedReminder: saved?.reminder ?? null };
    });
    if (route === '/events/sources') return campusSourcesSchema.parse({ generatedAt: now, sources: [] });
    if (route === '/classes') return [
      { id: id(50), title: 'Software Engineering', weekdays: [1, 3, 5], termStart: data.coverage.from, termEnd: data.coverage.through,
        startTime: '09:00', endTime: '10:15', timeZone: data.timeZone, location: 'Science Centre · 2-101', instructor: null, notes: null,
        color: 'moss', courseId: id(1), createdAt: now, updatedAt: now },
      { id: id(51), title: 'Applied Statistics', weekdays: [1, 2, 3, 4, 5], termStart: data.coverage.from, termEnd: data.coverage.through,
        startTime: '13:00', endTime: '14:00', timeZone: data.timeZone, location: 'Founders Hall · 102', instructor: null, notes: null,
        color: 'plum', courseId: id(2), createdAt: now, updatedAt: now },
    ];
    if (route === '/wellness') return [];
    if (route === '/wellness/journal') return wellnessJournalSchema.parse({ accountId: session.user.id, timeZone: data.timeZone, from: params.get('from') ?? today, through: params.get('through') ?? today, capturedAt: now, entries: [] });
    if (route === '/focus-sessions') return focusHistorySchema.parse({ accountId: session.user.id, timeZone: data.timeZone, from: params.get('from') ?? today, through: params.get('through') ?? today, capturedAt: now, sessions: [] });
    if (route === '/gym') return gymOverviewSchema.parse({ accountId: session.user.id, timeZone: data.timeZone, capturedAt: now, enrollment: null, workouts: [], exercises: [], programs: [], bodyWeights: [] });
    if (['/reminders', '/study-plans', '/task-templates'].includes(route)) return [];
    if (route === '/notification-preferences') return notificationPreferencesSchema.parse({ academicEnabled: false, personalEnabled: false, goalEnabled: false, eventEnabled: false, dailyOverviewEnabled: false, quietHoursStart: null, quietHoursEnd: null });
    if (route === '/canvas/status') return canvasConnectionStatusSchema.parse({ connected: false, connectMode: 'unavailable', baseUrl: null, externalAccountId: null, lastSuccessfulSyncAt: null, lastSyncAttemptAt: null, lastError: null });
    const task = route.match(/^\/tasks\/([^/]+)$/);
    if (task) { const result = data.personalTasks.find(row => row.id === task[1]); if (result) return result; }
    const history = route.match(/^\/goals\/([^/]+)\/history$/);
    if (history) return data.goalCompletions.filter(row => row.goalId === history[1]);
    const reminder = route.match(/^\/academic-items\/([^/]+)\/reminder$/);
    if (reminder) return { academicItemId: reminder[1], leadMinutes: null };
  }
  if (method === 'POST' && route === '/tasks') {
    const input = createPersonalTaskRequestSchema.parse(body);
    const task = personalTaskSchema.parse({ id: id(++sequence), description: null, priority: 'medium', category: 'personal', due: null,
      scheduled: null, recurrence: null, reminder: null, estimatedMinutes: null, completedAt: null, snoozedUntil: null,
      mainGoalDate: null, createdAt: now, updatedAt: now, ...input,
      checklist: (input.checklist ?? []).map(step => ({ ...step, done: false })) });
    data.personalTasks.push(task); return task;
  }
  const taskRoute = route.match(/^\/tasks\/([^/]+)(?:\/(complete|snooze|main-goal))?$/);
  if (taskRoute) {
    const task = data.personalTasks.find(row => row.id === taskRoute[1]);
    if (!task) throw new Error('This preview task is no longer available.');
    if (method === 'DELETE' && !taskRoute[2]) { data.personalTasks = data.personalTasks.filter(row => row !== task); return { deleted: true }; }
    if (method === 'PATCH' && !taskRoute[2]) { Object.assign(task, updatePersonalTaskSchema.parse(body), { updatedAt: now }); return task; }
    if (method === 'POST' && taskRoute[2] === 'complete') { task.completedAt = completePersonalTaskSchema.parse(body).completed ? now : null; task.updatedAt = now; return task; }
    if (method === 'POST' && taskRoute[2] === 'snooze') { task.snoozedUntil = snoozePersonalTaskSchema.parse(body).until; return task; }
    if (method === 'POST' && taskRoute[2] === 'main-goal') {
      const selected = setMainGoalSchema.parse(body).date;
      data.personalTasks.forEach(row => { if (row.mainGoalDate === selected) row.mainGoalDate = null; });
      task.mainGoalDate = selected; return task;
    }
  }
  const checklist = route.match(/^\/tasks\/([^/]+)\/checklist(?:\/([^/]+))?$/);
  if (checklist) {
    const task = data.personalTasks.find(row => row.id === checklist[1]);
    if (!task) throw new Error('This preview task is no longer available.');
    if (method === 'POST' && !checklist[2]) {
      const input = createChecklistItemSchema.parse(body);
      task.checklist ??= [];
      if (task.checklist.length >= 30) throw new Error('This task already has 30 steps.');
      if (!task.checklist.some(step => step.id === input.id)) task.checklist.push({ ...input, done: false });
      return task;
    }
    const step = task.checklist?.find(row => row.id === checklist[2]);
    if (!step) throw new Error('This preview step is no longer available.');
    if (method === 'PATCH') { Object.assign(step, updateChecklistItemSchema.parse(body)); return task; }
    if (method === 'DELETE') { task.checklist = task.checklist?.filter(row => row !== step); return task; }
  }
  if (method === 'POST' && route === '/goals') {
    const goal = { id: id(++sequence), category: 'health' as const, reminder: null, pausedAt: null, snoozedUntil: null,
      createdAt: now, updatedAt: now, ...createGoalSchema.parse(body) };
    data.goals.push(goal); return goal;
  }
  const goalRoute = route.match(/^\/goals\/([^/]+)(?:\/(complete|snooze|pause))?$/);
  if (goalRoute) {
    const goal = data.goals.find(row => row.id === goalRoute[1]);
    if (!goal) throw new Error('This preview routine is no longer available.');
    if (method === 'DELETE' && !goalRoute[2]) { data.goals = data.goals.filter(row => row !== goal); return { deleted: true }; }
    if (method === 'PATCH' && !goalRoute[2]) { Object.assign(goal, updateGoalSchema.parse(body), { updatedAt: now }); return goal; }
    if (method === 'POST' && goalRoute[2] === 'complete') {
      const input = completeGoalSchema.parse(body);
      const result = { id: id(++sequence), goalId: goal.id, ...input, completedAt: input.state === 'completed' ? now : null, createdAt: now };
      data.goalCompletions = data.goalCompletions.filter(row => row.goalId !== goal.id || row.occurrenceKey !== input.occurrenceKey);
      data.goalCompletions.push(result); return result;
    }
    if (method === 'POST' && goalRoute[2] === 'snooze') { goal.snoozedUntil = snoozeGoalSchema.parse(body).until; return goal; }
    if (method === 'POST' && goalRoute[2] === 'pause') { goal.pausedAt = pauseGoalSchema.parse(body).paused ? now : null; return goal; }
  }
  const eventRoute = route.match(/^\/events\/([^/]+)\/saved$/);
  if (eventRoute && ['PUT', 'PATCH', 'DELETE'].includes(method)) {
    const event = data.events.find(row => row.id === eventRoute[1]);
    if (!event) throw new Error('This preview event is no longer available.');
    if (method === 'DELETE') { data.savedEvents = data.savedEvents.filter(row => row.eventId !== event.id); return { deleted: true }; }
    const previous = data.savedEvents.find(row => row.eventId === event.id);
    const input = method === 'PATCH' ? updateSavedEventSchema.parse(body) : saveEventSchema.parse(body);
    data.savedEvents = data.savedEvents.filter(row => row.eventId !== event.id);
    const saved = { eventId: event.id, ...input, includedInPlan: input.includedInPlan ?? previous?.includedInPlan ?? false,
      reminder: input.reminder ?? previous?.reminder ?? null, savedAt: now };
    data.savedEvents.push(saved); return saved;
  }
  throw new Error('This action needs the connected API. The local preview keeps sample changes in memory only.');
}
