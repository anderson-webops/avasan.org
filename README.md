# avasan.org

The personal teaching homepage for Julio, a grade-school math and computer science teacher.

The public site is intentionally one page with one primary destination:
[cs.avasan.org](https://cs.avasan.org).

## Development

This project is based on
[anderson-webops/vitesse-nuxt-template](https://github.com/anderson-webops/vitesse-nuxt-template) and retains its Nuxt
front-end plus optional Express back-end workspace.

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

The generated static site is written to `front-end/.output/public`.

Production builds send page views to the dedicated
`analytics.avasan.org` instance and the owner-visible central
`analytics.jacobdanderson.net` instance. Set `DISABLE_ANALYTICS=true` to omit
both trackers.
