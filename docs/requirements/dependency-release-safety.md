# Production dependency release safety

Status: PR #62 merged after author self-review, local validation and both
exact-head Linux CI checks passed, following release-readiness PR #61.

Current Xcode/UUID follow-up: keep Xcode 3.0.1/Expo SDK 55 and scope UUID 11.1.1
to that consumer, declaring the existing generator as root dev tooling so npm
honors the workspace override. Require real clean installation and consumer
resolution, project generation/write/reparse, ordinary UUID output and rejection
of unsafe caller buffers. The pre-patch bounds regression must fail. Record
60 → 53 full / 56 → 49 dev-omission affected entries without calling the four
remaining leaf advisories clean. Full checks, fresh web/Android artifacts,
exact-source native iOS proof, production-container/restore CI and review remain
required before merge. No application, API, schema or framework migration.

The pre-repair 2026-10-11 installed-lockfile npm audit (`--omit=dev`) reported 64 affected
package entries: 1 critical, 48 high and 15 moderate. These totals include parent
packages and toolchain dependencies brought in by Expo/React Native; they are not
64 independent exploitable application paths. Assess actual dependency paths and
usage before describing runtime exposure. The
[shell-quote advisory](https://github.com/advisories/GHSA-pqg4-j6r4-53mv)
and [multer advisory](https://github.com/advisories/GHSA-3pph-fpjx-jg34)
were checked against the primary GitHub advisory records.

Inspect the API runtime and mobile/native/web build toolchain separately. Apply
supported compatible patches through the one root lockfile. Preserve the accepted
NestJS/Prisma/Expo architecture, SDK 55 compatibility, strict boundaries and public
contracts. Do not accept npm's suggested Expo 44 downgrade or use a forced audit
repair. Justify any narrowly scoped override with the upstream supported API and
the precise affected/fixed range; avoid blanket overrides or an unrelated major
framework migration.

Verify clean installation, Prisma generation/migration and schema-manifest
freshness, root checks, actual API/release smoke and restore. Export fresh web and
build/verify the Android preview when native/toolchain changes require it. Existing
signed-device/iOS/production-host gates remain unverified. Record before/after
advisories, supported fixes and unresolved verified risks without calling an
unreachable toolchain advisory a remotely exploitable API bug.

Complete branch/PR/author self-review/exact-head CI/merge. Then continue account
recovery with production mail disabled until the owner configures and verifies
the chosen provider. Hosting, email, signing and store details remain pending.

See the [repair/exposure record](../development/dependency-safety.md) for precise
dependency paths, narrowly scoped Prisma CLI overrides, unresolved upstream
advisories and clean-install/app/build/smoke/restore evidence. Full audit affected
entries fell from 69 to 60; `--omit=dev` from 64 to 56. Both now report zero
critical entries. A 2026-10-12 refresh of the unchanged repaired lockfile confirms
these counts. This does not make the remaining audit or production gates clean.

Retain installed-Router regression coverage for ordinary account/focus links,
bounded malformed URI data, serialization and object-prototype preservation.
Make these checks fail if the older bundled decoder is invoked by an exercised
path. Parser coverage does not replace signed-device incoming-link acceptance
or resolve the advisory. Upgrade the decoder through a supported Router/SDK
dependency path rather than an incompatible ESM override.

The production-container gate must inspect the actual installed files, not infer
their absence from npm dev flags. The final API image must resolve the declared
API/shared runtime dependencies and compiled/generated Prisma entries, without
shipping source/tests/migration tooling/mobile files or the reviewed build/test
package families. Inventory nested packages and bounded workspace links without
executing dependency code; reject links outside the application. Exercise the
unprivileged read-only image against real PostgreSQL after any pruning change.
Retain migration tooling in its separate build target. See the dependency record
for the observed old-image regression and current runtime/restore evidence;
this does not resolve mobile/build advisories or establish hosted acceptance.
