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
Netlify, and the direct Nginx deployment. Every production build writes
`/release.json` with the semantic version and full source commit. The endpoint
uses `Cache-Control: no-store` on the source-owned Sites, Netlify, and Nginx
surfaces. The custom host's outer static vhost may instead apply `no-cache`,
which still requires revalidation before reuse.

`.openai/hosting.json` preserves the existing Sites project identity;
`npm run build:sites` prepares its deployment artifact without publishing it.
The Sites worker bundles both the homepage and release identity so neither can
bypass its response policy.

Direct Nginx releases are built from a clean checkout by an unprivileged deployment user, then promoted atomically:

```bash
deploy/direct/prepare-static-release.sh /srv/avasan.org/releases/v1.2.3
sudo deploy/direct/promote-static-release.sh /srv/avasan.org/releases/v1.2.3
```

Promotion compares the prepared and public release identities, switches the `current` symlink atomically, validates
and reloads Nginx, then compares the served `/release.json` byte-for-byte. A failed candidate restores the prior
release. Production does not require Docker or a container registry.

After the custom-domain deployment completes, run the manual
`Verify production deployment` GitHub workflow with the expected semantic
version and full commit. Its smoke test checks the release identity, strict
headers, known links, absence of external scripts, a real unknown-route 404,
and a 405 for unsupported mutations. For the custom host only, it accepts
either `no-store` or `no-cache` as a freshness-safe release-metadata policy.

The architecture and operator boundaries from the latest authentication,
authorization, backend, deployment, and supply-chain review are recorded in
[`docs/security-audit.md`](docs/security-audit.md).

Installing or activating the Nginx site remains an operator action. These source helpers do not authorize DNS,
certificate, routing, or firewall changes.
