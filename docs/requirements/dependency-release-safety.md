# Production dependency release safety

Status: PR #62 merged after author self-review, local validation and both
exact-head Linux CI checks passed, following release-readiness PR #61.

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
