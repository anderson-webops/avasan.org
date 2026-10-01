import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import contract from '../deploy/static-artifact.json' with { type: 'json' }
import { inspectStatic, manifestName, verifyStatic } from '../scripts/static-artifact.mjs'

function fixture(t) {
  const parent = resolve('.ai-work/runs/artifact-tests')
  mkdirSync(parent, { recursive: true })
  const root = mkdtempSync(`${parent}/case-`)
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const publicRoot = resolve(root, contract.publicRoot)
  for (const name of contract.required) {
    const path = resolve(publicRoot, name)
    mkdirSync(resolve(path, '..'), { recursive: true })
    writeFileSync(path, '<!doctype html><title>Synthetic fixture</title>')
  }
  const identity = { revision: 'a'.repeat(40), version: '1.2.12' }
  const provenance = { commit: identity.revision, version: identity.version, tag: 'v1.2.12', dirty: false, releaseVerified: true }
  writeFileSync(resolve(publicRoot, 'release.json'), JSON.stringify(identity))
  writeFileSync(resolve(root, '.avasan-static-release.json'), JSON.stringify(provenance))
  for (const path of contract.adapterFiles) {
    mkdirSync(resolve(root, path, '..'), { recursive: true })
    writeFileSync(resolve(root, path), '# synthetic adapter')
  }
  const manifest = inspectStatic(root)
  writeFileSync(resolve(root, manifestName), JSON.stringify(manifest))
  return { root, publicRoot, manifest }
}

test('complete static artifact has no application runtime or private state', (t) => {
  const { root, manifest } = fixture(t)
  verifyStatic(root, { runtimeOnly: true, trustedManifest: manifest, commit: 'a'.repeat(40) })
  mkdirSync(resolve(root, 'back-end'))
  assert.throws(() => verifyStatic(root, { runtimeOnly: true }))
})

test('deployment contract is versioned and bound to the verified artifact', (t) => {
  const { root, manifest } = fixture(t)
  assert.equal(contract.deployment.version, 1)
  assert.equal(contract.deployment.buildPlatform, 'linux-arm64')
  assert.equal(contract.deployment.runtime, 'static-nginx')
  assert.deepEqual(contract.deployment.readiness.addressFamilies, ['ipv4', 'ipv6'])
  assert.equal(contract.deployment.readiness.homepageStatus, 200)
  assert.equal(contract.deployment.readiness.missingRouteStatus, 404)
  assert.equal(contract.deployment.migrations, 'none')
  assert.ok(contract.deployment.requiredHostCapabilities.includes('protected-immutable-staging-v1'))
  assert.deepEqual(manifest.contract.deployment, contract.deployment)
  const weakenedManifest = structuredClone(manifest)
  weakenedManifest.contract.deployment.requiredHostCapabilities.pop()
  writeFileSync(resolve(root, manifestName), JSON.stringify(weakenedManifest))
  assert.throws(() => verifyStatic(root), /differ from the manifest/u)
})

test('missing pages and referenced assets fail even if a copier regenerates the inventory', (t) => {
  const { root, publicRoot } = fixture(t)
  unlinkSync(resolve(publicRoot, 'favicon.svg'))
  assert.throws(() => inspectStatic(root), /Required static path missing/u)
  writeFileSync(resolve(publicRoot, 'favicon.svg'), '<svg/>')
  writeFileSync(resolve(publicRoot, 'index.html'), '<script src="/_nuxt/missing.js"></script>')
  assert.throws(() => inspectStatic(root), /Referenced asset missing/u)
})

test('copier tampering, private files, symlinks and unreleased previews are rejected', (t) => {
  const { root, publicRoot, manifest } = fixture(t)
  writeFileSync(resolve(publicRoot, 'index.html'), '<title>Altered</title>')
  assert.throws(() => verifyStatic(root), /differ from the manifest/u)
  writeFileSync(resolve(root, manifestName), JSON.stringify(inspectStatic(root)))
  assert.throws(() => verifyStatic(root, { trustedManifest: manifest }), /differs from trusted/u)
  writeFileSync(resolve(publicRoot, '.env'), 'synthetic')
  assert.throws(() => inspectStatic(root), /Forbidden public path/u)
  unlinkSync(resolve(publicRoot, '.env'))
  symlinkSync(resolve(publicRoot, 'index.html'), resolve(publicRoot, 'linked.html'))
  assert.throws(() => inspectStatic(root), /Symlink/u)
  unlinkSync(resolve(publicRoot, 'linked.html'))
  const identity = JSON.parse(readFileSync(resolve(root, '.avasan-static-release.json'), 'utf8'))
  identity.tag = null
  identity.releaseVerified = false
  writeFileSync(resolve(root, '.avasan-static-release.json'), JSON.stringify(identity))
  assert.throws(() => inspectStatic(root))
})

test('a complete copied artifact preserves every file and source identity', (t) => {
  const { root, manifest } = fixture(t)
  const copy = `${root}-copy`
  t.after(() => rmSync(copy, { recursive: true, force: true }))
  cpSync(root, copy, { recursive: true })
  verifyStatic(copy, { trustedManifest: manifest, commit: 'a'.repeat(40), runtimeOnly: true })
})

test('adapter tampering or omission cannot pass a copied artifact', (t) => {
  const { root, manifest } = fixture(t)
  writeFileSync(resolve(root, contract.adapterFiles[0]), '# altered')
  assert.throws(() => verifyStatic(root, { trustedManifest: manifest }))
  unlinkSync(resolve(root, contract.adapterFiles[0]))
  assert.throws(() => inspectStatic(root))
})

test('FIFO sidecars and adapter files fail without blocking verification', (t) => {
  for (const relativePath of [manifestName, '.avasan-static-release.json', contract.adapterFiles[0], 'trusted-manifest.json']) {
    const { root } = fixture(t)
    const fifoPath = resolve(root, relativePath)
    if (relativePath === 'trusted-manifest.json')
      writeFileSync(fifoPath, '')
    unlinkSync(fifoPath)
    const created = spawnSync('mkfifo', [fifoPath], { encoding: 'utf8' })
    assert.equal(created.status, 0, created.stderr)
    const args = ['scripts/static-artifact.mjs', 'verify', root]
    if (relativePath === 'trusted-manifest.json')
      args.push(fifoPath)
    const verified = spawnSync(process.execPath, args, {
      encoding: 'utf8',
      timeout: 3000,
    })
    assert.equal(verified.error, undefined, `${relativePath}: verification stalled`)
    assert.notEqual(verified.status, 0, relativePath)
    assert.match(verified.stderr, /Artifact path must be a regular file/u)
  }
})
