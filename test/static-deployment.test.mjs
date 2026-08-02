import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

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
  const notFound = read('front-end/.output/public/404.html')
  const release = JSON.parse(read('front-end/.output/public/release.json'))
  const rootPackage = JSON.parse(read('package.json'))
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
  assert.match(html, /href="\/favicon\.svg"/)
  assert.ok(existsSync(resolve(outputDirectory, 'favicon.svg')))
  assert.deepEqual(Object.keys(release).sort(), ['revision', 'version'])
  assert.equal(release.version, rootPackage.version)
  assert.match(release.revision, /^[0-9a-f]{40}$/u)
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
  assert.match(notFound, /Page not found/u)
  assert.match(notFound, /href="\/"/u)
  assert.doesNotMatch(notFound, /<script\b/iu)
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

test('the native static deployment defines the security policy', () => {
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
  const nginxConfig = read('deploy/nginx/default.conf')

  for (const header of expectedHeaders) {
    assert.ok(nginxConfig.includes(header), `Nginx config is missing ${header}`)
  }

  assert.equal(hostnameTokens(nginxConfig).has('analytics.avasan.org'), false)
  assert.ok(!nginxConfig.includes('unsafe-eval'))
  assert.match(nginxConfig, /location \^~ \/api\//)
  assert.match(nginxConfig, /return 404;/)
  assert.match(nginxConfig, /try_files \$uri \$uri\/ =404;/)
  assert.match(nginxConfig, /error_page 404 \/404\.html;/u)
  assert.match(nginxConfig, /location = \/404\.html[\s\S]*?internal;/u)
  assert.match(nginxConfig, /\/release\.json "no-store";/u)
  assert.match(nginxConfig, /location = \/release\.json/u)
})

test('the direct Nginx release path is dual-stack and atomic', () => {
  const nginxConfig = read('deploy/nginx/default.conf')
  const prepareRelease = read('deploy/direct/prepare-static-release.sh')
  const promoteRelease = read('deploy/direct/promote-static-release.sh')

  assert.equal(existsSync(resolve(projectRoot, 'Dockerfile')), false)
  assert.equal(existsSync(resolve(projectRoot, '.dockerignore')), false)
  assert.match(nginxConfig, /listen 80;/)
  assert.match(nginxConfig, /listen \[::\]:80;/)
  assert.match(nginxConfig, /server_name avasan\.org www\.avasan\.org;/)
  assert.match(nginxConfig, /root \/srv\/avasan\.org\/current\/front-end\/\.output\/public;/)
  assert.match(nginxConfig, /access_log off;/)
  assert.match(prepareRelease, /AVASAN_RELEASE_REVISION/u)
  assert.match(prepareRelease, /unprivileged deployment user/u)
  assert.match(promoteRelease, /mv -Tf/u)
  assert.match(promoteRelease, /systemctl reload nginx/u)
  assert.match(promoteRelease, /restoring the previous release/u)
})
