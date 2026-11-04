import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { resolveOptionalBinding } from '../scripts/lockfile-native-bindings.mjs'

const name = '@typescript/typescript-linux-arm64'

test('the native verifier rejects weakened lockfile policy and registry integrity', async () => {
  const repository = resolve(import.meta.dirname, '..')
  const scratch = join(repository, '.ai-work/runs')
  await mkdir(scratch, { recursive: true })
  const fixture = await mkdtemp(join(scratch, 'native-binding-policy-'))
  try {
    await mkdir(join(fixture, 'scripts'))
    for (const filename of ['verify-native-bindings.mjs', 'lockfile-native-bindings.mjs'])
      await copyFile(join(repository, 'scripts', filename), join(fixture, 'scripts', filename))
    const lock = JSON.parse(await readFile(join(repository, 'package-lock.json'), 'utf8'))
    const npmConfig = await readFile(join(repository, '.npmrc'), 'utf8')
    for (const [parentPath, metadata] of Object.entries(lock.packages)) {
      for (const dependencyName of Object.keys(metadata.optionalDependencies || {})) {
        if (!dependencyName.includes('linux-arm64'))
          continue
        const binding = resolveOptionalBinding(lock.packages, parentPath, dependencyName)
        assert.ok(binding)
        const directory = join(fixture, binding.packagePath)
        await mkdir(directory, { recursive: true })
        await writeFile(join(directory, 'package.json'), JSON.stringify({ name: dependencyName, version: binding.packageRecord.version }))
      }
    }
    const writeFixture = async (configuration = npmConfig) => {
      await writeFile(join(fixture, 'package-lock.json'), JSON.stringify(lock))
      await writeFile(join(fixture, '.npmrc'), configuration)
    }
    const verify = () => spawnSync(process.execPath, ['scripts/verify-native-bindings.mjs'], {
      cwd: fixture,
      encoding: 'utf8',
      timeout: 5000,
    })
    await writeFixture()
    const valid = verify()
    assert.equal(valid.status, 0, valid.stderr)
    lock.lockfileVersion = 2
    await writeFixture()
    const obsolete = verify()
    assert.notEqual(obsolete.status, 0)
    assert.match(obsolete.stderr, /lockfile v3/u)
    lock.lockfileVersion = 3
    for (const requirement of ['include=optional', 'engine-strict=true', 'strict-allow-scripts=true']) {
      await writeFixture(npmConfig.split(/\r?\n/u).filter(line => line !== requirement).join('\n'))
      const weakened = verify()
      assert.notEqual(weakened.status, 0)
      assert.ok(weakened.stderr.includes(requirement))
    }
    const binding = Object.entries(lock.packages).find(([packagePath]) => packagePath.endsWith('node_modules/@esbuild/linux-arm64'))?.[1]
    assert.ok(binding)
    for (const integrity of ['', 'sha1-invalid']) {
      binding.integrity = integrity
      await writeFixture()
      const unsigned = verify()
      assert.notEqual(unsigned.status, 0)
      assert.match(unsigned.stderr, /registry integrity/u)
    }
  }
  finally {
    await rm(fixture, { recursive: true })
  }
})

test('invalid absolute and traversing dependency paths fail closed', () => {
  for (const parent of ['/outside/package', '../other/package'])
    assert.throws(() => resolveOptionalBinding({}, parent, name), /relative lockfile paths/u)
})

test('native compiler dependencies resolve beneath a nested package alias', () => {
  const packagePath = `back-end/node_modules/typescript-native/node_modules/${name}`
  const packages = {
    [packagePath]: { version: '7.0.2' },
  }
  assert.equal(resolveOptionalBinding(packages, 'back-end/node_modules/typescript-native', name)?.packagePath, packagePath)
})

test('hoisted workspace and repository bindings retain normal Node lookup', () => {
  for (const packagePath of [`back-end/node_modules/${name}`, `node_modules/${name}`]) {
    const packages = {
      [packagePath]: { version: '7.0.2' },
    }
    assert.equal(resolveOptionalBinding(packages, 'back-end/node_modules/typescript-native', name)?.packagePath, packagePath)
  }
})

test('a binding in an unrelated workspace cannot satisfy a missing dependency', () => {
  const packages = {
    [`front-end/node_modules/${name}`]: { version: '7.0.2' },
  }
  assert.equal(resolveOptionalBinding(packages, 'back-end/node_modules/typescript-native', name), undefined)
})

test('a shadowing incompatible binding cannot be skipped for a matching distant version', () => {
  const nested = `back-end/node_modules/typescript-native/node_modules/${name}`
  const packages = {
    [nested]: { version: '6.0.3' },
    [`node_modules/${name}`]: { version: '7.0.2' },
  }
  const binding = resolveOptionalBinding(packages, 'back-end/node_modules/typescript-native', name)
  assert.equal(binding.packagePath, nested)
  assert.equal(binding.packageRecord.version, '6.0.3')
})

test('scoped parents and root declarations resolve without searching unrelated paths', () => {
  const packagePath = `node_modules/${name}`
  const packages = {
    [packagePath]: { version: '7.0.2' },
  }
  assert.equal(resolveOptionalBinding(packages, 'node_modules/@scope/compiler', name)?.packagePath, packagePath)
  assert.equal(resolveOptionalBinding(packages, '', name)?.packagePath, packagePath)
})
