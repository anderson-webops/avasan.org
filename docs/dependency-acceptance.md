# Dependency acceptance

The static-compatible changes from canonical template v2.1.20 at
`08f40b830f461b081d7fc41b4266c39f508edc8b` are integrated under Avasan's
linear-history policy. Preserve the previously accepted parser, DevTools,
Archiver, HTTPS and native-lock protections. Shared API, worker, backend,
Netlify and service packaging surfaces remain inapplicable; the independent
static artifact, attestation and recovery contracts remain authoritative.

## Independently locked build tools

Use Node 26.13.0 and `node scripts/build-toolchain.mjs --print-bin` to prepare
and select the reviewed `webops-locked-npm-v1` build-only profile. Its frozen
installation, full/production audits, registry signatures and complete graph
check qualify npm 12.2.2, glob 14.0.3, minimatch 11.0.5 and Undici 8.12.4.
The stock Node npm may bootstrap that isolated profile; it does not qualify
the app. Paired npm/npx/Node commands retain the selected verified CLI.

`build-toolchain/UPSTREAM.json` records the original npm archive integrity,
every preserved CLI/documentation/license hash and the maintained archive/lock
digests. `npm run check:toolchain-package` reproduces the reviewed archive from
the original registry distribution. Both root and build-only graphs require
complete full/production audits, alongside the existing vendor checks.
The tagged Linux ARM64 acceptance receipt binds the profile inputs to exact
source. No build tools, dependencies or compiler enter the static runtime.

## Preserved compatibility and security boundaries

Nuxt DevTools 4.1.0 uses the tested Vite DevTools 0.8.2 host and kit. The unmodified Vue plugin's
9.0.0-rc.2 distribution declares the 0.7.6 API line. The frontend now directly
uses 0.8.2 while normal nested resolution supplies the original plugin's
separate supported 0.7 dependencies. Unhead 3 also requires the 0.7 kit API.
The root compatibility kit and explicitly hoisted npm layout preserve those
original peer contracts while the frontend uses 0.8.2. An incompatible nested
layout is rejected by the complete installed graph, rather than accepted merely
because installation exits successfully. Both APIs remain independently tested.
The former metadata-only peer patch and local archive are retired. The original
registry metadata, integrity and all 38 payload hashes remain checked against
`vendor/vite-plugin-vue-devtools/UPSTREAM.json`. The complete installed graph
must pass `npm ls --all` without forced or ignored peer ranges.

The actual Nuxt-selected Vite DevTools 0.8 integration initializes the plugin, serves its
exact UI and dock bytes, and transforms its actual injected HMR client over
loopback. That integration remains part of `npm test`; full Nuxt types, site
checks and artifact acceptance remain required. No provider version is forced
outside its declared range, and neither dependency warnings nor checks are
suppressed. The host test selects 0.8 explicitly through its public integration
API rather than silently accepting the root's compatible 0.7 provider.

The private qs 6.17.2-webops.4 patch is based on current upstream 6.17.1.
It retains that release's input-copy prototype protection and fixes native
comma-array coercion across realms. The source, license and compatibility
boundary are in `vendor/qs/UPSTREAM.md`. The installed CommonJS files and all
three browser interfaces pass the same security and ordinary-input fixtures.
The locked build reproduces both the browser distribution and local npm archive.
Overflow appends retain exact decimal indexes beyond the safe integer range,
including merged and shifted containers, without losing prior values. This
correctness repair is distinct from the numeric-side-channel prototype alert;
prototype and ordinary parsing regressions remain required.
Indexes outside JavaScript's array-index range retain object representation
even with large or infinite configured limits. Prefix/append, sparse modes,
ordinary/null prototypes and strict limit behavior are regression-tested;
ordinary small arrays retain their representation.

Intrinsic-array coercion reads each index once and converts it before reading
the next index. This prevents changing getters from bypassing normalization and
preserves conversion-driven mutations, fixed initial lengths, sparse separators,
cycles, repeated aliases, custom hooks and original exceptions. The regressions
cover both comma serialization and custom encoders delegating to the default
encoder, across the installed CommonJS and three browser distributions.

Packing normalizes only its disposable public-library copy to 0644 files and
0755 directories, so private source checkouts keep their original permissions
without changing archive bytes. Archive and installed-file comparisons use
bounded equality checks rather than formatting binary diffs. Regressions cover
a 0600 checkout, a 0077 builder umask and rejection under a 256 MiB Node heap.

The local archive at `vendor/qs-6.17.2-webops.4.tgz` is a source installation
input for development-tool dependencies. Avasan publishes static files only;
the archive, compiler, dependencies and source are absent from the runtime.
Its existing artifact layout and retained-release verification remain unchanged.

Avasan has no backend or standalone TypeScript compiler command. Vue and
typescript-eslint require the TypeScript 6.0.3 compiler API. The current
`vue-tsc@3.3.14` uses `typescript/lib/tsc`, which TypeScript 7 no longer exports;
typescript-eslint also declares support below 6.1. Preserve that genuine API
boundary and the full real Vue typecheck rather than installing an unused
backend compiler. Workspace installation declares the matching Vue SFC compiler
directly, with parsing and version regressions. No compiler is packaged.

Nuxt uses 4.6.4. The existing version-scoped exception retains `unimport@7.0.1` while
7.0.2's advertised npm provenance endpoint returns 404. Version 7.0.1 has
retrievable provenance. Full registry-signature and provenance verification
remain required; the unavailable attestation is not treated as a pass.

The upstream patch changes class-export declaration generation and an unused
TypeScript parameter. Clean installation, Nuxt auto-import/type checking,
application tests and the generated site must pass with this scoped exception.
Remove the exception after a compatible successor has verifiable provenance.

The frontend's c12 dependency remains on the stable 3.3 API required by its Nitro 2 dependency.
The newer 4.0.0-rc.4 distribution is a prerelease outside that parent range;
evaluate it with a compatible framework update rather than forcing its API.

The local deepmerge fork preserves both published entrypoints while defining
destination keys as own data properties. Its package provenance and compatibility
boundary are recorded in `vendor/deepmerge/UPSTREAM.md`; the security regressions
and complete consumer-lock assertions remain part of `npm test`.

Glob 14.0.3 and Minimatch 11.0.5 replace vulnerable older transitive majors.
Nitro 2.13.6 now uses Archiver 8's named `ZipArchive` API directly. Unmodified
Archiver 8.0.0 replaces the obsolete local default-factory bridge. Both the root
and actual Nitro consumer resolve the reviewed modern version and create real
ZIP/TAR streams in the regressions. Complete graph, file-matching, Nuxt build
and artifact checks remain required across this major-version integration.
The root workspace lock covers all build and development dependencies; there
is no backend workspace or separate backend graph. Both full and production
root and vendored-qs audits are required before artifact packaging. Shared API,
worker, Netlify and service-promotion surfaces are intentionally inapplicable.
The existing static attestation, snippet and retained-artifact recovery gates
remain authoritative, with no new scan schedules or host topology changes.
