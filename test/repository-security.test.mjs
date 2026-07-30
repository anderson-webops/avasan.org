import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const readText = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('repository pins the approved runtime, lifecycle, and CI supply chain', () => {
  const packageJson = JSON.parse(readText('package.json'))
  const workflow = readText('.github/workflows/ci.yml')

  assert.equal(packageJson.packageManager, 'npm@11.16.0')
  assert.deepEqual(packageJson.engines, {
    node: '>=24.18.0 <25',
    npm: '>=11.16.0 <12',
  })
  assert.deepEqual(packageJson.allowScripts, {
    'esbuild@0.28.1': true,
    'fsevents@2.3.3': true,
    'puppeteer@25.4.0': false,
    'simple-git-hooks@2.13.1': true,
    'unrs-resolver@1.12.2': true,
  })
  assert.match(readText('.npmrc'), /^include=optional$/mu)
  assert.match(readText('.npmrc'), /^strict-allow-scripts=true$/mu)
  assert.doesNotMatch(packageJson.scripts.clean, /package-lock\.json/u)
  assert.doesNotMatch(workflow, /uses:\s+\S+@(?:main|master|v\d)/u)
  assert.match(workflow, /runs-on: ubuntu-24\.04-arm/u)
  assert.match(workflow, /npm run audit:production/u)
  assert.match(workflow, /npm run verify:dependency-graph/u)
  assert.match(workflow, /npm run verify:native-bindings/u)
  assert.match(workflow, /npm ci --include=optional --strict-allow-scripts/u)
  assert.match(readText('Dockerfile'), /COPY vendor\/archiver-nitro-compat/u)
  assert.match(packageJson.scripts['build:sites'], /npm run test:sites/u)
})

test('weekly dependency updates preserve the reviewed TypeScript compatibility boundary', () => {
  const dependabot = readText('.github/dependabot.yml')

  assert.match(dependabot, /package-ecosystem: github-actions/u)
  assert.match(dependabot, /package-ecosystem: npm/u)
  assert.match(dependabot, /dependency-name: typescript/u)
  assert.match(dependabot, /version-update:semver-major/u)
  assert.doesNotMatch(dependabot, /security-update/u)
})

test('the source remains account-free, tracker-free, and backend-free', () => {
  const packageJson = JSON.parse(readText('package.json'))
  const homepage = readText('front-end/src/pages/index.vue')
  const nuxtConfig = readText('front-end/nuxt.config.ts')

  assert.deepEqual(packageJson.workspaces, ['front-end'])
  assert.doesNotMatch(homepage, /<form\b/u)
  assert.doesNotMatch(homepage, /v-html/u)
  assert.doesNotMatch(homepage, /analytics|tracking|cookie|login|password/iu)
  assert.doesNotMatch(nuxtConfig, /runtimeConfig/u)
  assert.doesNotMatch(nuxtConfig, /serverHandlers/u)
})
