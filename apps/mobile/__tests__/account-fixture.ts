import { accountExportSchema } from '@campusflow/contracts';
import { snapshotFixture } from './snapshot-fixture';
export function accountFixture() {
  const snapshot = snapshotFixture();
  return accountExportSchema.parse({ format: 'campusflow-account', version: 1, coverage: 'server-saved', capturedAt: snapshot.capturedAt,
    profile: { id: snapshot.accountId, email: 'student@example.test', displayName: 'Student', timeZone: snapshot.timeZone, createdAt: snapshot.capturedAt },
    personalTasks: snapshot.personalTasks.map(task => ({ ...task, studyPlanOrder: null })), taskCompletions: snapshot.taskCompletions, courses: snapshot.courses.map(course => ({ ...course, source: 'canvas' })),
    academicItems: snapshot.academicItems.map(item => ({ ...item, reminderLeadMinutes: null })), classes: [], studyPlans: [], focusSessions: [],
    goals: snapshot.goals, goalCompletions: snapshot.goalCompletions, wellnessEntries: [], privateEvents: [], savedEvents: [],
    reminders: [], notificationPreferences: null, canvasConnection: null,
  });
}
