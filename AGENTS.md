# Repository Guidelines

## Project Structure & Module Organization

- `front-end/` contains the Nuxt 4 application. UI lives in `app/components`, layouts in `app/layouts`, routes in
  `app/pages`, composables in `app/composables`, and app-level config under `app/config` and `app/constants`.
- `back-end/` contains the standalone Express API. Keep route wiring and middleware in `src/`, and emit compiled output
  to `dist/`.
- Root files (`package.json`, `tsconfig.base.json`, `eslint.config.js`, `Dockerfile`, `netlify.toml`) define the shared
  monorepo toolchain and deployment defaults.

## Build, Test, and Development Commands

- `npm install` installs all workspace dependencies. Use npm at the repo root; do not mix package managers for normal
  development.
- `npm run dev` starts the Nuxt front-end on port `3333`.
- `npm run server` starts the Express API with `tsx watch` on port `3006`.
- `npm run typecheck` runs both the Nuxt and back-end TypeScript checks.
- `npm run lint` runs ESLint across both workspaces.
- `npm run build` generates the static front-end to `front-end/.output/public` and compiles the back-end to
  `back-end/dist`.

## Coding Style & Naming Conventions

- Follow the repo ESLint configuration. Front-end files use the upstream Nuxt/Vitesse formatting style; root and
  back-end files follow the shared monorepo lint rules.
- Prefer descriptive component and composable names. Use PascalCase for Vue components and camelCase for utility and
  composable exports.
- Keep route-facing files in `app/pages` aligned with Nuxt’s file-based routing conventions.

## Testing & Verification

- Run `npm run lint`, `npm run typecheck`, and `npm run build` before pushing template changes.
- When changing API behavior, verify both the front-end call site and the Express route behavior together.
- Treat template breakage as high impact: small config changes can affect every downstream repo created from this
  template.

## Template Workflow

- `origin` is the published template repo for this monorepo pattern.
- `upstream` must continue to point to `antfu/vitesse-nuxt`.
- Preserve the front-end/back-end workspace structure when evolving the template unless a deliberate template version
  change is being made.

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
4. Run `npm run build`.
5. If API or back-end behavior changed and the repo has a back-end workspace, run `npm run -w back-end test` or the repo's equivalent API test command.

If `npm ci` fails because `package.json` and `package-lock.json` are out of sync:
1. Run `npm install --package-lock-only --ignore-scripts --no-fund --no-audit` from the repository root.
2. Re-run `npm ci` from the repository root.
3. Commit the resulting `package-lock.json` change with the related dependency/package change.

Never commit or push dependency/package changes if root `npm ci` fails.
