import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { nodeIdentity, verifyReusableToolchain } from './build-toolchain-cache.mjs'
import { selectedNpmCli } from './build-toolchain-state.mjs'

const prefix = path.resolve(path.dirname(selectedNpmCli()), '../../..')
const receipt = verifyReusableToolchain(prefix, nodeIdentity())
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(manifest.packageManager, `npm@${receipt.versions.npm}`)
for (const name of ['.node-version', '.nvmrc'])
  assert.equal(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8').trim(), receipt.node)
assert.deepEqual(manifest.workspaces, ['front-end'])
assert.deepEqual(manifest.dependencies, {})
process.stdout.write(`${JSON.stringify(receipt)}\n`)
