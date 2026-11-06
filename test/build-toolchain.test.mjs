import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { selectedNpmCli, toolchainMetadata, verifyBuildToolchain } from '../scripts/build-toolchain-state.mjs'

test('the locked Nuxt provider satisfies its original unimport API floor', () => {
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
  const nuxt = lock.packages['node_modules/nuxt']
  const provider = lock.packages['node_modules/nuxt/node_modules/unimport'] || lock.packages['node_modules/unimport']
  const require = createRequire(path.resolve(path.dirname(selectedNpmCli()), '../package.json'))
  assert.ok(require('semver').satisfies(provider.version, nuxt.dependencies.unimport), `Nuxt requires ${nuxt.dependencies.unimport}, locked ${provider.version}`)
})

test('the installed Nuxt provider preserves the original unimport dependency contract', () => {
  const frontend = createRequire(new URL('../front-end/package.json', import.meta.url))
  const nuxt = createRequire(frontend.resolve('nuxt/package.json'))
  const metadata = nuxt('./package.json')
  const provider = JSON.parse(readFileSync(path.resolve(path.dirname(nuxt.resolve('unimport')), '../package.json'), 'utf8'))
  const require = createRequire(path.resolve(path.dirname(selectedNpmCli()), '../package.json'))
  assert.ok(require('semver').satisfies(provider.version, metadata.dependencies.unimport), `Nuxt requires ${metadata.dependencies.unimport}, resolved ${provider.version}`)
})

test('static source qualification retains the canonical current build-only profile', () => {
  const receipt = verifyBuildToolchain()
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.packageManager, `npm@${receipt.versions.npm}`)
  assert.equal(receipt.lockSha256, toolchainMetadata.lockSha256)
  assert.deepEqual(manifest.workspaces, ['front-end'])
  assert.deepEqual(manifest.dependencies, {})
  assert.match(manifest.scripts.audit, /audit:toolchain/u)
  assert.match(manifest.scripts['audit:production'], /audit:toolchain -- --omit=dev/u)
})

test('every maintained Node workflow uses the independently locked npm profile', () => {
  for (const name of ['ci.yml', 'release-source.yml', 'post-deploy.yml']) {
    const workflow = readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8')
    assert.doesNotMatch(workflow, /npm install --global/u)
    assert.match(workflow, /node scripts\/build-toolchain\.mjs --print-bin/u)
    assert.match(workflow, /scripts\/check-build-toolchain\.mjs/u)
    assert.equal(workflow.match(/uses: actions\/setup-node@/gu)?.length, workflow.match(/- name: Prepare independently locked build tools/gu)?.length)
  }
})

test('the selected npm transport preserves function-valued TLS validation without a network request', async () => {
  const require = createRequire(path.resolve(path.dirname(selectedNpmCli()), '../package.json'))
  const { Agent } = require('undici')
  const checkServerIdentity = () => new Error('synthetic certificate rejection')
  const captured = new Error('synthetic transport stopped before connection')
  const failures = []
  const agent = new Agent({
    tls: { checkServerIdentity },
    factory(_origin, options) {
      assert.equal(options.tls?.checkServerIdentity, checkServerIdentity)
      throw captured
    },
  })
  try {
    try {
      agent.dispatch({ origin: 'https://registry.invalid', path: '/', method: 'GET' }, {
        onError(error) { failures.push(error) },
      })
    }
    catch (error) {
      failures.push(error)
    }
    assert.deepEqual(failures, [captured])
  }
  finally {
    await agent.close()
  }
})
