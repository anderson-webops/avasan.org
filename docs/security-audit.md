# avasan.org security and workflow audit

## Scope and architecture

`avasan.org` is a public, statically generated teaching homepage. The source has no user accounts, administrator
console, sessions, roles, authorization rules, forms, cookies, analytics, runtime API, database, or secrets.
Authentication, account promotion, and account demotion are therefore not applicable to this repository.

The supported source-owned delivery paths are the Sites worker, Netlify static hosting, and direct Nginx static
hosting. The linked `cs.avasan.org` and `math.avasan.org` applications are separate repositories and security
boundaries.

## Remediated findings

- Kept the application account-free, tracker-free, backend-free, and limited to its single intended homepage.
- Updated compatible development tooling majors while retaining TypeScript 6 because the installed
  `typescript-eslint` release supports TypeScript below 6.1.
- Replaced Nitro's deprecated Archiver 7 transitive path with a focused, tested compatibility bridge that delegates to
  Archiver 8 while preserving the factory API Nitro 2 still imports. The local bridge has a semver-compatible identity,
  is pinned by repository tests, and remains distinguishable from public registry code.
- Pinned Node, npm, and GitHub Actions. Lifecycle scripts are denied by default and narrowly approved
  by exact package version; Puppeteer's download script remains disabled because validation uses an explicitly located
  browser.
- Preserved every GNU and musl Linux ARM64 native binding in the lockfile and added a real ARM64 clean install/build
  gate. The verifier now discovers the complete binding set from the lockfile instead of maintaining brittle paths.
- Added full and production-only vulnerability audits, production dependency-graph validation, repository tests,
  registry-signature verification, accessibility checks, and grouped weekly Dependabot updates.
- Enabled GitHub vulnerability alerts, automated security fixes, secret scanning with push protection, CodeQL default
  setup, read-only workflow permissions, and immutable-SHA enforcement for Actions.
- Tightened each source-owned deployment policy with a fail-closed `/api`, non-GET method rejection where the platform
  permits it, immutable hashed assets, no-cache HTML, framing denial, opener/resource isolation, HSTS, and a restrictive
  content security policy.
- Bundled the Sites homepage into its worker and removed direct HTML assets from that deployment artifact. This prevents
  the Sites static-asset fast path from bypassing the worker-owned security headers.
- Removed SPA-style unknown-route fallbacks from Netlify and Nginx so unrecognized paths return a real 404.
- Added a minimal `/release.json` containing only the semantic version and full
  source commit. Netlify and Nginx serve the generated file, while the Sites
  worker bundles the same content; all three delivery paths mark it
  `Cache-Control: no-store`.
- The separately managed custom host may normalize `/release.json` to
  `Cache-Control: no-cache`. Its post-deploy check accepts that policy because
  it requires revalidation before reuse; the source-owned surfaces continue to
  require and test `no-store`.
- Added a manual custom-domain deployment check that requires an expected
  version and full revision, then verifies release identity, strict response
  headers, allowlisted links, absence of external scripts, unknown-route 404s,
  unsupported-method 405s, and the fail-closed API boundary.
- Enabled source tests that prevent silent reintroduction of accounts, forms, trackers, runtime configuration, or a
  backend workspace.
- Disabled persisted Git credentials on every workflow checkout.
- Removed the production Docker image and registry path. Direct Nginx releases now require a clean unprivileged build,
  preserve exact release metadata, promote through an atomic symlink, compare the served identity, and automatically
  restore the previous release after a failed validation.
- Replaced container CI with a loopback static preview that exercises the same strict method, routing, cache, header,
  hidden-file, and release-identity contract.

## Reviewed upstream development metadata

The refreshed lockfile resolves Nuxt 4.5.1, Vite 8.2, and one compatible Rolldown 1.2 line. Nuxt's tab-completion helper
uses Commander 15 through its declared optional peer, while incompatible `cac` majors stay correctly nested and its
optional `cac` 6 peer remains absent. Both the full development graph and production graph now pass `npm ls`.

## Production and operator boundaries

The source repository and Sites deployment do not automatically replace the
custom-domain Nginx deployment. Promoting a build there remains a separate,
authorized server operation. A deployment must preserve the generated
`release.json` and must not record success unless its version and revision
match the intended source.

After promotion, run the manual `Verify production deployment` workflow with
the intended version and full commit. Do not describe the custom domain as
current merely because source validation or a private Sites deployment passed;
the custom-domain smoke must also pass.
