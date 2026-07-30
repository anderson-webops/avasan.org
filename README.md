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
- `npm run build`
- `npm run a11y`
- `npm run test:static`

The generated static site is written to `front-end/.output/public`.

Security headers are versioned for the Sites worker, Netlify, and the container
Nginx deployment. `.openai/hosting.json` preserves the existing Sites project
identity; `npm run build:sites` prepares its deployment artifact without
publishing it.

The optional container listens on unprivileged port `8080`. Its Node and Nginx
base images are pinned by multi-platform digest; update those digests
deliberately when adopting upstream security fixes, then repeat the full build
and static deployment tests.
