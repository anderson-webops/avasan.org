# Repository Guidelines

Shared Sites policy (`../AGENTS.md` when available) applies. These essentials also apply in standalone checkouts:
- Never SSH, SCP, SFTP, tunnel to, or configure access to production. Do not deploy it; protected server-side automation owns activation, and source delivery alone does not prove deployment.
- GitGuardian quota, authentication, network, or service failure is not a commit/push blocker. Review outgoing changes, run another available local secret scan, preserve other hooks, and stop on real secret findings.
- Commit small, coherent, validated changes frequently as work progresses and push completed work through this repository's authorized source path, usually its default branch; use pull requests only when required.
- Group related changes into meaningful deployable milestones. Align version metadata, create a new immutable annotated semver tag, and publish its matching verified GitHub release with the required accepted artifacts.
- Complete finished deployable work through the published release consumed by protected deployment. Independently verify public release identity and acceptance read-only, or report the exact remaining blocker. Never move published tags or replace published release assets.

## Project Structure & Module Organization

- `front-end/` contains the Nuxt 4 application. UI lives in `src/components`, layouts in `src/layouts`, routes in
  `src/pages`, composables in `src/composables`, constants in `src/constants`, and Nuxt config in `nuxt.config.ts`.
- `deploy/nginx/http-maps.conf`, `deploy/nginx/server-policy.conf`, the
  standalone `deploy/nginx/default.conf`, and `deploy/direct/` define the single
  supported native static deployment surface and its security headers.
- Root files (`package.json`, `tsconfig.base.json`, and `eslint.config.js`) define the shared front-end toolchain.
  Direct static release helpers live under `deploy/`.

## Site Scope

- Keep the public site intentionally small: one homepage for Julio as a grade-school math and computer science
  teacher, with a primary link to `https://cs.avasan.org` and a secondary link to `https://math.avasan.org`.
- Do not add navigation, booking, testimonials, course catalogs, contact forms, or extra routes unless the user asks.
- Preserve the Vitesse-derived typography, color-mode support, responsive layout, and accessible interaction states.
- Keep the site static and tracker-free. Do not add analytics, a server workspace, runtime API configuration, or third-party scripts without an explicit product decision.

## Build, Test, and Development Commands

- `npm ci` installs the committed workspace dependencies. Use npm at the repo root; do not mix package managers for normal
  development.
- `npm run dev` starts the Nuxt front-end on port `3333`.
- `npm run typecheck` runs the Nuxt TypeScript check.
- `npm run lint` runs ESLint on the front-end workspace.
- `npm run build` generates the static front-end to
  `front-end/.output/public` and verifies the one-page deployment contract.
- `npm run test:static` verifies the generated site, absence of trackers and a
  runtime API, branded strict-404 behavior, and security headers.

## Coding Style & Naming Conventions

- Follow the repo ESLint configuration. Front-end files use the upstream
  Nuxt/Vitesse formatting style and root scripts follow the shared rules.
- Prefer descriptive component and composable names. Use PascalCase for Vue components and camelCase for utility and
  composable exports.
- Keep route-facing files in `src/pages` aligned with Nuxt’s file-based routing conventions.

## Testing & Verification

- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run a11y`, both audit commands, the
  production dependency-graph check, and the native-binding verifier before delivering site changes. `npm test` includes the production build and static-deployment check.
- Treat homepage regressions as high impact because this single page is the site’s entire public experience.

## Template Workflow

- `template` points to `anderson-webops/vitesse-nuxt-template`, the validated source this site was initialized from.
- `origin` is the published `anderson-webops/avasan.org` repository.
- Review template updates before merging them so site-specific content and metadata are preserved.

## Dependency & Lockfile Discipline

- Keep the root `package-lock.json` aligned with every workspace manifest. For dependency changes, review production and development packages, regenerate and include the lockfile, and run a clean root `npm ci` (not an install fallback), both audits, and the validation gates above.

## Static artifact and recovery acceptance

- Adopt shared template fixes selectively; its API/worker runtime is not needed here.
- For release changes, run the Linux ARM64 `scripts/package-static-release.sh`
  against the clean annotated candidate after the source gates. Verify the exact
  unpacked archive and a copied tree with the published manifest. Keep both
  sidecars outside the public root and preserve the public revision/version shape.
- Run `scripts/test-attested-promotion.sh` as an unprivileged user in a disposable
  Linux environment. Its UID0 namespace and command stubs test the installed
  promoter without production access. Never run the fixture directly against a host.
- Preserve existing snippets, ownership, ports, listeners and the prior release;
  retain protected backups if rollback fails. No application writable state is
  required. Consult `docs/static-artifact-contract.md` for recovery limits.
- The release source gate requires main and its annotated version tag
  to match exactly. Include release documentation in that source commit; do not
  advance main with an evidence-only commit that makes the release gate fail.
