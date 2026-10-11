# Focus recovery

Extension of ToR 3.2, 4, 7 and 19, governed by ADR 007. Today shows a recovery
card when an account has an unsaved device block; Focus presents captured progress
and a clear resume/save/discard choice. Existing task deep links cannot replace it.

- A running block recovers paused at its last successfully written checkpoint.
  Closed-app time is excluded. Resume starts from that remaining duration; saving
  without resuming ends at the checkpoint. Completed checkpoints retain actual
  expiry. Background time continues while the original process remains alive.
- Pauses, breaks and unrelated accounts never add recorded focus time. No recovery
  action automatically saves history, completes a task or submits coursework.
- Frozen failed saves retain exactly the same request key/body after restart.
  Persist that body before sending to the API, including an explicit deleted-task
  detachment. Server idempotency handles a response lost after successful saving.
- Saved acknowledgement and explicit discard remove the draft. Logout or fresh
  login purges it, including renewed login for the same user. Async reads/writes
  must not recreate private data after those transitions.
- Validate account, version, timer bounds, task identity, checkpoint chronology
  and save consistency. Block new work until recovery finishes; show storage
  failures with retry. Preserve the last good checkpoint on device clock rollback.

Evidence: focus recovery pure, sync, card and screen tests; cache serialization
and session lifecycle tests. Root checks, production export and responsive visual
QA are required before merge. Native acceptance must separately exercise process
termination, cold offline reopening, same/different-account login, saved-response
loss, pause/resume, background expiry and deleted task recovery on Android/iOS.
