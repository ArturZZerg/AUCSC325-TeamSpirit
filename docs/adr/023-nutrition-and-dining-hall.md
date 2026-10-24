# ADR 023 — Nutrition diary and Augustana dining hall

Status: Accepted.

Date: 2026-10-23

## Context

The owner's openGym overlay has a calorie/macro diary, goals and an Augustana
(Wagner) dining-hall menu with per-serving estimates. It is the owner's own
code, not upstream openGym, so its rules are ported to TypeScript. Photo
recognition (laptop GPU worker) is out of scope. The diary must be quicker to
use than the original, the dining hall must handle portions better, and it must
only appear for Augustana students, with an off switch.

## Decision

- **Food data.** USDA FoodData Central (Foundation + SR Legacy, public domain)
  is converted once into `apps/api/data/usda-foods.json` (name, kcal, protein,
  fat, carbs, fiber per 100 g, household portions). The API searches it in
  memory; mobile never ships the table. Students can save their own foods
  (`UserFood`) and recent/frequent items are offered first.
- **Diary.** `FoodLogEntry` per account date and meal (breakfast, lunch,
  dinner, snack) with a snapshot of name, grams and nutrients, so food-table
  changes never rewrite history. Logging is one search, one portion choice
  (household portion, grams, or ×½/×1/×1½/×2 servings), one tap. Copy a
  previous meal and repeat yesterday are first-class actions.
- **Goals.** `NutritionProfile` (sex, birth year, height, activity, goal,
  optional overrides). Start values: Mifflin–St Jeor × activity (−15 % lose,
  +10 % gain), protein 1.8 g/kg, fat 25 % of energy, carbs the rest, fiber
  14 g/1000 kcal, from the latest body weight (ADR 022). Every number can be
  overridden. No medical claims.
- **Plate view.** The day's macros are drawn as a plate divided into protein,
  carbs, fat and fiber sectors that fill as the day's intake approaches each
  goal, each sector drawn in that nutrient's illustrated food texture (SVG;
  `react-native-svg`). Numbers stay available as text for accessibility.
- **Dining hall.** The Wagner menu page embeds the day as JSON; an
  `AugustanaDiningProvider` in the API integrations reads it on a schedule
  (early morning and before meals, a few seconds between requests, identifying
  User-Agent) into `DiningMenuDay` rows; a page that stops parsing never
  replaces stored data. Only calories per serving are published; protein, fat,
  carbs and fiber are estimates from USDA analogs scaled to the site calories,
  shown as estimates. The student picks ½–3 servings per dish; a dish-level
  correction applies to later days.
- **Who sees it.** `diningHall` setting: `auto` (default) shows it when an
  active course code starts with `AU` followed by a subject (Augustana Campus,
  e.g. `AUCSC 325`), `on`, or `off`. The rule lives in `packages/domain`.

## Consequences

Dining estimates depend on the site's format; parser failures are visible in
the app and leave the last good menu. The USDA file adds a few MB to the API
image. Nutrition data is included in account export and erased with the account.
