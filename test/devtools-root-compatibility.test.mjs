import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

test('the current frontend kit coexists with the original Unhead peer without changed metadata', () => {
  const frontend = createRequire(fileURLToPath(new URL('../front-end/package.json', import.meta.url)))
  const nuxt = createRequire(frontend.resolve('nuxt/package.json'))
  const unheadVue = createRequire(nuxt.resolve('@unhead/vue'))
  const bundlerEntrypoint = unheadVue.resolve('@unhead/bundler')
  const bundler = createRequire(bundlerEntrypoint)
  const bundlerManifest = JSON.parse(readFileSync(path.join(path.dirname(bundlerEntrypoint), '../package.json'), 'utf8'))
  const frontendKit = JSON.parse(readFileSync(frontend.resolve('@vitejs/devtools-kit/package.json'), 'utf8'))
  const legacyKit = JSON.parse(readFileSync(bundler.resolve('@vitejs/devtools-kit/package.json'), 'utf8'))
  assert.equal(bundlerManifest.name, '@unhead/bundler')
  assert.equal(bundlerManifest.peerDependencies['@vitejs/devtools-kit'], '^0.7.6')
  assert.equal(frontendKit.version, '0.8.2')
  assert.equal(legacyKit.version, '0.7.6')
})
