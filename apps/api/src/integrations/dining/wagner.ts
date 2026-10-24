/**
 * Augustana dining hall (Wagner) menu, ported from the owner's openGym overlay (ADR 023).
 * The page is server-rendered and embeds the whole day as JSON (`window.Day = {…}`).
 * Only calories per serving are published; `0` means "not given".
 */
export const wagnerBaseUrl = 'https://wagner.augustana.ualberta.ca/menu/';
export const wagnerUserAgent = 'CampusFlow-menu/1.0 (student meal diary; one request per few seconds; +https://workout.vakula-dev.com/campusflow/)';
export const mealOrder = ['breakfast', 'lunch', 'dinner'] as const;
export type DiningMeal = typeof mealOrder[number];
export interface ParsedItem { name: string; kcal: number | null }
export interface ParsedStation { label: string; items: ParsedItem[] }
export interface ParsedMeal { meal: DiningMeal; label: string; start: number | null; end: number | null; stations: ParsedStation[] }
export type ParsedDay = { ok: true; date: string; published: boolean; meals: ParsedMeal[] } | { ok: false; error: string };

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const iso = /^\d{4}-\d{2}-\d{2}$/;

/** The JSON object literal that starts at `start` (a "{"), respecting strings. */
function objectAt(text: string, start: number): string | null {
  let depth = 0, inString = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) { if (char === '\\') index++; else if (char === '"') inString = false; }
    else if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return text.slice(start, index + 1);
  }
  return null;
}
export function extractDay(html: string): unknown {
  for (const pattern of [/window\.Day\s*=\s*\{/, /\bDay\s*:\s*\{"date"/]) {
    const match = pattern.exec(html);
    if (!match) continue;
    const literal = objectAt(html, html.indexOf('{', match.index));
    if (!literal) continue;
    try { return JSON.parse(literal); } catch { /* try the next form */ }
  }
  return null;
}

const minutes = (hour: number, minute: number, half: string) => (hour % 12 + (half === 'pm' ? 12 : 0)) * 60 + minute;
/**
 * "7:30-9:30am", "11:30-2:15PM", "7:30-9:30", "11:30am - 2:15pm" → minutes from midnight.
 * A trailing am/pm also applies to the start unless that would put the start after the end;
 * without any, hours before 7 (and noon) are afternoon. Null when the label is not a time.
 */
export function parseServingTime(label: string): { start: number; end: number } | null {
  const text = clean(label).toLowerCase().replace(/\./g, '').replace(/[–—]/g, '-');
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(text);
  if (!match) return null;
  const [h1, m1, h2, m2] = [Number(match[1]), Number(match[2] ?? 0), Number(match[4]), Number(match[5] ?? 0)];
  if (h1 < 1 || h1 > 12 || h2 < 1 || h2 > 12 || m1 > 59 || m2 > 59) return null;
  const guess = (hour: number) => hour < 7 || hour === 12 ? 'pm' : 'am';
  const endHalf = match[6] ?? match[3] ?? guess(h2), end = minutes(h2, m2, endHalf);
  let startHalf = match[3] ?? endHalf;
  if (!match[3] && minutes(h1, m1, startHalf) > end) startHalf = startHalf === 'pm' ? 'am' : 'pm';
  if (!match[3] && !match[6]) startHalf = guess(h1);
  const start = minutes(h1, m1, startHalf);
  return start < end ? { start, end } : null;
}

/** Normalised day, or `{ ok: false }` when the page no longer looks like the menu (the caller keeps old data). */
export function parseDay(html: string, expectedDate?: string): ParsedDay {
  const day = extractDay(html) as { date?: unknown; meals?: unknown } | null;
  if (!day || typeof day !== 'object') return { ok: false, error: 'menu data (window.Day) not found in the page' };
  if (!iso.test(String(day.date ?? ''))) return { ok: false, error: 'menu data has no date' };
  const date = String(day.date);
  if (expectedDate && date !== expectedDate) return { ok: false, error: `asked for ${expectedDate}, the page is for ${date}` };
  // An empty PHP array serialises as [] — a day with no meals at all.
  if (Array.isArray(day.meals) && !day.meals.length) return { ok: true, date, published: false, meals: [] };
  if (!day.meals || typeof day.meals !== 'object' || Array.isArray(day.meals)) return { ok: false, error: 'menu data has no meals object' };
  const meals: ParsedMeal[] = [];
  for (const [key, value] of Object.entries(day.meals as Record<string, unknown>)) {
    if (!(mealOrder as readonly string[]).includes(key)) continue;
    const meal = value as { label?: unknown; offerings?: unknown } | null;
    if (!meal || typeof meal !== 'object' || !meal.offerings || typeof meal.offerings !== 'object') return { ok: false, error: `meal ${key} has no offerings` };
    let time: { start: number; end: number } | null = null;
    const stations: ParsedStation[] = [];
    for (const [stationKey, raw] of Object.entries(meal.offerings as Record<string, unknown>)) {
      const offering = raw as { station_label?: unknown; items?: unknown } | null;
      if (!offering || typeof offering !== 'object') return { ok: false, error: `${key}/${stationKey} is not an object` };
      if (offering.items != null && !Array.isArray(offering.items)) return { ok: false, error: `${key}/${stationKey} items is not a list` };
      const label = clean(offering.station_label), served = parseServingTime(label);
      if (served && !time) time = served;
      const items = ((offering.items as unknown[] | undefined) ?? []).slice(0, 40).flatMap(item => {
        const row = item as { label?: unknown; calories?: unknown } | null;
        const name = clean(row?.label);
        if (!name) return [];
        const kcal = Number(row?.calories);
        return [{ name, kcal: Number.isFinite(kcal) && kcal > 0 && kcal < 5000 ? Math.round(kcal) : null }];
      });
      // The first station's label is the serving time; show it as "Featured".
      stations.push({ label: served ? 'Featured' : label || stationKey, items });
    }
    meals.push({ meal: key as DiningMeal, label: clean(meal.label) || key, start: time?.start ?? null, end: time?.end ?? null, stations });
  }
  meals.sort((a, b) => mealOrder.indexOf(a.meal) - mealOrder.indexOf(b.meal));
  return { ok: true, date, published: meals.some(meal => meal.stations.some(station => station.items.length)), meals };
}

export const wagnerDayUrl = (date: string) => `${wagnerBaseUrl}?date=${encodeURIComponent(date)}`;
export async function fetchWagnerDay(date: string, fetcher: typeof fetch = fetch): Promise<string> {
  if (!iso.test(date)) throw new Error('date must be YYYY-MM-DD');
  const response = await fetcher(wagnerDayUrl(date), { headers: { 'User-Agent': wagnerUserAgent, Accept: 'text/html' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`menu site answered ${response.status}`);
  return response.text();
}
