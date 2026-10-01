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

The committed package manager and production release toolchain are Node
24.18.1 with npm 12.0.2. The wider npm engine range exists only so GitHub's
dependency updater can install the workspace; release preparation rejects any
other npm version.

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

Security headers and release provenance are versioned for the native static
Nginx deployment. Every production build writes `/release.json` with the
semantic version and full source commit. The source policy uses
`Cache-Control: no-store` for that identity; the custom host may instead apply
`no-cache`, which still requires revalidation before reuse.

Production keeps the server's existing IPv4/IPv6 listeners, certificates, TLS,
HTTP/2, HTTP/3, and HTTP-to-HTTPS redirect. Include
`deploy/nginx/http-maps.conf` once in Nginx's `http` context and include
`deploy/nginx/server-policy.conf` inside the existing Avasan HTTPS `server`
block. The stable production paths are:

```nginx
include /etc/nginx/snippets/avasan.org-http-maps.conf;

server {
    # Existing production listen, server_name, and TLS configuration.
    include /etc/nginx/snippets/avasan.org-server-policy.conf;
}
```

For the one-time integration, install both source files at those exact paths
before adding the includes. Remove any legacy inline `$avasan_cache_control`
map and the Avasan `root`, `index`, `error_page`, response-header, method, and
application-location directives that the snippets now own; leave listeners,
`server_name`, certificates, TLS protocols, QUIC, and certificate-renewal
routing in the surrounding host. Then run `nginx -t` and reload. The small
`deploy/nginx/default.conf` is a standalone port-80 syntax/runtime reference;
it is not a replacement for the production TLS virtual host.

Direct Nginx releases are built from a clean checkout by an unprivileged deployment user.
The checkout's `origin` must be the canonical
`anderson-webops/avasan.org` repository, and its `HEAD`, fetched
`origin/main`, and annotated `v<package-version>` tag must resolve to the same
commit.

The old checkout-based promotion command is **not approved for production**:
it can execute candidate-controlled scripts as root and serve a builder-writable
tree. Do not run `deploy/direct/promote-static-release.sh` from a release
checkout. The host adapter must independently verify the tagged CI archive and
its provenance, enforce the deployment capabilities in
`deploy/static-artifact.json`, then install the exact artifact into a protected,
immutable release tree before a root-owned promoter activates it. A missing
capability is a host-adapter update, not permission to skip the check.

Select the existing approved Node directory on that host; do not replace its
system-wide runtime. Private environment files belong outside the checkout.

The reviewed host adapter must retain the prior release and its Nginx policy,
atomically switch the new artifact and policy, verify `/release.json` and the
homepage over both loopback address families, and restore the retained bytes
after failed activation without rebuilding or downloading. It must record whether
production changed. Before the first artifact-only promotion, the operator must
seal and validate the existing rollback target. See
[`docs/static-artifact-contract.md`](docs/static-artifact-contract.md) for the
versioned source-to-host contract and current transition blocker.
Production does not require Docker or a container registry.

After the custom-domain deployment completes, run the manual
`Verify production deployment` GitHub workflow with the expected semantic
version and full commit. Its smoke test checks the release identity, strict
headers, known links, absence of external scripts, a branded unknown-route 404
with a true `404` status, and a 405 for unsupported mutations. For the custom host only, it accepts
either `no-store` or `no-cache` as a freshness-safe release-metadata policy.

The architecture and operator boundaries from the latest authentication,
authorization, backend, deployment, and supply-chain review are recorded in
[`docs/security-audit.md`](docs/security-audit.md).

Integrating or activating the surrounding TLS virtual host remains an operator
action. The future installed promoter may own only the two reviewed snippets and the static
release symlink; it does not authorize or modify DNS, certificates, listeners,
routing, or firewall state.

The [static artifact and recovery contract](docs/static-artifact-contract.md)
describes the independently checked manifest, unpacked Nginx tests, copier
verification, synthetic promotion failure tests, and protected recovery limits.
