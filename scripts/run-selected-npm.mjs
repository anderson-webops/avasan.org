import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const npmExecPath = process.env.npm_execpath
assert.ok(npmExecPath, 'Run this helper through npm so the selected npm executable is known.')

const childEnvironment = { ...process.env }
delete childEnvironment.npm_config_global_ignore_file
delete childEnvironment.NPM_CONFIG_GLOBAL_IGNORE_FILE

const result = spawnSync(process.execPath, [npmExecPath, ...process.argv.slice(2)], {
  env: childEnvironment,
  stdio: 'inherit',
})

if (result.error)
  throw result.error
if (result.signal)
  throw new Error(`Selected npm process terminated with signal ${result.signal}.`)

process.exitCode = result.status ?? 1
