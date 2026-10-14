# Dependency release repairs and remaining exposure

This record covers the committed lockfile and clean installation, not a claim
that CampusFlow is production-ready or that an audit count equals exploitability.
The API, Expo SDK 55, Prisma 6.19 runtime and app contracts stay on the accepted
stack. Review [production readiness](production-readiness.md) separately.

## Reviewed repairs

| Dependency | Locked before → after | Consumer and verification |
| --- | --- | --- |
| `@nestjs/platform-express` / `multer` | 11.2.5 / 2.2.0 → 11.2.7 / 2.4.0 | Existing Nest 11 range; whole API behavior/HTTP tests and real release smoke. CampusFlow has no upload interceptor/handler, but the adapter imports this dependency. |
| `shell-quote` | 1.10.0 → 1.12.0 | React Native developer tools; safe quoting regression rejects newline tokens after a comment, without executing a shell. |
| `source-map-js` | 1.2.1 → 1.2.2 | PostCSS/Metro; normal indexed mapping and malformed/huge offset rejection tested, plus fresh web/Android exports. |
| `deepmerge-ts` | 7.1.5 → 8.0.2 | Scoped to `@prisma/config@6.19.0`; plain nested configuration, circular-input safety and actual Prisma config validation tested. |
| `effect` | 3.18.4 → 3.20.0 | Scoped to the same Prisma configuration loader; patched same-major API, real CLI generation/validation/migration. No Effect RPC server exists in CampusFlow. |
| `handlebars` | 4.7.9 → 4.7.10 | Existing ts-jest range; template compatibility/AST rejection and full transformer-driven test suites. |

