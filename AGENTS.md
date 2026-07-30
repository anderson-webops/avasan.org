# Repository Guidelines

## Project Structure & Module Organization

- `front-end/` contains the Nuxt 4 application. UI lives in `src/components`, layouts in `src/layouts`, routes in
  `src/pages`, composables in `src/composables`, and app-level config under `src/config` and `src/constants`.
- `sites/worker.js`, `netlify.toml`, and `deploy/nginx/default.conf` define the
  supported static deployment surfaces and security headers.
- Root files (`package.json`, `tsconfig.base.json`, `eslint.config.js`,
  `Dockerfile`) define the shared front-end toolchain and deployment defaults.

## Site Scope

- Keep the public site intentionally small: one homepage for Julio as a grade-school math and computer science
  teacher, with a primary link to `https://cs.avasan.org` and a secondary link to `https://math.avasan.org`.
- Do not add navigation, booking, testimonials, course catalogs, contact forms, or extra routes unless the user asks.
- Preserve the Vitesse-derived typography, color-mode support, responsive layout, and accessible interaction states.

## Build, Test, and Development Commands

- `npm install` installs all workspace dependencies. Use npm at the repo root; do not mix package managers for normal
  development.
- `npm run dev` starts the Nuxt front-end on port `3333`.
- `npm run typecheck` runs the Nuxt TypeScript check.
- `npm run lint` runs ESLint on the front-end workspace.
- `npm run build` generates the static front-end to
  `front-end/.output/public` and verifies the one-page deployment contract.
- `npm run test:static` verifies the generated site, absence of trackers and a
  runtime API, security headers, and Sites project identity.

## Coding Style & Naming Conventions

- Follow the repo ESLint configuration. Front-end files use the upstream
  Nuxt/Vitesse formatting style and root scripts follow the shared rules.
- Prefer descriptive component and composable names. Use PascalCase for Vue components and camelCase for utility and
  composable exports.
- Keep route-facing files in `src/pages` aligned with Nuxt’s file-based routing conventions.

## Testing & Verification

- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run a11y`, both audit commands, the
  production dependency-graph check, and the native-binding verifier before pushing site changes.
- Treat homepage regressions as high impact because this single page is the site’s entire public experience.
- Keep the application static. Do not add analytics, a server workspace,
  runtime API configuration, or third-party scripts without an explicit product
  decision.

## Template Workflow

- `template` points to `anderson-webops/vitesse-nuxt-template`, the validated source this site was initialized from.
- `origin` is the published `anderson-webops/avasan.org` repository.
- Review template updates before merging them so site-specific content and metadata are preserved.

## Agent Delivery Workflow

- Do not leave completed work uncommitted. After each coherent, validated change set, create a commit and push it in
  the same session.
- Keep `package-lock.json` synchronized with dependency changes before every commit or push.
- Prefer small, logically grouped commits over one mixed commit.

## Dependency & Lockfile Discipline

- Treat the repo-root `npm ci` path as the source of truth for deploy readiness.
- Any time `package.json`, any workspace `package.json`, dependency ranges, `package-lock.json`, or dependency update tooling changes, verify lockfile parity from the repo root before committing.
- Do not rely on `npm install` fallback as success. A change is not deploy-ready unless root `npm ci` succeeds.

Required production/dev dependency update flow before every dependency commit:
1. Check production and development dependency freshness from the repository root with `npm outdated --workspaces --long` or the repo's documented equivalent.
2. Review both `dependencies` and `devDependencies` in the root and every workspace package; do not limit updates to production-only packages.
3. Apply needed updates with the narrowest command that updates the relevant manifest and lockfile together, such as `npm install -w <workspace> <package>@<version>` or `npm install -D -w <workspace> <package>@<version>`.
4. If the update is only a lockfile/security refresh, regenerate from the root with `npm install --package-lock-only --ignore-scripts --no-fund --no-audit`.
5. Run `npm audit` from the repository root and resolve remaining production or dev advisories before committing unless a documented upstream limitation prevents it.

Required dependency verification before every commit/push:
1. Run `npm ci` from the repository root.
2. Run `npm run lint`.
3. Run `npm run typecheck`.
4. Run `npm test`.
5. Run `npm run build`.
6. Run `npm run test:static`.
7. Run `npm run audit`.
8. Run `npm run audit:production`.
9. Run `npm run verify:dependency-graph`.
10. Run `npm run verify:native-bindings`.

If `npm ci` fails because `package.json` and `package-lock.json` are out of sync:
1. Run `npm install --package-lock-only --ignore-scripts --no-fund --no-audit` from the repository root.
2. Re-run `npm ci` from the repository root.
3. Commit the resulting `package-lock.json` change with the related dependency/package change.

Never commit or push dependency/package changes if root `npm ci` fails.
