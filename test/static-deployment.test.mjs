import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const testDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(testDirectory, '..')
const outputDirectory = resolve(projectRoot, 'front-end/.output/public')

function read(relativePath) {
  return readFileSync(resolve(projectRoot, relativePath), 'utf8')
}

function hostnameTokens(text) {
  return new Set(
    (text.match(/[a-z0-9.-]+\.[a-z]{2,}/giu) ?? [])
      .map(hostname => hostname.toLowerCase()),
  )
}

test('the generated site remains a one-page, tracker-free static homepage', () => {
  const indexPath = resolve(outputDirectory, 'index.html')
  assert.ok(existsSync(indexPath), 'run the front-end build before this test')

  const html = readFileSync(indexPath, 'utf8')
  const forbiddenText = [
    'analytics.avasan.org',
    'analytics.jacobdanderson.net',
    'apiBaseUrl',
    'localhost:3006',
    'DISABLE_ANALYTICS',
  ]

  for (const value of forbiddenText)
    assert.ok(!html.includes(value), `generated HTML must not contain ${value}`)

  assert.match(html, /href="https:\/\/cs\.avasan\.org"/)
  assert.match(html, /href="https:\/\/math\.avasan\.org"/)
  assert.deepEqual(
    [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)]
      .map(match => match[1])
      .filter(source => /^https?:\/\//.test(source)),
    [],
    'generated HTML must not load third-party scripts',
  )

  const rootEntries = readdirSync(outputDirectory)
  const generatedHtml = rootEntries.filter(entry => entry.endsWith('.html')).sort()
  assert.deepEqual(generatedHtml, ['200.html', '404.html', 'index.html'])
  assert.equal(
    read('front-end/public/robots.txt').replaceAll('\r\n', '\n'),
    'User-agent: *\nAllow: /\n',
  )
})

test('the source tree has no optional API workspace', () => {
  const rootPackage = JSON.parse(read('package.json'))

  assert.deepEqual(rootPackage.workspaces, ['front-end'])
  assert.ok(!existsSync(resolve(projectRoot, 'back-end/package.json')))
  assert.ok(!Object.hasOwn(rootPackage.scripts, 'server'))
  assert.ok(!Object.hasOwn(rootPackage.scripts, 'server:once'))
})

test('deployment surfaces define the static security policy', async () => {
  const expectedHeaders = [
    'Content-Security-Policy',
    'Cross-Origin-Opener-Policy',
    'Cross-Origin-Resource-Policy',
    'Permissions-Policy',
    'Referrer-Policy',
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'X-Frame-Options',
  ]
  const netlifyConfig = read('netlify.toml')
  const nginxConfig = read('deploy/nginx/default.conf')

  for (const header of expectedHeaders) {
    assert.ok(netlifyConfig.includes(header), `Netlify config is missing ${header}`)
    assert.ok(nginxConfig.includes(header), `Nginx config is missing ${header}`)
  }

  assert.equal(hostnameTokens(netlifyConfig).has('analytics.avasan.org'), false)
  assert.equal(hostnameTokens(nginxConfig).has('analytics.avasan.org'), false)
  assert.ok(!netlifyConfig.includes('from = "/*"'))
  assert.ok(!netlifyConfig.includes('unsafe-eval'))
  assert.ok(!nginxConfig.includes('unsafe-eval'))
  assert.match(netlifyConfig, /from = "\/api\/\*"/)
  assert.match(netlifyConfig, /status = 404/)
  assert.match(nginxConfig, /location \^~ \/api\//)
  assert.match(nginxConfig, /return 404;/)
  assert.match(nginxConfig, /try_files \$uri \$uri\/ =404;/)

  const workerModule = await import(pathToFileURL(resolve(projectRoot, 'sites/worker.js')))
  const request = new Request('https://avasan.org/')
  const response = await workerModule.default.fetch(request, {
    ASSETS: {
      fetch: () => new Response('<main>Julio</main>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    },
  })

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY')
  assert.equal(response.headers.get('Cross-Origin-Opener-Policy'), 'same-origin')
  assert.equal(response.headers.get('Cross-Origin-Resource-Policy'), 'same-origin')
  assert.match(response.headers.get('Content-Security-Policy') ?? '', /default-src 'self'/)
  assert.match(response.headers.get('Content-Security-Policy') ?? '', /connect-src 'self'/)
  assert.match(response.headers.get('Strict-Transport-Security') ?? '', /includeSubDomains/)
  assert.equal(response.headers.get('Cache-Control'), 'no-cache')

  const apiResponse = await workerModule.default.fetch(
    new Request('https://avasan.org/api/health'),
    {
      ASSETS: {
        fetch: () => {
          throw new Error('API paths must not reach the static asset binding')
        },
      },
    },
  )
  assert.equal(apiResponse.status, 404)
  assert.equal(apiResponse.headers.get('X-Content-Type-Options'), 'nosniff')

  const mutationResponse = await workerModule.default.fetch(
    new Request('https://avasan.org/', { method: 'POST' }),
    {
      ASSETS: {
        fetch: () => {
          throw new Error('Mutation methods must not reach the static asset binding')
        },
      },
    },
  )
  assert.equal(mutationResponse.status, 405)
  assert.equal(mutationResponse.headers.get('Allow'), 'GET, HEAD')

  const missingBindingResponse = await workerModule.default.fetch(request, {})
  assert.equal(missingBindingResponse.status, 503)
  assert.equal(missingBindingResponse.headers.get('X-Content-Type-Options'), 'nosniff')
})

test('the alternative container is pinned and unprivileged', () => {
  const dockerfile = read('Dockerfile')
  const nginxConfig = read('deploy/nginx/default.conf')

  assert.match(dockerfile, /FROM node:24\.18\.0-alpine@sha256:[a-f0-9]{64} AS build-stage/)
  assert.match(dockerfile, /FROM nginxinc\/nginx-unprivileged:stable-alpine@sha256:[a-f0-9]{64} AS production-stage/)
  assert.match(dockerfile, /EXPOSE 8080/)
  assert.match(nginxConfig, /listen 8080;/)
  assert.match(nginxConfig, /access_log off;/)
})

test('Sites project identity remains versioned and minimal', () => {
  const hosting = JSON.parse(read('.openai/hosting.json'))

  assert.deepEqual(Object.keys(hosting), ['project_id'])
  assert.match(hosting.project_id, /^appgprj_[a-f0-9]+$/)
})
