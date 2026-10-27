# Mobile accessibility

CampusFlow targets WCAG 2.1 AA on iOS and Android. These rules are checked
automatically, so new screens inherit them.

## Screen readers

Every `Pressable` has an `accessibilityRole`. A button whose only content is an
icon has an `accessibilityLabel`, and every `TextInput` has a label (`Field`
passes its visible label). `__tests__/accessibility-source.test.ts` parses every
file in `app/` and `src/` with the TypeScript compiler and fails on a control
that breaks one of these rules. Messages that appear after an action use
`accessibilityRole="alert"` or `accessibilityLiveRegion="polite"`.

## Colour contrast

Colours come from the light and dark palettes in `src/components/ui.tsx`.
Text tokens (`ink`, `muted`, `moss`, `coral`, `danger`, `blue`, `plum`, `gold`)
reach 4.5:1 on `canvas` and `card`, and `onAccent` reaches 4.5:1 on every accent
and course colour. In dark mode the accents are light, so `onAccent` is dark.
Use `onAccent`, `onAccentMuted` and `onAccentTrack` on accent backgrounds rather
than hard-coded white. `__tests__/accessibility-contrast.test.ts` checks each
pair in both palettes; `faint` is only for disabled or decorative content.

## Text size

Text follows the device text size. Only fixed-size circles (numbered steps,
calendar days) cap growth with `maxFontSizeMultiplier={1.3}` so they keep their
shape. Controls smaller than 44 points get `hitSlop` to reach a 44-point target.

## Motion

`SheetModal` (`src/components/sheet-modal.tsx`) replaces `Modal` for editors.
It follows iOS Reduce Motion and Android Remove animations, including changes
while the app is open: a slide-in becomes an instant change, and fades stay.
Exercise media already pauses its animation under the same setting.
