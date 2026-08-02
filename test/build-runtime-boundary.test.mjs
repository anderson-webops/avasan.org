import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { isExpectedNitroH3BridgeWarning } from '../scripts/nitro-warning-policy.ts'

const npmRunner = fileURLToPath(new URL('../scripts/run-selected-npm.mjs', import.meta.url))
const temporaryDirectories = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, {
    force: true,
    recursive: true,
  })))
})

test('the selected npm boundary strips only the obsolete inherited config', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'avasan-npm-boundary-'))
  temporaryDirectories.push(directory)
  const selectedNpm = join(directory, 'selected-npm.mjs')
  const resultFile = join(directory, 'result.json')
  await writeFile(selectedNpm, `
    import { writeFileSync } from 'node:fs'
    writeFileSync(process.env.AVASAN_NPM_BOUNDARY_RESULT, JSON.stringify({
      argv: process.argv.slice(2),
      lower: process.env.npm_config_global_ignore_file ?? null,
      upper: process.env.NPM_CONFIG_GLOBAL_IGNORE_FILE ?? null,
    }))
  `)

  const result = spawnSync(process.execPath, [npmRunner, 'run', 'fixture'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      AVASAN_NPM_BOUNDARY_RESULT: resultFile,
      NPM_CONFIG_GLOBAL_IGNORE_FILE: 'obsolete-upper-value',
      npm_config_global_ignore_file: 'obsolete-lower-value',
      npm_execpath: selectedNpm,
    },
  })

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(await readFile(resultFile, 'utf8')), {
    argv: ['run', 'fixture'],
    lower: null,
    upper: null,
  })
})

test('the Nitro warning policy matches only the exact upstream H3 bridge warning', () => {
  const expectedWarning = {
    code: 'UNUSED_EXTERNAL_IMPORT',
    exporter: 'file:///project/node_modules/@nuxt/nitro-server/node_modules/h3/dist/index.mjs',
    ids: ['/project/node_modules/@nuxt/nitro-server/dist/h3.mjs'],
    names: ['H3Event', 'setCookie', 'H3Error', 'getCookie', 'deleteCookie'],
  }

  assert.equal(isExpectedNitroH3BridgeWarning(expectedWarning), true)
  for (const changedWarning of [
    { ...expectedWarning, code: 'UNRESOLVED_IMPORT' },
    { ...expectedWarning, exporter: 'file:///project/node_modules/h3/dist/index.mjs' },
    { ...expectedWarning, ids: ['/project/src/server.ts'] },
    { ...expectedWarning, names: expectedWarning.names.slice(1) },
    { ...expectedWarning, names: [...expectedWarning.names, 'unexpectedExport'] },
    { ...expectedWarning, names: [...expectedWarning.names.slice(1), 42] },
  ]) {
    assert.equal(isExpectedNitroH3BridgeWarning(changedWarning), false)
  }
})
