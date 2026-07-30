# avasan.org

The personal teaching homepage for Julio, a grade-school math and computer science teacher.

The public site is intentionally one page with two destinations:

- Primary: [cs.avasan.org](https://cs.avasan.org)
- Secondary: [math.avasan.org](https://math.avasan.org)

## Development

This project is based on
[anderson-webops/vitesse-nuxt-template](https://github.com/anderson-webops/vitesse-nuxt-template), with only the Nuxt
static front end retained. The homepage does not use analytics, accounts, forms,
cookies, or a runtime API.

From the repository root:

```bash
npm ci
npm run dev
```

Useful checks:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run a11y`
- `npm run test:static`
- `npm run audit`
- `npm run audit:production`
- `npm run verify:dependency-graph`
- `npm run verify:native-bindings`

The generated static site is written to `front-end/.output/public`.

Security headers and release provenance are versioned for the Sites worker,
Netlify, and the container Nginx deployment. Every production build writes
`/release.json` with the semantic version and full source commit. The endpoint
is always served with `Cache-Control: no-store`, so a deployment can be checked
without relying on cached HTML.

`.openai/hosting.json` preserves the existing Sites project identity;
`npm run build:sites` prepares its deployment artifact without publishing it.
The Sites worker bundles both the homepage and release identity so neither can
bypass its response policy.

Container builds must receive the intended full commit:

```bash
docker build \
  --build-arg AVASAN_RELEASE_REVISION="$(git rev-parse HEAD)" \
  --tag avasan-org:test \
  .
```

After the custom-domain deployment completes, run the manual
`Verify production deployment` GitHub workflow with the expected semantic
version and full commit. Its smoke test checks the release identity, strict
headers, known links, absence of external scripts, a real unknown-route 404,
and a 405 for unsupported mutations.

The architecture and operator boundaries from the latest authentication,
authorization, backend, deployment, and supply-chain review are recorded in
[`docs/security-audit.md`](docs/security-audit.md).

The optional container listens on unprivileged port `8080`. Its Node and Nginx
base images are pinned by multi-platform digest; update those digests
deliberately when adopting upstream security fixes, then repeat the full build
and static deployment tests.
