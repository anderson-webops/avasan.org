import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const readText = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('repository pins the approved runtime, lifecycle, and CI supply chain', () => {
  const packageJson = JSON.parse(readText('package.json'))
  const workflow = readText('.github/workflows/ci.yml')
  const postDeployWorkflow = readText('.github/workflows/post-deploy.yml')
  const deploymentSmoke = readText('scripts/static-deployment-smoke.mjs')

  assert.equal(packageJson.packageManager, 'npm@12.0.2')
  assert.deepEqual(packageJson.engines, {
    node: '>=24.18.1 <25',
    npm: '>=12.0.2 <13',
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
  assert.equal(
    workflow.match(/persist-credentials: false/gu)?.length,
    workflow.match(/uses:\s+actions\/checkout@/gu)?.length,
  )
  assert.match(workflow, /runs-on: ubuntu-24\.04-arm/u)
  assert.match(workflow, /npm run audit:production/u)
  assert.match(workflow, /npm run audit:signatures/u)
  assert.match(workflow, /npm run verify:dependency-graph/u)
  assert.match(workflow, /npm run verify:native-bindings/u)
  assert.match(workflow, /npm ci --include=optional --strict-allow-scripts/u)
  assert.match(workflow, /direct-static-runtime/u)
  assert.match(workflow, /AVASAN_RELEASE_REVISION: \$\{\{ github\.sha \}\}/u)
  assert.match(workflow, /npm run preview:production/u)
  assert.doesNotMatch(workflow, /\bdocker\b/iu)
  assert.match(postDeployWorkflow, /workflow_dispatch:/u)
  assert.match(postDeployWorkflow, /ALLOW_RELEASE_NO_CACHE: "true"/u)
  assert.match(postDeployWorkflow, /DEPLOYMENT_URL: https:\/\/avasan\.org/u)
  assert.match(postDeployWorkflow, /EXPECTED_REVISION: \$\{\{ inputs\.expected_revision \}\}/u)
  assert.match(postDeployWorkflow, /EXPECTED_VERSION: \$\{\{ inputs\.expected_version \}\}/u)
  assert.match(deploymentSmoke, /releaseCacheDirectives\.includes\('no-store'\)/u)
  assert.match(deploymentSmoke, /allowReleaseNoCache && releaseCacheDirectives\.includes\('no-cache'\)/u)
  assert.equal(existsSync(new URL('../Dockerfile', import.meta.url)), false)
  assert.equal(existsSync(new URL('../.dockerignore', import.meta.url)), false)
  assert.match(readText('deploy/direct/prepare-static-release.sh'), /npm ci --include=optional --strict-allow-scripts/u)
  assert.match(readText('deploy/direct/prepare-static-release.sh'), /Node 24\.18\.1 and npm 12\.0\.2/u)
  assert.match(readText('deploy/direct/promote-static-release.sh'), /mv -Tf/u)
  assert.match(readText('deploy/direct/promote-static-release.sh'), /previous_target/u)
  assert.match(readText('deploy/direct/promote-static-release.sh'), /cmp -s/u)
  assert.match(packageJson.scripts['build:sites'], /npm run test:sites/u)
  assert.equal(packageJson.scripts['preview:production'], 'node scripts/static-preview-server.mjs')
  assert.match(
    JSON.parse(readText('front-end/package.json')).scripts.build,
    /write-release-metadata\.mjs/u,
  )
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
