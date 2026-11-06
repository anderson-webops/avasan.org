import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { selectedNpmCli, toolchainMetadata, verifyBuildToolchain } from '../scripts/build-toolchain-state.mjs'

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
