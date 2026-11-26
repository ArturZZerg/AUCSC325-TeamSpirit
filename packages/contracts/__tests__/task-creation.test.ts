import { createPersonalTaskRequestSchema, updatePersonalTaskSchema } from '../src';

describe('Optional PersonalTask creation identity', () => {
  it('accepts bounded creation keys without requiring them for existing task callers', () => {
    expect(createPersonalTaskRequestSchema.parse({ title: 'Study', requestKey: 'task-request-12345' }).requestKey).toBe('task-request-12345');
    expect(createPersonalTaskRequestSchema.parse({ title: 'Study' })).toEqual({ title: 'Study' });
  });
  it.each(['', 'short', 'a'.repeat(121), 'task key with spaces'])('rejects malformed keys %s', requestKey => {
    expect(createPersonalTaskRequestSchema.safeParse({ title: 'Study', requestKey }).success).toBe(false);
  });
  it('does not allow creation identity to become editable task state', () => {
    expect(updatePersonalTaskSchema.safeParse({ title: 'Changed', requestKey: 'task-request-12345' }).success).toBe(false);
  });
  it('rejects whitespace-only titles and trims surrounding whitespace', () => {
    expect(createPersonalTaskRequestSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(createPersonalTaskRequestSchema.parse({ title: '  Study  ' }).title).toBe('Study');
    expect(updatePersonalTaskSchema.safeParse({ title: '\t\n' }).success).toBe(false);
    expect(updatePersonalTaskSchema.parse({ title: '  Renamed  ' }).title).toBe('Renamed');
  });
});

it('accepts initial checklist steps while keeping them out of task PATCH', () => {
  const step = { id: '10000000-0000-4000-8000-000000000001', title: 'Read notes' };
  expect(createPersonalTaskRequestSchema.parse({ title: 'Lab', checklist: [step] }).checklist).toEqual([step]);
  expect(createPersonalTaskRequestSchema.safeParse({ title: 'Lab', checklist: [{ ...step, title: '' }] }).success).toBe(false);
  expect(createPersonalTaskRequestSchema.safeParse({ title: 'Lab', checklist: Array(31).fill(step) }).success).toBe(false);
  expect(updatePersonalTaskSchema.safeParse({ checklist: [step] }).success).toBe(false);
});
