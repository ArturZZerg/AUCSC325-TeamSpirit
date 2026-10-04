import { academicReminderConfigurationSchema, configureAcademicReminderSchema, reminderSchema } from '../src';

describe('Academic reminder boundaries', () => {
  it.each([null, 0, 60, 1440])('accepts explicit leadMinutes=%s', leadMinutes => {
    expect(configureAcademicReminderSchema.parse({ leadMinutes })).toEqual({ leadMinutes });
  });
  it.each([{}, { leadMinutes: undefined }, { leadMinutes: -1 }, { leadMinutes: 1.5 }, { leadMinutes: '60' },
    { leadMinutes: Number.POSITIVE_INFINITY }, { leadMinutes: 2147483648 }, { leadMinutes: 60, academicItemId: 'injected' }])('rejects %j', input => {
    expect(configureAcademicReminderSchema.safeParse(input).success).toBe(false);
  });
  it('separates retained relative configuration from the unchanged mobile delivery DTO', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(academicReminderConfigurationSchema.parse({ academicItemId: id, leadMinutes: 1440 })).toEqual({ academicItemId: id, leadMinutes: 1440 });
    expect(reminderSchema.parse({ id, targetId: id, targetKind: 'academicItem', occurrenceKey: null,
      fireAt: '2026-10-10T00:00:00Z', enabled: true }).targetKind).toBe('academicItem');
  });
});
