import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const testDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(testDirectory, '..')
const assetsDirectory = resolve(projectRoot, 'dist/assets')
const workerPath = resolve(projectRoot, 'dist/server/index.js')

test('Sites routes every HTML response through the security worker', async () => {
  assert.ok(existsSync(workerPath), 'run npm run build:sites before this test')
  assert.deepEqual(
    readdirSync(assetsDirectory).filter(entry => entry.endsWith('.html')),
    [],
    'HTML files must not bypass the Sites worker as direct static assets',
  )
  assert.equal(
    readdirSync(assetsDirectory).includes('release.json'),
    false,
    'release metadata must not bypass the Sites worker as a direct asset',
  )

  const workerModule = await import(`${pathToFileURL(workerPath)}?test=${Date.now()}`)
  const response = await workerModule.default.fetch(
    new Request('https://avasan-org.example/'),
    {},
  )

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8')
  assert.equal(response.headers.get('Cache-Control'), 'no-cache')
  assert.equal(response.headers.get('Cross-Origin-Opener-Policy'), 'same-origin')
  assert.equal(response.headers.get('Cross-Origin-Resource-Policy'), 'same-origin')
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY')
  assert.match(response.headers.get('Content-Security-Policy') ?? '', /connect-src 'self'/u)
  assert.match(await response.text(), /<h1[^>]*>Math &amp; code\.<\/h1>/u)

  const headResponse = await workerModule.default.fetch(
    new Request('https://avasan-org.example/', { method: 'HEAD' }),
    {},
  )
  assert.equal(headResponse.status, 200)
  assert.equal(await headResponse.text(), '')

  const expectedRelease = JSON.parse(
    readFileSync(resolve(projectRoot, 'front-end/.output/public/release.json'), 'utf8'),
  )
  const releaseResponse = await workerModule.default.fetch(
    new Request('https://avasan-org.example/release.json'),
    {},
  )
  assert.equal(releaseResponse.status, 200)
  assert.equal(releaseResponse.headers.get('Content-Type'), 'application/json; charset=utf-8')
  assert.equal(releaseResponse.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(await releaseResponse.json(), expectedRelease)

  const releaseHeadResponse = await workerModule.default.fetch(
    new Request('https://avasan-org.example/release.json', { method: 'HEAD' }),
    {},
  )
  assert.equal(releaseHeadResponse.status, 200)
  assert.equal(releaseHeadResponse.headers.get('Cache-Control'), 'no-store')
  assert.equal(await releaseHeadResponse.text(), '')

  const unknownResponse = await workerModule.default.fetch(
    new Request('https://avasan-org.example/__missing'),
    {
      ASSETS: {
        fetch: () => new Response('Not found.', { status: 404 }),
      },
    },
  )
  assert.equal(unknownResponse.status, 404)

  const mutationResponse = await workerModule.default.fetch(
    new Request('https://avasan-org.example/', { method: 'POST' }),
    {},
  )
  assert.equal(mutationResponse.status, 405)
})
