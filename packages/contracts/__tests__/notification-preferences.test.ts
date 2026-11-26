import { notificationPreferencesSchema, updateNotificationPreferencesSchema } from '../src';

const preferences = {
  academicEnabled: true, personalEnabled: true, goalEnabled: true, eventEnabled: true,
  dailyOverviewEnabled: false, quietHoursStart: null, quietHoursEnd: null,
};

describe('quiet-hours preference boundaries (ToR 13, #197)', () => {
  it.each([
    { quietHoursStart: '22:00' }, { quietHoursEnd: '07:00' },
    { quietHoursStart: null }, { quietHoursEnd: null },
    { quietHoursStart: '22:00', quietHoursEnd: null },
    { quietHoursStart: null, quietHoursEnd: '07:00' },
  ])('rejects an incomplete PATCH: %j', patch => {
    expect(updateNotificationPreferencesSchema.safeParse(patch).success).toBe(false);
  });

  it.each([
    {}, { personalEnabled: false },
    { quietHoursStart: null, quietHoursEnd: null },
    { quietHoursStart: '22:00', quietHoursEnd: '07:00' },
    { quietHoursStart: '12:00', quietHoursEnd: '14:00' },
    { quietHoursStart: '00:00', quietHoursEnd: '02:30' },
    // Existing equal-bound preferences continue to mean disabled.
    { quietHoursStart: '07:00', quietHoursEnd: '07:00' },
  ])('preserves compatible partial updates: %j', patch => {
    expect(updateNotificationPreferencesSchema.parse(patch)).toEqual(patch);
    expect(notificationPreferencesSchema.safeParse({ ...preferences, ...patch }).success).toBe(true);
  });

  it.each([
    { quietHoursStart: '22:00' }, { quietHoursEnd: '07:00' },
  ])('rejects half-configured stored or cached preferences: %j', half => {
    expect(notificationPreferencesSchema.safeParse({ ...preferences, ...half }).success).toBe(false);
  });
});
