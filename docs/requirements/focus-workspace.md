# Focus workspace

Product extension of ToR 3.2/7 (personal study tasks) and 4 (the daily workflow).
Reach Focus space from Today, or Focus from an open one-time task in Today/Tasks.
Choose a task or study freely; select 15/25/50 minutes or use a task's estimate
(capped at 90 minutes per block). Pause/resume, explicitly end/reset, take a
five-minute break, or start another block. Completion is a separate API action.

The timer and selected task are transient mobile UI state in Zustand. They
survive navigation and backgrounding within the running app, with no new server
entity, persisted history, storage or dependency. An absolute end instant avoids
interval drift: background time counts, paused time does not, and returning
after expiry shows completion once. The UI interval is suspended in background.
App termination discards the session; this is stated on screen. No notification
delivery is promised. Logout, account switch and renewed login clear the timer
and private target immediately; stale-session callbacks cannot configure it.

Task selection uses account-scoped validated task reads. Completed, recurring,
unknown and foreign-account task IDs do not become completion targets. Recurring
occurrences continue to use Today. Existing active sessions take precedence over
new task deep links. Task completion requires an explicit tap, validates the
latest available task, uses the existing authenticated API action, guards rapid
repeat taps and retains retry after failures. No timer transition completes a
task or submits coursework automatically. Free focus works without network data.

Evidence: `focus-timer.test.ts`, `focus-store.test.ts`, `focus.test.tsx` and Today
navigation assertions. Run root checks and Expo export, then verify the phone
layout. Real-device background/process behavior remains a release acceptance gate.
