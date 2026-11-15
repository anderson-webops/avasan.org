import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '..')
const graphs = [
  'vendor/http-compat/reference',
  'vendor/unimport/build',
  'vendor/unimport/runtime',
  'vendor/schema-parents/tools',
  'vendor/schema-parents/upstream',
  'vendor/framework-parents/upstream',
  'vendor/native-providers/upstream',
  'vendor/vite-plugin-vue-devtools/upstream',
  'vendor/vue-compiler/browser-tools',
  'vendor/vue-compiler/upstream',
  'vendor/vite-plugin-checker/upstream',
  'vendor/rollup-plugins/tools',
  'vendor/rollup-plugins/upstream',
  'vendor/nitro-tools/upstream',
  'vendor/nitro-tools/current',
  'vendor/nft/upstream',
  'vendor/watchers/upstream',
]

for (const graph of graphs) {
  const manifest = JSON.parse(readFileSync(path.join(root, graph, 'package.json'), 'utf8'))
  assert.equal(manifest.workspaces, undefined, `${graph} must be an independent graph`)
  console.log(`Verify all original registry inputs: ${graph}`)
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts/run-selected-npm.mjs'),
    'audit',
    'signatures',
    '--prefix',
    graph,
  ], { cwd: root, stdio: 'inherit' })
  if (result.error)
    throw result.error
  assert.equal(result.signal, null, `${graph} signature verification was interrupted`)
  assert.equal(result.status, 0, `${graph} signature verification must pass completely`)
}
