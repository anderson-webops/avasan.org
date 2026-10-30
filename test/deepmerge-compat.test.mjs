import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import installedMerge from 'deepmerge'
import deepmerge from '../vendor/deepmerge/index.js'

const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))

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
  assert.equal(lock.packages['node_modules/katex'].version, '0.18.2')
  assert.equal(lock.packages['node_modules/tinypool'].version, '2.1.2')
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
    assert.equal(Object.hasOwn(result, '__proto__'), false)
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
