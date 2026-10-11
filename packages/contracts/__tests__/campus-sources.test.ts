import { campusSourcesSchema } from '../src/index';
const source = { source: 'campus:recreation', name: 'Recreation', website: 'https://example.org/calendar', availability: 'available', lastSuccessfulAt: '2026-10-10T18:00:00Z', coverage: { from: '2026-10-10', through: '2026-12-10', timeZone: 'America/Edmonton' } };
const parse = (sources: unknown[]) => campusSourcesSchema.safeParse({ generatedAt: '2026-10-10T18:00:00Z', sources });
describe('campus source read boundary', () => {
  it('distinguishes disabled, first import and complete coverage', () => {
    expect(parse([]).success).toBe(true); expect(parse([source]).success).toBe(true);
    expect(parse([{ ...source, availability: 'unavailable', lastSuccessfulAt: null, coverage: null }]).success).toBe(true);
  });
  it.each([{ ...source, coverage: null }, { ...source, lastSuccessfulAt: null }, { ...source, website: 'javascript:alert(1)' }, { ...source, coverage: { ...source.coverage, through: source.coverage.from } }, { ...source, token: 'secret' }])('rejects malformed or secret-bearing source %j', value => {
    expect(parse([value]).success).toBe(false);
  });
  it('rejects duplicate source identities', () => { expect(parse([source, source]).success).toBe(false); });
});
