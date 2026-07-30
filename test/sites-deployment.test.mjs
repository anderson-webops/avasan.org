import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
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
})
