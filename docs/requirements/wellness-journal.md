# Wellness check-in journal

Source: ToR section 15, optional non-medical wellness and basic history.
Decision: [ADR 012](../adr/012-wellness-journal.md). Native Android/iOS remains
the primary product; this feature introduces no PWA or extra tab.

| ID | Student-visible requirement | Verification |
| --- | --- | --- |
| JOURNAL-01 | Review actual saved-day values before editing; missing ratings start blank, all ratings are optional and note-only entries are supported | Mobile editor/screen; API journal DB; contracts journal |
| JOURNAL-02 | Complete bounded account/date/zone reads remain usable from validated cache; missing/wrong/partial data is unavailable, saved empty coverage is known absence at capture | Mobile queries / reflection / screen; API journal DB; contracts journal |
| JOURNAL-03 | Concurrent create/edit/delete and stale identity/revision cannot replace or erase another saved version; legacy creation cannot bypass reviewed edits | API journal DB; contracts journal; mobile editor |
| JOURNAL-04 | Failed and uncertain replies retain private drafts and expected versions; current server reconciliation can confirm matching fields/absence or require explicit latest-version review | Mobile editor; queries; API journal DB |
| JOURNAL-05 | Seven/thirty-day reflection uses only recorded ratings, with separate metric sample counts and visible blank days; notes/date search stays in the visible window | Mobile reflection / screen; contracts journal |
| JOURNAL-06 | Calendar browsing, future-save rejection and midnight/resume behavior use the account's IANA calendar; an open edit keeps its reviewed date | API journal DB; mobile reflection / screen; existing Today clock/domain date tests |
| JOURNAL-07 | Account/token transitions discard private UI state and suppress late callbacks; pending writes block repeat submission/dismissal; dirty cancellation and deletion are confirmed | Mobile screen / editor / queries; existing retained-tab/session tests |
| JOURNAL-08 | Confirmed writes/reconciled replies clear this account's legacy and journal-range caches before refresh; cleanup failure reports confirmed server success with a device retry, without repeating the write | Mobile cache / queries / editor |
| JOURNAL-09 | Notes remain owner-private, excluded from routes/logs; owned export and whole-account erasure still include every entry; in-flight writes cannot recreate erased data | API journal DB / account DB; mobile screen / queries |

The workspace retains five tabs, existing native primitives, the moss/sage palette,
labelled wrapping controls and 46px-or-larger targets. Existing goals/routines and
breathing remain available. The numeric inline form/unbounded history is replaced
by a saved-day summary and a focused journal. Daylio's official description of
tap-based entries, optional notes and browsable history informed the interaction
choice: https://daylio.net/. No branding, artwork, medical/causal claims or its
local-only privacy model are copied.

Journal cache keys include owner, range and zone. Capture time describes the last
complete read; a separately confirmed change can be included when wider refresh
fails, with explicit saved-history copy. Server writes stay online and version
checked. Lost replies never trigger a blind replacement or a newly guessed base.
Other devices' offline copies can persist until refreshed. Local cleanup failures
remain visible until retried; no promise of backup/log erasure is added.

Local implementation and acceptance pass on `codex/wellness-journal`; exact
test, running API, restore and artifact evidence is recorded in `ai/TASK_STATE.md`.
Hosted CI and review precede merge. Production migrations, hosting and native
hardware acceptance remain separate release gates.

Before native release, verify on Android and iOS that the keyboard and labelled
ratings remain usable on a narrow screen; a saved note and optional ratings
survive reopening; a previously loaded range is readable offline; failed edits
keep their draft; and a second device's edit requires reviewing the latest
version. Confirm deletion, account switching, screen-reader selection and
midnight/resume behavior on hardware. Browser fixture interactions and local
HTTP/database tests do not substitute for these device checks.
