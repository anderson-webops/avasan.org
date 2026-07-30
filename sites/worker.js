const bundledIndexHtml = null

const securityHeaders = {
  'Content-Security-Policy': `default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; img-src 'self' data:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'none'; media-src 'none'; worker-src 'none'; manifest-src 'self'; upgrade-insecure-requests`,
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'accelerometer=(), autoplay=(), camera=(), clipboard-read=(), display-capture=(), encrypted-media=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), usb=(), xr-spatial-tracking=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}

function secureResponse(response, request) {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(securityHeaders))
    headers.set(name, value)

  const pathname = new URL(request.url).pathname
  if (pathname.startsWith('/_nuxt/'))
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  else
    headers.set('Cache-Control', 'no-cache')

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return secureResponse(new Response('Method not allowed.', {
        headers: {
          'Allow': 'GET, HEAD',
          'Content-Type': 'text/plain; charset=utf-8',
        },
        status: 405,
      }), request)
    }

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return secureResponse(new Response('Not found.', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        status: 404,
      }), request)
    }

    if ((pathname === '/' || pathname === '/index.html') && bundledIndexHtml) {
      return secureResponse(new Response(
        request.method === 'HEAD' ? null : bundledIndexHtml,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      ), request)
    }

    const response = env.ASSETS
      ? await env.ASSETS.fetch(request)
      : new Response('Static asset binding is unavailable.', { status: 503 })

    return secureResponse(response, request)
  },
}
