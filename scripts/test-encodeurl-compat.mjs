import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const encodeUrl = require('encodeurl')

const modern = await import('encodeurl')

test('the modern encoder retains its original ESM API and a callable CommonJS bridge', async () => {
  assert.equal(encodeUrl, modern.encodeUrl)
  assert.equal(encodeUrl.encodeUrl, modern.encodeUrl)
  const manifest = JSON.parse(await readFile(path.join(path.dirname(require.resolve('encodeurl')), 'package.json'), 'utf8'))
  const reviewed = JSON.parse(await readFile(path.join(root, 'vendor/http-compat/UPSTREAM.json'), 'utf8'))
  const upstream = reviewed.packages.find(input => input.name === 'encodeurl')
  assert.ok(upstream)
  assert.equal(manifest.version, `${upstream.version}-webops.2`)
  const reference = JSON.parse(await readFile(path.join(root, 'vendor/http-compat/reference/package.json'), 'utf8'))
  assert.equal(reference.dependencies.encodeurl, upstream.version)
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'))
  const entries = Object.entries(lock.packages).filter(([name]) => name === 'node_modules/encodeurl' || name.endsWith('/node_modules/encodeurl'))
  assert.ok(entries.length > 0)
  for (const [, entry] of entries)
    assert.equal(entry.version, manifest.version)
  for (const name of ['send', 'serve-static']) {
    const consumer = createRequire(require.resolve(name))
    assert.equal(consumer('encodeurl'), encodeUrl)
  }
})

test('the encoder preserves Unicode, percent sequences and malformed-input safety', () => {
  for (const [value, expected] of [
    ['/雪?q=a b', '/%E9%9B%AA?q=a%20b'],
    ['/already%20encoded', '/already%20encoded'],
    ['/broken%zz', '/broken%25zz'],
    ['/\uD800', '/%EF%BF%BD'],
    ['/\r\nInjected: yes', '/%0D%0AInjected:%20yes'],
  ])
    assert.equal(encodeUrl(value), expected)
})

test('real static middleware retains redirects and encoded file delivery', { timeout: 10000 }, async () => {
  const scratch = path.join(root, '.ai-work/runs/encoder-fixtures')
  await mkdir(scratch, { recursive: true })
  const directory = await mkdtemp(path.join(scratch, 'case-'))
  await mkdir(path.join(directory, 'folder'))
  await writeFile(path.join(directory, '雪.txt'), 'isolated encoder fixture')
  const serveStatic = require('serve-static')
  const middleware = serveStatic(directory)
  const server = createServer((request, response) => middleware(request, response, () => {
    response.statusCode = 404
    response.end()
  }))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const origin = `http://127.0.0.1:${server.address().port}`
    const redirected = await fetch(`${origin}/folder`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(2000),
    })
    assert.equal(redirected.status, 301)
    assert.equal(redirected.headers.get('location'), '/folder/')
    const served = await fetch(`${origin}/%E9%9B%AA.txt`, {
      signal: AbortSignal.timeout(2000),
    })
    assert.equal(served.status, 200)
    assert.equal(await served.text(), 'isolated encoder fixture')
    const rejected = await fetch(`${origin}/%0D%0AInjected:%20yes`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(2000),
    })
    assert.equal(rejected.status, 404)
    assert.equal(rejected.headers.get('injected'), null)
  }
  finally {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close(error => error
      ? reject(error)
      : resolve()))
    await rm(directory, { recursive: true })
  }
})
