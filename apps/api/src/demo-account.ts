import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import { addCalendarDays, instantAtLocalTime, localDateAt } from '@campusflow/domain';
import { Prisma, PrismaClient } from '@prisma/client';
import { eraseAccount } from './account';
import { hashPassword } from './password';

/**
 * Synthetic demo account for reviewers and first-time visitors. The address is
 * reserved (RFC 2606), so no real student can verify it, and reset only ever
 * deletes this one account. Data is written through the public API so
 * it passes the same validation as anything a student saves.
 */
export const demoEmail = 'demo@example.com';
export const demoTimeZone = 'America/Edmonton';

type Json = Record<string, unknown>;
export type DemoSend = (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown) => Promise<unknown>;

const SEED_SESSION_MS = 15 * 60 * 1000;
const eraseDemo = async (tx: Prisma.TransactionClient) => {
  const existing = await tx.user.findUnique({ where: { email: demoEmail }, select: { id: true, email: true } });
  if (existing) await eraseAccount(tx, existing);
};

/**
 * Recreates the demo account and returns a short-lived session for seeding.
 * The session is issued here rather than through sign-in, so published-address
 * login quotas can never stop the nightly reset.
 */
export async function resetDemoUser(prisma: PrismaClient, password: string, now = new Date()) {
  if (password.length < 12 || password.length > 128) throw new Error('Demo password must be 12-128 characters.');
  const passwordHash = await hashPassword(password), token = randomBytes(32).toString('base64url');
  await prisma.$transaction(async tx => {
    await eraseDemo(tx);
    const user = await tx.user.create({ data: { email: demoEmail, passwordHash, emailVerifiedAt: now, displayName: 'Demo Student',
      timeZone: demoTimeZone, notificationPreference: { create: {} } } });
    await tx.session.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + SEED_SESSION_MS) } });
  }, { timeout: 30000 });
  return token;
}

export const removeDemoUser = (prisma: PrismaClient) => prisma.$transaction(eraseDemo, { timeout: 30000 });

