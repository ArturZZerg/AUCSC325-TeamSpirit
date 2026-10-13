# Add work directly to Today

Extends ToR 4 (the daily plan), 7 (personal tasks) and 19 (cached access). Today's
prominent **Add a task to this day** action opens the existing task editor with
the displayed calendar day as its editable, date-only schedule. It works on a
selected planner day and does not require Canvas or a successful Today read.

Scheduling chooses when to work. No deadline, timed instant, recurrence,
completion, Main Goal or reminder is invented. A student may choose a separate
deadline, change/remove the schedule and add an estimate through the same editor.
The captured date remains visible in the form if the live day rolls over while
typing; cancelling and reopening starts fresh on the current displayed day.

Only an explicit Save writes through the existing `POST /tasks` service, which
refreshes account query data. Today remains a derived read model. Offline reads
stay available; a failed write retains its editable draft and offers explicit
retry. A native fetch failure describes an unconfirmed save and asks the student
to check connection and saved tasks before retrying; a lost acknowledgment must
not imply the server wrote nothing. Cancelling creates nothing. Pending writes
block duplicate taps and dismissal. The existing keyed tab-session boundary clears private drafts on
account switch, sign-out or a new login of the same account.

Behavior evidence: eight Today/editor integration tests and three real retained
tab-session tests, plus the existing task/date/cache/editor/Today regressions.

Local root lint/boundary/schema/type/test/build checks pass 1,983 tests: 646 API,
977 mobile, 135 contracts, 173 domain, 27 Android tooling and 25 release. The root
lockfile is unchanged. No API, schema, dependency or architecture change is made.

On the isolated API 36 emulator, the signed capture preview
`7CBCB47987B3B9F32E4828A26BEB6EA381E02D88D9A6290491D8724F63DCCD38`
creates one task with a 20-minute estimate, scheduled date 2026-10-12, empty
deadline and no reminder. It appears immediately in Today; authoritative task
and Today reads independently confirm it. A selected 2026-11-01 DST calendar day
prefills correctly, and cancelling creates no additional task.

Offline cold startup restores the saved task/schedule. A native offline save
retains the editable title/date instead of claiming success. The observed fetch
diagnostic prompted the revised message above. The final signed x86 preview
`852BBFD749F34CEA270A26FCF4910A591AC5054A71B185F67E1159DE87D331CF`
passes actual architecture/25-permission/v2-signature/current-code gates and
excludes nine known synthetic credential/session values. It installs, cold-restores
the saved task and exercises the revised message/draft retention. Cancelling
that draft leaves the server task count at one; the separate Pixel owner's export
fingerprint remains unchanged. Emulator API forwarding is restored afterward.

These observations use a separate synthetic account and localhost production
API; source and evidence stay local. Physical/older Android, iOS, hosted HTTPS,
real mail, public policies, production signing and store acceptance remain gates.
Exact-head PR/push CI and post-merge main CI remain required for delivery.