Primary patch references:
[shell quoting](https://github.com/advisories/GHSA-pqg4-j6r4-53mv),
[multipart handling](https://github.com/advisories/GHSA-3pph-fpjx-jg34),
[source maps](https://github.com/advisories/GHSA-68fv-2mgg-jv7q),
[recursive merge](https://github.com/advisories/GHSA-ggr8-5vv4-36mx),
[Effect context](https://github.com/advisories/GHSA-38f7-945m-qr2g),
[template AST](https://github.com/advisories/GHSA-8r5x-fm3f-whwj) and
[template property access](https://github.com/advisories/GHSA-p8wg-vrv2-v86f).

The existing Prisma CLI moves from API dev dependencies to root dev tooling,
retaining version 6.19.0 and the existing workspace commands. Schema, migrations,
client and all database application code stay in the API. This makes its scoped
overrides effective: npm otherwise drops nested overrides crossing workspace
links ([upstream issue](https://github.com/npm/cli/issues/9659)). The single root
lockfile must actually resolve the patched versions; a decorative override is
insufficient. A clean install and CLI tests verify that resolution.

Deepmerge 8's documented breaking changes affect Map merging, custom metadata
types and `deepmergeInto`. Prisma's loader uses `deepmerge` with ordinary
configuration records; our configuration has no Maps/custom merge callbacks.
The public `deepmerge` export and CommonJS/ESM loading remain supported. See the
[upstream release](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0).
Reassess/remove these two overrides when upgrading Prisma; do not carry them
blindly across a major ORM migration.

## Unresolved advisories

Primary advisory records refreshed on 2026-10-14 still list no patched version
for braces, node-forge or sprintf-js. The decoder fix remains 0.5.0, and uuid
lists 11.1.1/12.0.1/13.0.1 as patched versions. This refresh does not establish
a compatible upgrade through the locked Expo/Xcode parents or resolve any of
the five release dispositions below. No dependency or lockfile is changed.

| Package/path | Current evidence | Release implication |
| --- | --- | --- |
| `braces` 3.0.3 through micromatch/Jest/Metro | [Upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched version; registry latest remains 3.0.3 | Deeply nested untrusted glob patterns can exhaust a tool process. App source exposes no glob-pattern endpoint. Keep build/test tools private and continue tracking a supported upstream fix. |
| `node-forge` 1.4.0 through Expo CLI/code-signing tools | [Upstream advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) lists no patched version; registry latest remains 1.4.0 | Malformed PKCS#1 signature verification is a tooling risk. No API/app source imports this package. Do not describe it as a remotely reachable CampusFlow API bug or as resolved; signing/OTA acceptance remains pending. |
| `decode-uri-component` 0.2.2 through query-string 7 / Expo Router | [Advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr); fixed 0.5 changes to ESM outside the parent's CommonJS `^0.2.2` range. Router 55.0.18 is the latest SDK 55 release checked on 2026-10-12. Its inspected callers use `stringify`; its incoming query parser uses `URLSearchParams`. Installed-parser regressions cover ordinary focus/account links and bounded malformed encodings with a throwing decoder canary. | These exercised parser/serializer paths do not invoke the older decoder. This does not remove the bundled dependency or prove all links, the mounted app, or hardware acceptance safe. Keep it tracked until a supported upstream fix and native malicious-link acceptance. Do not claim the mobile/web bundle clean. |
| `sprintf-js` 1.0.3 through argparse 1 | [Advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) lists no patch, including latest 1.1.3; parent restricts `~1.0.2` | Track a supported parser/toolchain repair; current app source does not take user format strings. |
| `uuid` 7.0.3 through xcode 3 | [Advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq); old iOS tooling range | Upgrade through a supported Xcode/Expo path and verify on a supported iOS host. App UUID validation and API ID generation do not use xcode's package. |

Do not force npm's suggested Expo 44 downgrade, override the entire SDK graph,
suppress findings or label the unresolved audit clean. Workspace-only `npm audit`
can still include shared/optional peer tool dependencies. Deployment verification
must inspect the actual installed/runtime package set and exercised paths; an
`--omit=dev` report alone is not a precise runtime exposure report.

## Repeatable verification

Audits refreshed on 2026-10-12 against the previously clean-installed, unchanged
lockfile (SHA-256 `1FCBC83D6D246F40D9D039D2732222EF4852E44AECF48053602693B754F06650`):

| Report | Before (critical / high / moderate / total) | After |
| --- | --- | --- |
| Full graph | 2 / 52 / 15 / 69 | 0 / 45 / 15 / 60 |
| `--omit=dev` | 1 / 48 / 15 / 64 | 0 / 41 / 15 / 56 |

The five remaining leaf advisories above account for these affected package
chains. The baseline is PR #61's lockfile; compatible parent upgrades also remove
unused `concat-stream`/`typedarray` entries. No forced downgrade or dependency
suppression is used.

Use the one root lockfile. Run clean `npm ci` (or explicitly skip lifecycle scripts
and then run the known Prisma generator), `db:generate`, isolated `db:migrate`,
`npm run check`, fresh web export, real read-only `release:smoke`, guarded
`release:restore-rehearsal`, and Android preview build/signature verification when
the native build graph changes. Never stop/replace an unverified running process
to unlock Windows modules; identify only the owned local QA API.

Refresh both `npm audit --json` and `npm audit --omit=dev --json`. The registry
audit reports affected package entries including parent chains, not independent
vulnerabilities. Keep raw reports ignored locally; commit only reviewed evidence.
Record the audited lockfile, timestamp, before/after counts and remaining leaf
advisories. Checks, builds and preview signing do not establish real device or
production-host acceptance.

## Validation for this repair

- Clean root `npm ci --ignore-scripts --no-audit`, explicit Prisma generation
  and isolated migration commands passed. Installed overrides are effective;
  the actual CLI loads and validates its patched configuration graph.
- `npm run check`: lint/boundaries/schema-manifest/types/build and 1,551 tests
  passed (456 API, 802 mobile, 97 contracts, 173 domain, 3 Android build-script
  and 20 release/dependency tests). Five new tests cover safe quoting, indexed
  map bounds, template AST rejection, circular merge and real CLI validation.
- Fresh web export plus real loopback API smoke passed health, CORS, identity,
  saved daily data and three actual entry/worker/WASM assets with SQLite
  isolation. Exported JS contains no synthetic QA credentials.
- Actual PostgreSQL 18.4 / official 18.6-client restore rehearsal matched all
  19 tables and 163 records, relationships/indexes and readiness, preserved the
  source and removed only its generated disposable restore.
- Fresh Android preview build and APK v2 signature verification passed. The
  packaged bundle has the chosen `http://localhost:3000` preview API origin and
  no synthetic credentials or web QA origins. SHA-256:
  `38FD169931781513EC63556413CF09C4A0DAF3A9990CBAC21883BA8EA65FCC9F`.
  ADB listed no attached device; native interaction and production signing
  remain unverified. The dependency repairs do not alter this app bundle's
  public behavior, and the preview hash matches the previous build.

Exact-head Linux CI must also pass clean installation, generation/migrations,
root checks, web export and real disposable-database restore before merge.

## Incoming-link release regressions

`apps/mobile/__tests__/router-release.test.ts` exercises the installed SDK's
`getStateFromPath` / `getPathFromState` with a representative configuration of
actual app routes. Eight cases preserve account navigation and focus task/Unicode
query data, round-trip unfinished/invalid/repeated bounded encodings and an
unknown segment, and preserve ordinary query data without changing object
prototypes. The mocked decoder throws on invocation, so a newly reachable old
decoder fails these checks. Reassess this SDK-specific harness after Router
upgrades. These are parser acceptance checks, not mounted-screen or device tests.

No runtime dependency is changed. The newer query-string release also changes
ESM exports, so substituting it beneath Router's current CommonJS import is not
a supported repair. No speculative native redirect hook is added: the exercised
links did not reproduce a crash. The existing signed preview remains the same
artifact; fresh device and HTTPS-host acceptance are separate release gates.

## Actual production-container dependency gate

On 2026-10-12 inspection of the built API runtime found that selected-workspace
`npm prune --omit=dev` had retained test tools and optional CLI peers. The same
filesystem inventory counts 438 installed packages in that image, including
Jest, Prisma CLI, `braces` 3.0.3 and `sprintf-js` 1.0.3. A production flag or an
API-only install command was insufficient evidence that these files were absent.

The disposable `production-dependencies` stage now restricts its workspace list
to API/contracts/domain and runs unfiltered pruning with dev, optional and peer
dependencies omitted. Required Nest peers are direct API dependencies. The
generated Prisma client and native query engine survive pruning; migration tools
remain available in the separate `build` image. The committed root manifest's
workspaces, package versions and single root lockfile are unchanged.
This uses npm's [documented dependency omission options](https://docs.npmjs.com/cli/v10/commands/npm-prune/),
without manually deleting transitive package directories or forcing upgrades.

The rebuilt runtime contains 106 inventoried packages, and none of the five
currently tracked leaf packages. Image size falls from 184,612,563 to 123,957,347
bytes (about 33%). This removes the observed toolchain paths from this API image.
All 106 inventoried versions match the committed root lockfile.
The mobile/build lockfile advisories and their release gates still apply. The
inventory is not a vulnerability scan, standardized SBOM, operating-system
package assessment or a claim that all future advisories are absent.

CI runs `scripts/runtime-dependencies.mjs` inside the final image as its unprivileged
user, with no network and a read-only script mount. It inspects root/nested/workspace
package directories, checks declared runtime dependencies without executing them,
requires compiled entries and the generated Prisma entry, rejects application
source/test/migration/mobile directories, and fails on the reviewed build/test
tool package families. Links must remain within the application; cycles and linked
workspaces are visited once. `--json` provides a local version/location inventory;
no application credentials or private records are read. The original image fails
with 45 policy violations; the rebuilt image passes.

Five fixture regressions cover a valid runtime, nested test/CLI/source leakage,
missing runtime dependency, linked/cyclic workspaces and an external package link.
Sixteen real HTTP requests to the read-only production container verify ordinary
login, closed signup, anonymous rejection, owned tasks/Today, revisioned journal
and private export using a separate synthetic owner. Generated Prisma queries
work without the CLI. The associated isolated database restore matches 23 tables/
30 synthetic records, preserves its source and removes only the disposable restore.
The Pixel's original owner and records are preserved. Native APK/runtime source
and remote deployment are unchanged by this packaging repair.
Full root lint/boundary/schema/type/test/build checks pass all 1,912 tests
(646 API, 930 mobile, 135 contracts, 173 domain, 3 Android-script and 25 release/
dependency tests). The separate migration image still loads Prisma 6.19.0 with
the expected Debian OpenSSL 3 engine target. Exact-head Linux CI remains the
merge gate; an unchanged native dependency graph does not require another APK.
