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

Direct Nginx releases are built from a clean checkout by an unprivileged deployment user, then promoted atomically:

```bash
deploy/direct/prepare-static-release.sh /srv/avasan.org/releases/v1.2.4
sudo deploy/direct/promote-static-release.sh /srv/avasan.org/releases/v1.2.4
```

Promotion compares the prepared and public release identities, atomically
installs the release's maps and server-policy snippets, verifies that the live
Nginx graph includes both stable paths, and switches the `current` symlink.
It then validates and reloads Nginx and compares the served `/release.json`
byte-for-byte. A failed candidate restores the prior snippets and release.
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
action. The promotion helper owns only the two reviewed snippets and the static
release symlink; it does not authorize or modify DNS, certificates, listeners,
routing, or firewall state.
