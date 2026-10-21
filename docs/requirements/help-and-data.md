# Help and data center

Students need a readable explanation of planning, offline limits, reminders and
their saved information before and after sign-in. This workspace supports the
existing workflows; it does not replace an approved public privacy policy.

## Behavior

- `/help` is a public standalone screen with system-bar safe areas. Only that
  exact route bypasses the account gate; private and unknown routes still require
  sign-in. Account actions keep the existing `/auth?next=account` continuation.
- Sign-in and Settings link to Help. Leaving sign-in through Help clears the
  entered password and is disabled while authentication is pending.
- Ten bundled answers cover Today, classes, manual coursework, preparation,
  explicit focus saving, offline reads, local reminders, saved records, JSON
  export and account deletion. They remain available without an API response.
- Three topics and a local, case-insensitive search filter answers together.
  Every whitespace-separated search word must match question, answer or keywords.
  Search is limited to 100 characters and is not persisted or sent to support.
  Filters/search collapse the current answer; one answer opens at a time.
  Empty results offer a reset of both search and topic.
- Signed-in students can open the existing task/planner/coursework/preparation/
  focus/settings workflows. Signed-out readers see Account & privacy, whose
  existing sign-in gate protects export and deletion. Navigation waits for
  restored-session initialization.
- Answers accurately disclose no queued offline writes, explicit focus saving,
  uncertain closed-app time, per-device reminder refresh, optional check-in data
  sent when saved, server-saved export and separate offline copies/exported files.
  No server backup/log retention period is invented.

## Published links

The hosted web build (`scripts/build-hosted-web.mjs`) sets
`EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_SUPPORT_URL`
to the pages in `apps/mobile/public/legal/`, which ship in the same export. It
refuses an export missing any of them. Native builds set the same variables to
the hosted URLs. Help offers all three, and sign-up shows a consent line linking
the terms and privacy policy only when both are configured. Expo configuration rejects configured
values that are not HTTPS website URLs, exceed 2,048 characters, contain surrounding
whitespace, credentials, query parameters or fragments, or use local/IP hosts.
Diagnostics identify the configuration field without echoing its value.

The screen also validates links before rendering. Missing links are explicitly
unavailable in the preview; no placeholder policy or support address is opened.
A user tap opens only the configured URL in the browser, without adding account
records or search text. Concurrent taps are guarded; failures show a generic
retry message. URL validation proves syntax, not availability or owner approval.

Metro partitions environment-dependent transforms by API, privacy and support
URLs, including native CI builds where Expo ignores cache-reset requests. A fresh
build is required after changing public configuration.

## Evidence

| Requirement | Automated evidence |
| --- | --- |
| Public exact route; private/unknown routes remain protected | `account-gate.test.tsx`, `router-release.test.ts` |
| Sign-in entry, pending guard and cleared password | `auth-recovery-entry.test.tsx` |
| Topics/search/reset, accordion, account/session actions and safe external opening | `help.test.tsx` |
| URL rejection/redaction and actual Expo configuration preflight | `published-links.test.ts` |

Local exported-app browser checks at 320/390/1,280px verify wrapped controls,
search/topic intersection, empty-state reset, keyboard accordion activation,
public account continuation, sign-in Help/password clearing and private planner
redirection. A fresh Android preview builds and is inspected separately. These
checks do not establish Android/iOS touch, screen-reader, system-bar or external
browser acceptance; the native geometry script includes Help for device testing.
Approved published policy/support pages, retention decisions and accurate store
data declarations remain production gates.
