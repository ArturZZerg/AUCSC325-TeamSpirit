import { accountDeletedSchema, accountExportSchema, deleteAccountSchema } from '../src/index';
const profile = { id: '10000000-0000-4000-8000-000000000001', email: 'student@example.test', displayName: 'Student', timeZone: 'America/Edmonton', createdAt: '2025-03-09T08:00:00Z' };
const copy = { format: 'campusflow-account', version: 1, capturedAt: profile.createdAt, coverage: 'server-saved', profile,
  personalTasks: [], taskCompletions: [], courses: [], academicItems: [], classes: [], studyPlans: [], focusSessions: [], gymEnrollment: null, workouts: [], userExercises: [], userPrograms: [], bodyWeights: [], goals: [],
  goalCompletions: [], wellnessEntries: [], privateEvents: [], savedEvents: [], reminders: [], notificationPreferences: null, canvasConnection: null };
it('accepts a complete versioned empty export and rejects unsupported or partial copies', () => {
  expect(accountExportSchema.parse(copy)).toEqual(copy);
  for (const change of [{ version: 2 }, { coverage: 'all-devices' }, { personalTasks: undefined }, { capturedAt: 'yesterday' }]) expect(accountExportSchema.safeParse({ ...copy, ...change }).success).toBe(false);
});
it('rejects internal fields in the export boundary', () => {
  for (const change of [{ sessions: [] }, { profile: { ...profile, passwordHash: 'secret' } },
    { canvasConnection: { baseUrl: 'https://canvas.example.test', externalAccountId: null, lastSuccessfulSyncAt: null, lastSyncAttemptAt: null, coveredFrom: null, coveredThrough: null, encryptedAccessToken: 'secret' } }])
    expect(accountExportSchema.safeParse({ ...copy, ...change }).success).toBe(false);
});
it('requires password and exact deliberate deletion confirmation without client-selected ownership', () => {
  expect(deleteAccountSchema.parse({ currentPassword: 'password', confirmation: 'DELETE' })).toEqual({ currentPassword: 'password', confirmation: 'DELETE' });
  for (const change of [{ currentPassword: '' }, { currentPassword: 'x'.repeat(129) }, { confirmation: 'delete' }, { userId: profile.id }])
    expect(deleteAccountSchema.safeParse({ currentPassword: 'password', confirmation: 'DELETE', ...change }).success).toBe(false);
  expect(accountDeletedSchema.safeParse({ deleted: false }).success).toBe(false);
  expect(accountDeletedSchema.parse({ deleted: true })).toEqual({ deleted: true });
});
