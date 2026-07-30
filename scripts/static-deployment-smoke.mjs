import assert from 'node:assert/strict'
import process from 'node:process'

const baseUrl = new URL(process.env.DEPLOYMENT_URL || 'http://127.0.0.1:18080')

async function waitForServer() {
  const deadline = Date.now() + 30_000
  let lastError

  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok)
        return response
      lastError = new Error(`Deployment returned ${response.status}.`)
    }
    catch (error) {
      lastError = error
    }

    await new Promise(resolve => setTimeout(resolve, 300))
  }

  throw lastError ?? new Error('Deployment did not become ready.')
}

const home = await waitForServer()
const contentSecurityPolicy = home.headers.get('content-security-policy') ?? ''

assert.match(contentSecurityPolicy, /default-src 'self'/u)
assert.match(contentSecurityPolicy, /frame-ancestors 'none'/u)
assert.match(contentSecurityPolicy, /connect-src 'none'/u)
assert.equal(home.headers.get('cross-origin-opener-policy'), 'same-origin')
assert.equal(home.headers.get('cross-origin-resource-policy'), 'same-origin')
assert.equal(home.headers.get('x-content-type-options'), 'nosniff')
assert.equal(home.headers.get('x-frame-options'), 'DENY')
assert.match(home.headers.get('strict-transport-security') ?? '', /max-age=31536000/u)

const html = await home.text()
const assetPath = html.match(/(?:href|src)="(\/_nuxt\/[^"]+)"/u)?.[1]
assert.ok(assetPath, 'Generated HTML must reference a hashed Nuxt asset.')

const assetResponse = await fetch(new URL(assetPath, baseUrl))
assert.equal(assetResponse.status, 200)
assert.match(assetResponse.headers.get('cache-control') ?? '', /immutable/u)
assert.equal(assetResponse.headers.get('x-content-type-options'), 'nosniff')

const apiResponse = await fetch(new URL('/api/health', baseUrl), {
  redirect: 'manual',
})
assert.equal(apiResponse.status, 404)

const hiddenFileResponse = await fetch(new URL('/.env', baseUrl), {
  redirect: 'manual',
})
assert.ok([403, 404].includes(hiddenFileResponse.status))

console.log('Static deployment security smoke checks passed.')
