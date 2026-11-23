import { checklistLimit, createTaskTemplateSchema, updateTaskTemplateSchema } from '../src';

describe('task template creation', () => {
  it('accepts a title alone and the optional task details', () => {
    expect(createTaskTemplateSchema.parse({ title: 'Prepare for lab' })).toEqual({ title: 'Prepare for lab' });
    expect(createTaskTemplateSchema.parse({ title: 'Lab', description: 'Bring notes', estimatedMinutes: 1440,
      checklist: Array(checklistLimit).fill('Read instructions') }).checklist).toHaveLength(checklistLimit);
  });
  it.each([
    { title: '' }, { title: 'x'.repeat(241) },
    { title: 'Lab', description: 'x'.repeat(10_001) },
    { title: 'Lab', estimatedMinutes: 0 }, { title: 'Lab', estimatedMinutes: 1441 },
    { title: 'Lab', estimatedMinutes: 1.5 },
    { title: 'Lab', checklist: ['   '] }, { title: 'Lab', checklist: ['x'.repeat(241)] },
    { title: 'Lab', checklist: Array(checklistLimit + 1).fill('Step') },
    { title: 'Lab', userId: 'another-account' },
  ])('rejects invalid template input %j', input => {
    expect(createTaskTemplateSchema.safeParse(input).success).toBe(false);
    expect(updateTaskTemplateSchema.safeParse(input).success).toBe(false);
  });
});
it('validates partial template edits with the same task limits and allows clearing optional fields', () => {
  expect(updateTaskTemplateSchema.parse({ description: null, estimatedMinutes: null, checklist: [] }))
    .toEqual({ description: null, estimatedMinutes: null, checklist: [] });
  expect(updateTaskTemplateSchema.parse({ title: 'Renamed' })).toEqual({ title: 'Renamed' });
  for (const body of [{ title: '' }, { estimatedMinutes: 0 }, { checklist: [' '] }, { userId: 'other' }]) {
    expect(updateTaskTemplateSchema.safeParse(body).success).toBe(false);
  }
});

it.each([1, 1440])('accepts exact task field limits with an estimate of %i', estimatedMinutes => {
  const body = { title: 'x'.repeat(240), description: 'x'.repeat(10_000), estimatedMinutes,
    checklist: Array(checklistLimit).fill('x'.repeat(240)) };
  expect(createTaskTemplateSchema.parse(body)).toEqual(body);
  expect(updateTaskTemplateSchema.parse(body)).toEqual(body);
  expect(createTaskTemplateSchema.parse({ title: 'x', checklist: ['x'] })).toEqual({ title: 'x', checklist: ['x'] });
});
