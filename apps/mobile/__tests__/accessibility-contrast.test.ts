import { palettes } from '../src/components/ui';

// WCAG 2.1 relative luminance and contrast ratio for #RRGGBB colours.
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};
const AA = 4.5;

describe.each(Object.entries(palettes))('%s theme contrast (WCAG 2.1 AA)', (_, colors) => {
  const text = ['ink', 'muted', 'moss', 'coral', 'danger', 'blue', 'plum', 'gold'] as const;
  it.each(text.flatMap(token => (['canvas', 'card'] as const).map(surface => [token, surface] as const)))('%s text on %s', (token, surface) => {
    expect(contrast(colors[token], colors[surface])).toBeGreaterThanOrEqual(AA);
  });
  it.each([['muted', 'sage'], ['moss', 'sage'], ['ink', 'sage'], ['warnText', 'warnSurface'], ['streakText', 'streakSurface'], ['danger', 'dangerSurface'],
    ['ink', 'blueSurface']] as const)('%s text on %s', (token, surface) => {
    expect(contrast(colors[token], colors[surface])).toBeGreaterThanOrEqual(AA);
  });
  // Buttons, chips, checkmarks, course tiles and heroes put onAccent text on these.
  it.each(['moss', 'coral', 'danger', 'blue', 'plum', 'courseGold', 'courseTeal', 'courseSlate', 'courseRose'] as const)('onAccent text on %s', accent => {
    expect(contrast(colors.onAccent, colors[accent])).toBeGreaterThanOrEqual(AA);
  });
});
