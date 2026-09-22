import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import contract from '../deploy/static-artifact.json' with { type: 'json' }
import { releaseIdentity } from './release-identity.mjs'

export const manifestName = '.avasan-static-artifact.json'
export const hash = bytes => createHash('sha256').update(bytes).digest('hex')

function stableFileIdentity(stat) {
  return {
    ctimeNs: stat.ctimeNs,
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    mtimeNs: stat.mtimeNs,
    size: stat.size,
  }
}

function readStableRegularFile(path, expectedStat = lstatSync(path, { bigint: true }), encoding) {
  assert.ok(expectedStat.isFile() && !expectedStat.isSymbolicLink(), `Artifact path must be a regular file: ${path}`)
  assert.notEqual(constants.O_NOFOLLOW, undefined, 'Artifact verification requires O_NOFOLLOW support')
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = fstatSync(descriptor, { bigint: true })
    assert.deepEqual(stableFileIdentity(before), stableFileIdentity(expectedStat), `Artifact path changed before it was opened: ${path}`)
    const contents = readFileSync(descriptor)
    const after = fstatSync(descriptor, { bigint: true })
    assert.deepEqual(stableFileIdentity(after), stableFileIdentity(before), `Artifact file changed while it was read: ${path}`)
    assert.equal(BigInt(contents.byteLength), after.size, `Artifact file size changed while it was read: ${path}`)
    return encoding ? contents.toString(encoding) : contents
  }
  finally {
    closeSync(descriptor)
  }
}

const readStableJson = path => JSON.parse(readStableRegularFile(path, undefined, 'utf8'))

export function inspectStatic(root, allowPreview = false) {
  const publicRoot = resolve(root, contract.publicRoot)
  let parent = root
  for (const segment of contract.publicRoot.split('/')) {
    parent = resolve(parent, segment)
    const stat = lstatSync(parent)
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'Static path components must be real directories')
  }
  const files = {}
  function walk(directory, prefix = '') {
    for (const name of readdirSync(directory).sort()) {
      const relative = prefix + name
      assert.ok(!name.startsWith('.') && !/\.(?:pem|key|sqlite3?|node|so)$/iu.test(name), `Forbidden public path: ${relative}`)
      const path = resolve(directory, name)
      const stat = lstatSync(path, { bigint: true })
      assert.ok(!stat.isSymbolicLink(), `Symlink in static artifact: ${relative}`)
      if (stat.isDirectory()) {
        assert.notEqual(name, 'node_modules')
        walk(path, `${relative}/`)
      }
      else {
        assert.ok(stat.isFile(), `Non-file in static artifact: ${relative}`)
        const contents = readStableRegularFile(path, stat)
        files[relative] = { sha256: hash(contents), size: contents.byteLength }
      }
    }
  }
  walk(publicRoot)
  for (const name of contract.required)
    assert.ok(files[name], `Required static path missing: ${name}`)
  for (const name of Object.keys(files).filter(name => name.endsWith('.html'))) {
    const html = readStableRegularFile(resolve(publicRoot, name), undefined, 'utf8')
    for (const [, value] of html.matchAll(/(?:src|href)=["'](\/[^"']+)["']/gu)) {
      const url = new URL(value, 'https://artifact.invalid')
      if (url.origin !== 'https://artifact.invalid')
        continue
      const pathname = decodeURIComponent(url.pathname)
      if (/\.(?:js|css|json|svg|png|jpe?g|webp|ico|woff2?)$/iu.test(pathname))
        assert.ok(files[pathname.slice(1)], `Referenced asset missing: ${pathname} from ${name}`)
    }
  }
  const identity = readStableJson(resolve(publicRoot, 'release.json'))
  assert.deepEqual(Object.keys(identity).sort(), ['revision', 'version'])
  assert.match(identity.revision, /^[0-9a-f]{40}$/u)
  assert.match(identity.version, /^\d+\.\d+\.\d+$/u)
  const provenance = readStableJson(resolve(root, '.avasan-static-release.json'))
  assert.equal(provenance.commit, identity.revision)
  assert.equal(provenance.version, identity.version)
  if (!allowPreview) {
    assert.equal(provenance.tag, `v${identity.version}`)
    assert.equal(provenance.releaseVerified, true)
    assert.equal(provenance.dirty, false)
  }
  for (const directory of ['deploy', 'deploy/nginx']) {
    const stat = lstatSync(resolve(root, directory))
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'Adapter path components must be real directories')
  }
  const adapterFiles = {}
  for (const path of contract.adapterFiles) {
    const absolutePath = resolve(root, path)
    const stat = lstatSync(absolutePath, { bigint: true })
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'Adapter files must be regular files')
    const contents = readStableRegularFile(absolutePath, stat)
    adapterFiles[path] = { sha256: hash(contents), size: contents.byteLength }
  }
  return { format: 1, contract, identity, provenance, files, adapterFiles }
}

export function verifyStatic(root, { trustedManifest, commit, runtimeOnly = false } = {}) {
  for (const name of [manifestName, '.avasan-static-release.json']) {
    const stat = lstatSync(resolve(root, name))
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'Artifact metadata must be regular files')
  }
  const declared = readStableJson(resolve(root, manifestName))
  if (trustedManifest)
    assert.deepEqual(declared, trustedManifest, 'Copied manifest differs from trusted release manifest')
  assert.deepEqual(inspectStatic(root), declared, 'Static files or identity differ from the manifest')
  if (commit)
    assert.equal(declared.identity.revision, commit)
  assert.deepEqual(readStableJson(resolve(root, '.avasan-static-release.json')), declared.provenance)
  if (runtimeOnly) {
    assert.deepEqual(readdirSync(root).sort(), [manifestName, '.avasan-static-release.json', 'front-end', 'deploy'].sort())
    assert.deepEqual(readdirSync(resolve(root, 'deploy')), ['nginx'])
    assert.deepEqual(readdirSync(resolve(root, 'deploy/nginx')).sort(), ['http-maps.conf', 'server-policy.conf'])
    assert.deepEqual(readdirSync(resolve(root, 'front-end')), ['.output'])
    assert.deepEqual(readdirSync(resolve(root, 'front-end/.output')), ['public'])
  }
  return declared
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [operation, directory, trustedPath, commit] = process.argv.slice(2)
  assert.ok(['create', 'verify', 'runtime'].includes(operation), 'Use create, verify or runtime with a release directory')
  assert.ok(directory)
  const root = resolve(directory)
  if (operation === 'create') {
    const version = readStableJson(resolve(root, 'package.json')).version
    const provenance = { ...releaseIdentity(root, version, { SOURCE_RELEASE_REQUIRED: '1' }), version }
    writeFileSync(resolve(root, '.avasan-static-release.json'), `${JSON.stringify(provenance, null, 2)}\n`)
    const manifest = inspectStatic(root)
    writeFileSync(resolve(root, manifestName), `${JSON.stringify(manifest, null, 2)}\n`)
  }
  const result = verifyStatic(root, {
    trustedManifest: trustedPath ? readStableJson(resolve(trustedPath)) : undefined,
    commit,
    runtimeOnly: operation === 'runtime',
  })
  console.log(JSON.stringify({ staticArtifact: 'verified', commit: result.identity.revision, files: Object.keys(result.files).length }))
}