export async function seedDemoAccount(send: DemoSend, now = new Date().toISOString()) {
  const today = localDateAt(now, demoTimeZone), day = (offset: number) => addCalendarDays(today, offset);
  const at = (offset: number, time: string) => instantAtLocalTime(day(offset), time, demoTimeZone);
  const weekday = Temporal.PlainDate.from(today).dayOfWeek;
  const term = { termStart: day(-45), termEnd: day(60), timeZone: demoTimeZone, notes: null };

  const courses = {
    psych: { id: randomUUID(), name: 'Introduction to Psychology', code: 'PSYC 104', color: 'blue' },
    bio: { id: randomUUID(), name: 'Cell Biology', code: 'BIOL 107', color: 'moss' },
    eng: { id: randomUUID(), name: 'Academic Writing', code: 'ENGL 102', color: 'plum' },
  };
  for (const course of Object.values(courses)) await send('POST', '/courses', course);
  for (const [title, weight, score] of [['Quiz 1', 10, 84], ['Lab reports', 25, 78], ['Midterm', 25, null], ['Final exam', 40, null]] as const)
    await send('POST', `/courses/${courses.bio.id}/assessments`, { id: randomUUID(), title, weight, score });

  // A class on every weekday keeps the next-class card useful whichever day the demo opens.
  const classes = [
    { title: 'Psychology lecture', courseId: courses.psych.id, weekdays: [1, 3, 5], startTime: '09:00', endTime: '09:50', location: 'Classroom Building 2-150', instructor: 'Dr. Lee', color: 'blue' },
    { title: 'Biology lecture', courseId: courses.bio.id, weekdays: [2, 4], startTime: '10:30', endTime: '11:50', location: 'Science Wing 1-04', instructor: 'Dr. Okafor', color: 'moss' },
    { title: 'Writing seminar', courseId: courses.eng.id, weekdays: [1, 3], startTime: '13:00', endTime: '13:50', location: 'Library 0-12', instructor: 'Prof. Martin', color: 'plum' },
    { title: 'Biology lab', courseId: courses.bio.id, weekdays: [5], startTime: '14:00', endTime: '16:50', location: 'Science Wing 2-20', instructor: null, color: 'coral' },
  ];
  for (const pattern of classes) await send('POST', '/classes', { ...pattern, ...term });

  const coursework = [
    { title: 'Reading response: memory chapter', kind: 'assignment', courseId: courses.psych.id, due: { kind: 'instant', at: at(0, '23:59') } },
    { title: 'Lab report: enzyme kinetics', kind: 'assignment', courseId: courses.bio.id, due: { kind: 'date', date: day(3) } },
    { title: 'Argumentative essay draft', kind: 'assignment', courseId: courses.eng.id, due: { kind: 'date', date: day(7) } },
    { title: 'Psychology midterm', kind: 'exam', courseId: courses.psych.id, due: { kind: 'instant', at: at(10, '09:00') } },
  ];
  const items = [] as Json[];
  for (const item of coursework) items.push(await send('POST', '/academic-items', item) as Json);

  const tasks = [
    { title: 'Email advisor about winter registration', category: 'university', priority: 'high', due: { kind: 'date', date: day(1) }, estimatedMinutes: 10 },
    { title: 'Buy groceries', category: 'personal', scheduled: { kind: 'date', date: day(0) }, estimatedMinutes: 45 },
    { title: 'Review psychology flashcards', category: 'university', courseId: courses.psych.id, recurrence: { frequency: 'daily', interval: 1 },
      scheduled: { kind: 'date', date: day(-7) }, estimatedMinutes: 20 },
    { title: 'Shift at the campus café', category: 'work', scheduled: { kind: 'instant', at: at(2, '17:00') }, estimatedMinutes: 240 },
  ];
  const created = [] as Json[];
  for (const task of tasks) created.push(await send('POST', '/tasks', task) as Json);
  for (const step of ['Find the course code', 'Check prerequisites', 'Ask about the waitlist'])
    await send('POST', `/tasks/${created[0].id}/checklist`, { id: randomUUID(), title: step });

  await send('POST', '/study-plans', { requestKey: `demo-${randomUUID()}`, academicItemId: items[3].id, title: 'Midterm preparation',
    sessions: [2, 5, 8].map((offset, index) => ({ title: `Midterm review ${index + 1}`, scheduled: { kind: 'date', date: day(offset) }, estimatedMinutes: 60 })) });

  const water = await send('POST', '/goals', { title: 'Drink water', category: 'health', schedule: { kind: 'daily' }, timeZone: demoTimeZone }) as Json;
  const gym = await send('POST', '/goals', { title: 'Go to the gym', category: 'fitness', schedule: { kind: 'weeklyTarget', target: 3 }, timeZone: demoTimeZone }) as Json;
  for (const offset of [-4, -3, -2, -1]) await send('POST', `/goals/${water.id}/complete`, { occurrenceKey: day(offset), state: 'completed' });
  // Only this week's earlier days count toward the gym target.
  for (const offset of [-1, -3].filter(offset => weekday + offset >= 1))
    await send('POST', `/goals/${gym.id}/complete`, { occurrenceKey: day(offset), state: 'completed' });

  for (const [offset, mood, energy, stress, note] of [[-2, 4, 3, 2, 'Good lab session.'], [-1, 3, 2, 4, 'Midterm is getting close.']] as const)
    await send('PUT', `/wellness/journal/${day(offset)}`, { mood, energy, stress, note, expected: null });

  const events = await send('GET', `/events?from=${day(0)}&through=${day(14)}`) as Json[];
  const event = events.find(candidate => !candidate.saved);
  if (event) await send('PUT', `/events/${event.id}/saved`, { includedInPlan: true });

  return { courses: 3, classes: classes.length, coursework: items.length, tasks: created.length, goals: 2, savedEvents: event ? 1 : 0 };
}

async function readStdin() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input.trim();
}

class DemoFailure extends Error {}

/**
 * `node demo-account.js < password-file`: resets the demo account against this
 * host's running API and fails unless the resulting Today plan is non-empty.
 * Run it after local midnight in Edmonton so "today" matches the viewer's day.
 */
async function main() {
  const host = process.env.HOST?.includes(':') ? `[${process.env.HOST}]` : process.env.HOST ?? '127.0.0.1';
  const base = `http://${host}:${process.env.PORT ?? 3000}`;
  const password = await readStdin();
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid');
  url.searchParams.set('connection_limit', '1');
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    const token = await resetDemoUser(prisma, password);
    const send: DemoSend = async (method, path, body) => {
      const response = await fetch(`${base}${path}`, { method, signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      // Status and path only: request bodies and the session never reach logs.
      if (!response.ok) throw new DemoFailure(`${method} ${path.split('?')[0]} failed with ${response.status}.`);
      return response.status === 204 ? null : response.json();
    };
    try {
      const summary = await seedDemoAccount(send);
      const today = await send('GET', '/today') as { items?: unknown[] };
      if (!today.items?.length) throw new DemoFailure('Seeded Today plan is empty.');
      console.log(JSON.stringify({ demo: demoEmail, ...summary, todayItems: today.items.length }));
    } catch (error) {
      // A half-seeded demo is worse than none: remove it so the failure is obvious.
      await removeDemoUser(prisma);
      throw error;
    }
  } finally { await prisma.$disconnect(); }
}

if (require.main === module) main().catch(error => {
  // Prisma errors can echo call arguments, so only our own messages are printed.
  console.error(error instanceof DemoFailure || (error instanceof Error && error.message.startsWith('Demo password')) ? error.message : 'Demo reset failed.');
  process.exitCode = 1;
});
