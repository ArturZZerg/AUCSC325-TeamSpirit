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
});
