# CampusFlow implementation plan

Source: `ToR.docx` version 0.2. `tor-extracted.txt` is a text extraction for
implementation lookup; the original document remains authoritative.

| ID | Objective and ownership | Depends on | Model and reason | Output and verification |
| --- | --- | --- | --- | --- |
| CF-1 | Shared DTOs, date/recurrence rules and daily plan; packages/contracts and packages/domain | Architecture baseline | Terra: related domain and validation code | Strict schemas and deterministic pure functions; Jest boundary and behavior tests |
| CF-2 | Identity, persistence, feature services and providers; apps/api | CF-1 interfaces | Sol: security and cross-system synchronization | NestJS API, Prisma schema/migration, API/provider tests |
| CF-3 | Five-tab application, forms, cache and notifications; apps/mobile | CF-1 interfaces and CF-2 route agreement | Terra: normal mobile implementation | Expo app, component and service tests, Maestro scenario |
| CF-4 | Workspace, CI, integration and requirement traceability; root and docs | CF-1 through CF-3 | Coordinator for interfaces; owning worker for fixes | Reproducible lockfile, lint/typecheck/test/build and honest release gates |

Workers own disjoint directories. Shared contract changes are communicated before
integration. No cloud resources, paid services or production data are provisioned.

## Scope interpretation

Implement required ToR sections 3–13, 15 and 17–19. Sections 14, 16 and 20 and
items explicitly described as future or not required remain a recorded backlog:
morning/evening summaries, student-life directory, gamification, custom categories,
automatic priority/scheduling, health integrations and social features.

## External acceptance gates

- Institutional Canvas developer key, approved scopes, registered callback and
  authorized test account. Fixture results cannot satisfy the live Canvas gate.
- At least one verified usable campus event feed; fixtures demonstrate behavior
  without representing real campus listings.
- PostgreSQL migration/integration run and real iOS/Android device validation,
  including notification permissions, delivery and offline startup.
- Production deployment configuration, TLS and account recovery/onboarding policy.
