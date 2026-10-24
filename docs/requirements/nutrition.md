# Nutrition

Product extension of ToR 15 (wellness); architecture in
[ADR 023](../adr/023-nutrition-and-dining-hall.md). Reached from Wellness → Food.

- **Plate view.** The day is a plate split into carbs, protein, fiber and fat.
  Each sector fills outward as the nutrient approaches its goal, drawn in its own
  food texture (grains, eggs, leaves, droplets); calories and "left/over" sit in
  the centre and every value is written out below. Colours are the validated
  categorical slots 1–4 in ring order, so only distinguishable hues touch.
- **Goals.** Mifflin–St Jeor × activity (−15 % lose, +10 % gain), protein
  1.8 g/kg, fat 25 % of energy, fiber 14 g per 1000 kcal, carbs the rest, from the
  latest body weight (Gym → Progress). Any number can be overridden.
- **Fast logging.** Per-meal "Add food": usual foods first, search over 8,028 USDA
  foods (plain and cooked staples rank first, brands last), household portions,
  grams, ½× / 2×, live macros, one tap to add. Quick add for anything without a
  table entry. "Repeat yesterday" copies a meal. Lines can be resized, moved or removed.
- **Dining hall.** For Augustana students only: automatic when an active course
  code starts with AU + subject (e.g. AUCSC 325), or always on / off in Goals &
  settings. The Wagner menu is collected on the server; each dish shows site
  calories and estimated macros per serving; the sheet offers ½–3 servings and
  "extra protein" (doubles only the meat part). A failed or empty read never
  replaces a published menu.

Evidence: `packages/domain/__tests__/nutrition.test.ts`, `apps/api/test/dining.spec.ts`
(parser on saved Wagner pages, estimates), `apps/api/test/nutrition-db.spec.ts`
(search, idempotent logging, edits, copy, privacy, profile, dining visibility,
menu storage and failure), `apps/mobile/__tests__/nutrition.test.tsx`; browser
walk-through with the live Wagner menu.
