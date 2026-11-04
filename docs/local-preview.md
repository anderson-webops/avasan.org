# Local static preview

Build with `npm run build`, then use `npm run preview` or
`npm run preview:production`. Both serve the generated static tree on
`http://127.0.0.1:18080`. Set `PORT` to select another local port.
`npm run -w front-end preview` uses the same locked listener.

For HTTPS, provide local PEM files through `AVASAN_PREVIEW_TLS_KEY` and
`AVASAN_PREVIEW_TLS_CERT`, then run `npm run -w front-end preview-https`.
The certificate must cover `127.0.0.1`; its trust remains an explicit client
decision. The command neither downloads a server nor installs certificates.

Both modes remain loopback-only, reject mutations and API paths, retain strict
static routing and cache/header policy, and bound connections and shutdown.
HTTPS configuration errors fail before a listener opens. Keep private
certificate/key files outside tracked source and published artifacts.
