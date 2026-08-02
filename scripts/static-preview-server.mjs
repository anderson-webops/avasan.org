import { createReadStream, existsSync, statSync } from 'node:fs'
import http from 'node:http'
import { extname, resolve, sep } from 'node:path'
import process from 'node:process'

const root = resolve('front-end/.output/public')
const port = Number(process.env.PORT || 18_080)
const host = '127.0.0.1'

if (!Number.isSafeInteger(port) || port < 1 || port > 65_535)
  throw new Error('PORT must be an integer between 1 and 65535.')
if (!existsSync(resolve(root, 'index.html')))
  throw new Error('Build the static release before starting the production preview.')
if (!existsSync(resolve(root, '404.html')))
  throw new Error('The static release is missing its branded 404 page.')

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

const securityHeaders = {
  'Content-Security-Policy': 'default-src \'self\'; base-uri \'none\'; object-src \'none\'; frame-ancestors \'none\'; form-action \'none\'; img-src \'self\' data:; font-src \'self\'; style-src \'self\' \'unsafe-inline\'; script-src \'self\' \'unsafe-inline\'; connect-src \'self\'; frame-src \'none\'; media-src \'none\'; worker-src \'none\'; manifest-src \'self\'; upgrade-insecure-requests',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'accelerometer=(), autoplay=(), camera=(), clipboard-read=(), display-capture=(), encrypted-media=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), usb=(), xr-spatial-tracking=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}

function sendStatus(request, response, status) {
  const headers = {
    ...securityHeaders,
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
  }
  if (status === 405)
    headers.Allow = 'GET, HEAD'
  response.writeHead(status, headers)
  response.end(request.method === 'HEAD' ? undefined : `${status}\n`)
}

function sendNotFound(request, response) {
  response.writeHead(404, {
    ...securityHeaders,
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/html; charset=utf-8',
  })
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  createReadStream(resolve(root, '404.html')).pipe(response)
}

function resolveRequest(pathname) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  }
  catch {
    return null
  }

  const segments = decoded.split('/').filter(Boolean)
  if (segments.some(segment => segment.startsWith('.')))
    return null

  const candidate = resolve(root, segments.join('/') || 'index.html')
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`))
    return null
  if (existsSync(candidate) && statSync(candidate).isFile())
    return candidate
  if (existsSync(resolve(candidate, 'index.html')) && statSync(resolve(candidate, 'index.html')).isFile())
    return resolve(candidate, 'index.html')
  return null
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${host}:${port}`)
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendStatus(request, response, 405)
    return
  }
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    sendNotFound(request, response)
    return
  }

  const file = resolveRequest(url.pathname)
  if (!file) {
    sendNotFound(request, response)
    return
  }

  const cacheControl = url.pathname === '/release.json'
    ? 'no-store'
    : url.pathname.startsWith('/_nuxt/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache'
  response.writeHead(200, {
    ...securityHeaders,
    'Cache-Control': cacheControl,
    'Content-Type': contentTypes.get(extname(file).toLowerCase()) || 'application/octet-stream',
  })
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  createReadStream(file).pipe(response)
})

server.headersTimeout = 15_000
server.keepAliveTimeout = 5_000
server.maxHeadersCount = 100
server.requestTimeout = 10_000
server.listen(port, host, () => {
  console.log(`Avasan static production preview listening on http://${host}:${port}.`)
})

function shutdown() {
  server.close(() => process.exit(0))
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
