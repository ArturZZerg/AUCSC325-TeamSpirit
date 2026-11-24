# Local frontend redesign

Extends ToR 4 (daily plan), 7 (personal tasks), and 19 (cached access).

The existing Expo app uses a restrained forest/sage palette, warm neutral
surfaces, clearer typography, and responsive spacing. Desktop browsers have a
sidebar; phones retain all six existing tabs. Today has category filters, a
calendar week selector, progress, quick capture, and a separate supporting rail
for classes and upcoming deadlines. Filters only change presentation. Date
navigation uses shared calendar-day arithmetic; task creation and completion
retain their existing owning services.

## View locally

From the repository root:

```sh
EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 EXPO_PUBLIC_LOCAL_PREVIEW=1 npm run web -w @campusflow/mobile -- --port 8097 --localhost
```

Open <http://localhost:8097> and select **Continue to preview**. This explicitly
labeled development preview uses disposable sample records and needs no API,
database, or Canvas connection. Task capture, completion, checklists, routines,
and event saving work in memory; reloading starts a fresh preview. Unsupported
operations show an error instead of claiming a successful save.

The adapter requires a development build, the explicit preview environment
flag, and the local-preview session token together. Ordinary app sessions keep
real authentication and API access. No backend, contract, schema, dependency,
or deployment changes are required.

Behavior coverage includes category filtering, task capture/completion,
calendar navigation across DST and year boundaries, sidebar routing and
session isolation, fixture validation, and both palettes' text contrast.

## Local validation

- Mobile TypeScript check and targeted ESLint pass.
- 157 tests pass across 11 focused suites covering Today, authentication,
  quick add, navigation, preview data, calendar navigation, and contrast.
- Metro successfully bundles the web app. Chrome review covers 1512px desktop
  and 390px phone layouts and both color schemes. Actual browser interactions
  complete a task (2/6 to 3/6) and capture a task (3/6 to 3/7) without errors.
- Native device rendering and live API flows remain a follow-up review.

## Interaction refinement

The second visual pass adds graphite navigation, mint/lime primary actions,
stronger Add task and Start focus buttons, focus-aware quick capture, subtle
hover/press springs, and a measured progress dial that animates after completion.
Avenir Next with system fallbacks supplies the geometric type treatment without
a font download or dependency. System reduced-motion settings disable animated
transforms and progress interpolation, including when the setting changes.

The frontend-design skill was installed locally and consulted. No runtime
dependencies, backend behavior, commits, or hosting changes were introduced.

Refinement validation: 147 tests pass in eight targeted suites, including four
new motion/progress behaviors and five new contrast pairs. Mobile TypeScript,
targeted ESLint, and diff checks pass. Live desktop/phone review and actual
completion/quick-add interactions report no browser errors. The existing server
stayed running throughout the refinement. Next: native phone interaction review.
