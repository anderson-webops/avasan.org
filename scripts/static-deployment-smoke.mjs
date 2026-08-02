import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const baseUrl = new URL(process.env.DEPLOYMENT_URL || 'http://127.0.0.1:18080')
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..')
const rootPackage = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'))
const expectedVersion = process.env.EXPECTED_VERSION || rootPackage.version
const allowReleaseNoCache = process.env.ALLOW_RELEASE_NO_CACHE?.toLowerCase() === 'true'
const expectedRevision = (
  process.env.EXPECTED_REVISION
  || process.env.AVASAN_RELEASE_REVISION
  || process.env.GITHUB_SHA
  || execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
).trim().toLowerCase()
const sourceRevisionPattern = /^[0-9a-f]{40}$/u

assert.match(expectedVersion, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/u)
assert.match(expectedRevision, sourceRevisionPattern)

async function request(pathname, init = {}) {
  return fetch(new URL(pathname, baseUrl), {
    redirect: 'manual',
    ...init,
  })
}

async function waitForServer() {
  const deadline = Date.now() + 30_000
  let lastError

  while (Date.now() < deadline) {
    try {
      const response = await request('/')
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
assert.match(contentSecurityPolicy, /connect-src 'self'/u)
assert.equal(home.headers.get('cross-origin-opener-policy'), 'same-origin')
assert.equal(home.headers.get('cross-origin-resource-policy'), 'same-origin')
assert.equal(home.headers.get('x-content-type-options'), 'nosniff')
assert.equal(home.headers.get('x-frame-options'), 'DENY')
assert.match(home.headers.get('strict-transport-security') ?? '', /max-age=31536000/u)

const html = await home.text()
const assetPath = html.match(/(?:href|src)="(\/_nuxt\/[^"]+)"/u)?.[1]
assert.ok(assetPath, 'Generated HTML must reference a hashed Nuxt asset.')
assert.doesNotMatch(html, /analytics|googletagmanager|doubleclick|segment\.com/iu)

const externalScripts = [...html.matchAll(/<script\b[^>]*\ssrc=(["'])(https?:\/\/.+?)\1/giu)]
  .map(match => match[2])
assert.deepEqual(externalScripts, [], 'The homepage must not load external scripts.')

const externalAnchors = [...html.matchAll(/<a\b[^>]*\shref=(["'])(https?:\/\/.+?)\1/giu)]
  .map(match => new URL(match[2]).href)
  .sort()
assert.deepEqual(externalAnchors, [
  'https://cs.avasan.org/',
  'https://math.avasan.org/',
])

const assetResponse = await request(assetPath)
assert.equal(assetResponse.status, 200)
assert.match(assetResponse.headers.get('cache-control') ?? '', /immutable/u)
assert.equal(assetResponse.headers.get('x-content-type-options'), 'nosniff')

assert.match(html, /<link[^>]+rel="icon"[^>]+href="\/favicon\.svg"/iu)
const faviconResponse = await request('/favicon.svg')
assert.equal(faviconResponse.status, 200)
assert.match(faviconResponse.headers.get('content-type') ?? '', /^image\/svg\+xml\b/iu)
assert.equal(faviconResponse.headers.get('x-content-type-options'), 'nosniff')

const releaseResponse = await request('/release.json')
assert.equal(releaseResponse.status, 200)
assert.match(releaseResponse.headers.get('content-type') ?? '', /^application\/json\b/iu)
const releaseCacheDirectives = (releaseResponse.headers.get('cache-control') ?? '')
  .split(',')
  .map(directive => directive.trim().toLowerCase())
assert.ok(
  releaseCacheDirectives.includes('no-store')
  || (allowReleaseNoCache && releaseCacheDirectives.includes('no-cache')),
  'Release metadata must use no-store, or no-cache on the custom host.',
)
assert.equal(releaseResponse.headers.get('set-cookie'), null)
assert.deepEqual(await releaseResponse.json(), {
  revision: expectedRevision,
  version: expectedVersion,
})

const releaseHeadResponse = await request('/release.json', { method: 'HEAD' })
assert.equal(releaseHeadResponse.status, 200)
const releaseHeadCacheDirectives = (releaseHeadResponse.headers.get('cache-control') ?? '')
  .split(',')
  .map(directive => directive.trim().toLowerCase())
assert.ok(
  releaseHeadCacheDirectives.includes('no-store')
  || (allowReleaseNoCache && releaseHeadCacheDirectives.includes('no-cache')),
  'Release metadata HEAD responses must use no-store, or no-cache on the custom host.',
)
assert.equal(await releaseHeadResponse.text(), '')

const unknownResponse = await request(`/__avasan-deployment-probe-missing-${expectedRevision.slice(0, 12)}`)
assert.equal(unknownResponse.status, 404)
assert.equal(unknownResponse.headers.get('set-cookie'), null)
assert.match(await unknownResponse.text(), /Page not found/u)

const directErrorPageResponse = await request('/404.html')
assert.equal(directErrorPageResponse.status, 404)
assert.match(await directErrorPageResponse.text(), /Page not found/u)

const directIndexResponse = await request('/index.html')
assert.equal(directIndexResponse.status, 200)
assert.ok((await directIndexResponse.text()).includes('href="https://cs.avasan.org"'))

const mutationResponse = await request('/', { method: 'POST' })
assert.equal(mutationResponse.status, 405)
assert.equal(mutationResponse.headers.get('set-cookie'), null)

const apiResponse = await request('/api/health')
assert.equal(apiResponse.status, 404)

const hiddenFileResponse = await request('/.env')
assert.ok([403, 404].includes(hiddenFileResponse.status))

console.log(`Static deployment smoke checks passed for ${expectedVersion} at ${expectedRevision}.`)
