import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const readText = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('repository pins the approved runtime, lifecycle, and CI supply chain', () => {
  const packageJson = JSON.parse(readText('package.json'))
  const workflow = readText('.github/workflows/ci.yml')
  const releaseWorkflow = readText('.github/workflows/release-source.yml')
  const postDeployWorkflow = readText('.github/workflows/post-deploy.yml')
  const deploymentSmoke = readText('scripts/static-deployment-smoke.mjs')
  const staticArtifact = readText('scripts/static-artifact.mjs')
  const readme = readText('README.md')

  assert.equal(packageJson.packageManager, 'npm@12.0.2')
  assert.deepEqual(packageJson.engines, {
    node: '>=24.18.1 <25',
    npm: '>=11.19.0 <13',
  })
  assert.deepEqual(packageJson.allowScripts, {
    'esbuild@0.28.2': true,
    'fsevents@2.3.3': true,
    'puppeteer@25.11.0': false,
    'simple-git-hooks@2.14.0': true,
    'unrs-resolver@1.12.2': true,
  })
  assert.match(readText('.npmrc'), /^include=optional$/mu)
  assert.match(readText('.npmrc'), /^strict-allow-scripts=true$/mu)
  assert.match(releaseWorkflow, /runs-on: ubuntu-24\.04-arm/u)
  assert.match(releaseWorkflow, /git cat-file -t/u)
  assert.match(releaseWorkflow, /scripts\/package-static-release\.sh/u)
  assert.match(releaseWorkflow, /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/u)
  assert.match(releaseWorkflow, /actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c/u)
  assert.match(releaseWorkflow, /actions\/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8/u)
  assert.doesNotMatch(releaseWorkflow.split('  attest-arm64:')[0], /id-token: write/u)
  assert.match(releaseWorkflow.split('  attest-arm64:')[1], /id-token: write/u)
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
  assert.match(workflow, /systemctl restart nginx/u)
  assert.match(
    workflow,
    /DEPLOYMENT_URL=http:\/\/avasan\.org npm run smoke:deployment/u,
  )
  assert.doesNotMatch(workflow, /\bdocker\b/iu)
  assert.match(postDeployWorkflow, /workflow_dispatch:/u)
  assert.match(postDeployWorkflow, /persist-credentials: false/u)
  assert.match(
    postDeployWorkflow,
    /- name: Pin npm version\s+run: npm install --global npm@12\.0\.2 --allow-scripts=npm[\s\S]*- name: Verify pinned toolchain/u,
  )
  assert.match(postDeployWorkflow, /ALLOW_RELEASE_NO_CACHE: "true"/u)
  assert.match(postDeployWorkflow, /DEPLOYMENT_URL: https:\/\/avasan\.org/u)
  assert.match(postDeployWorkflow, /EXPECTED_REVISION: \$\{\{ inputs\.expected_revision \}\}/u)
  assert.match(postDeployWorkflow, /EXPECTED_VERSION: \$\{\{ inputs\.expected_version \}\}/u)
  assert.match(deploymentSmoke, /releaseCacheDirectives\.includes\('no-store'\)/u)
  assert.match(deploymentSmoke, /allowReleaseNoCache && releaseCacheDirectives\.includes\('no-cache'\)/u)
  assert.equal(existsSync(new URL('../Dockerfile', import.meta.url)), false)
  assert.equal(existsSync(new URL('../.dockerignore', import.meta.url)), false)
  assert.match(readText('deploy/direct/prepare-static-release.sh'), /checkout-based preparation is retired/u)
  assert.match(readme, /release toolchain are Node\s+24\.18\.1 with npm 12\.0\.2/u)
  assert.match(readme, /checkout-based preparation and promotion commands now fail closed/u)
  assert.doesNotMatch(readme, /sudo env NODE_BIN_DIR=/u)
  assert.match(staticArtifact, /openSync\(path, constants\.O_RDONLY \| constants\.O_NOFOLLOW \| constants\.O_NONBLOCK\)/u)
  assert.match(staticArtifact, /fstatSync\(descriptor, \{ bigint: true \}\)/u)
  assert.match(staticArtifact, /readFileSync\(descriptor\)/u)
  assert.doesNotMatch(staticArtifact, /hash\(readFileSync\(path\)\)/u)
  assert.match(readText('deploy/direct/promote-static-release.sh'), /checkout-based promotion is retired/u)
  assert.match(readText('deploy/direct/verify-release-source.sh'), /refs\/remotes\/origin\/main/u)
  assert.match(readText('deploy/direct/verify-release-source.sh'), /anderson-webops\/avasan\\\.org/u)
  assert.match(readText('deploy/direct/promote-attested-release.sh'), /gh attestation verify/u)
  assert.match(readText('deploy/direct/promote-attested-release.sh'), /verify --retained/u)
  assert.match(readText('deploy/direct/promote-attested-release.sh'), /mv -Tf/u)
  assert.match(readText('deploy/direct/promote-attested-release.sh'), /nginx -T/u)
  assert.match(readText('deploy/direct/promote-attested-release.sh'), /verify-nginx-snippet-dump\.sh/u)
  assert.match(readText('deploy/direct/verify-nginx-snippet-dump.sh'), /grep -Fxc/u)
  assert.match(readText('deploy/nginx/default.conf'), /avasan\.org-http-maps\.conf/u)
  assert.match(readText('deploy/nginx/default.conf'), /avasan\.org-server-policy\.conf/u)
  assert.match(readText('deploy/direct/promote-attested-release.sh'), /Cross-Origin-Opener-Policy/u)
  assert.match(readText('deploy/direct/promote-attested-release.sh'), /Cross-Origin-Resource-Policy/u)
  assert.match(readText('deploy/direct/promote-attested-release.sh'), /Page not found/u)
  assert.equal(packageJson.scripts['build:sites'], undefined)
  assert.equal(packageJson.scripts['test:sites'], undefined)
  assert.equal(existsSync(new URL('../netlify.toml', import.meta.url)), false)
  assert.equal(existsSync(new URL('../sites/worker.js', import.meta.url)), false)
  assert.equal(existsSync(new URL('../.openai/hosting.json', import.meta.url)), false)
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
