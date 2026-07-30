import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import archiver, { JsonArchive, TarArchive, ZipArchive } from '../vendor/archiver-nitro-compat/index.js'

test('Archiver compatibility bridge preserves Nitro default factory behavior', () => {
  assert.ok(archiver('zip') instanceof ZipArchive)
  assert.ok(archiver.create('tar') instanceof TarArchive)
  assert.ok(archiver('json') instanceof JsonArchive)
  assert.equal(archiver.isRegisteredFormat('zip'), true)
  assert.throws(() => archiver('unknown'), /format not registered/u)
})

test('Archiver compatibility bridge remains pinned to the reviewed implementation', () => {
  const rootPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const compatibilityPackage = JSON.parse(
    readFileSync(new URL('../vendor/archiver-nitro-compat/package.json', import.meta.url), 'utf8'),
  )

  assert.equal(rootPackage.dependencies.archiver, 'file:vendor/archiver-nitro-compat')
  assert.equal(rootPackage.overrides.nitropack.archiver, '$archiver')
  assert.equal(compatibilityPackage.version, '7.0.2')
  assert.equal(compatibilityPackage.dependencies['archiver-modern'], 'npm:archiver@8.0.0')
})
