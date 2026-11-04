import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import installedMerge from 'deepmerge'

const sourceRequire = createRequire(new URL('../vendor/deepmerge/package.json', import.meta.url))
const deepmerge = sourceRequire('./')

const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

test('every locked deepmerge dependency resolves to the guarded fork', () => {
  const entries = Object.entries(lock.packages)
    .filter(([name]) => name.endsWith('node_modules/deepmerge'))

  assert.ok(entries.length > 0)
  for (const [, entry] of entries)
    assert.equal(entry.resolved, 'vendor/deepmerge')
  assert.equal(lock.packages['vendor/deepmerge'].version, '4.3.2-webops.1')
  assert.equal(installedMerge, deepmerge)
})

test('transitive KaTeX and Tinypool resolve to patched releases', () => {
  for (const name of ['katex', 'tinypool']) {
    const entries = Object.entries(lock.packages).filter(([path]) =>
      path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`),
    )
    assert.ok(entries.length > 0, `${name} must be present in the audited graph`)
    for (const [, entry] of entries)
      assert.equal(entry.version, packageJson.overrides[name])
  }
})

test('prototype keys cannot poison a merged object or its descendants', () => {
  const hostile = JSON.parse('{"__proto__":{"isAdmin":true},"nested":{"__proto__":{"isAdmin":true}}}')
  const targets = [
    {},
    Object.create(null),
    JSON.parse('{"__proto__":null}'),
    JSON.parse('{"__proto__":false}'),
    JSON.parse('{"__proto__":{"previous":true}}'),
  ]

  for (const target of targets) {
    const result = deepmerge(target, hostile)
    assert.equal(Object.getPrototypeOf(result), Object.prototype)
    const descriptor = Object.getOwnPropertyDescriptor(result, '__proto__')
    if (descriptor)
      assert.ok(Object.hasOwn(descriptor, 'value'), 'Preserved prototype-named input must be an own data property')
    assert.equal(result.isAdmin, undefined)
    assert.equal(Object.getPrototypeOf(result.nested), Object.prototype)
    assert.equal(result.nested.isAdmin, undefined)
  }
})

test('ordinary merges retain arrays, symbols, custom mergers and cloning', () => {
  const marker = Symbol('marker')
  const target = {
    items: [1],
    details: { left: true },
    [marker]: 'original',
  }
  const result = deepmerge(target, {
    items: [2],
    details: { right: true },
  })
  assert.deepEqual(result.items, [1, 2])
  assert.deepEqual(result.details, { left: true, right: true })
  assert.equal(result[marker], 'original')
  assert.notEqual(result.details, target.details)
  assert.deepEqual(deepmerge.all([
    { x: 1 },
    { y: 2 },
  ]), { x: 1, y: 2 })
  assert.deepEqual(deepmerge({
    items: [1],
  }, {
    items: [2],
  }, {
    customMerge: key => key === 'items'
      ? () => ['custom']
      : undefined,
  }), {
    items: ['custom'],
  })
})
