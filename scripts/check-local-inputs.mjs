import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { referenceGraphs } from './reference-graphs.mjs'

export async function verifyLocalInputs(root, graphs) {
  assert.equal(await realpath(root), root, 'Use the physical source root')
  const checked = new Set()
  async function localStat(filename) {
    const relative = path.relative(root, filename)
    assert.ok(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), 'Local input must remain inside its source root')
    let current = root
    let metadata = await lstat(current)
    for (const part of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, part)
      metadata = await lstat(current)
      assert.equal(metadata.isSymbolicLink(), false, `Local input must not follow a link: ${current}`)
    }
    assert.ok(metadata.isFile() || metadata.isDirectory(), 'Local input must be a regular file or source directory')
    return metadata
  }
  async function readJson(filename) {
    const metadata = await localStat(filename)
    assert.ok(metadata.isFile() && metadata.size <= 8 * 1024 * 1024, 'Dependency metadata must be a bounded regular file')
    return JSON.parse(await readFile(filename, 'utf8'))
  }
  async function verifySpec(directory, spec, integrity) {
    const filename = path.resolve(directory, spec.slice(5))
    const metadata = await localStat(filename)
    if (metadata.isDirectory()) {
      await readJson(path.join(filename, 'package.json'))
    }
    else {
      assert.ok(metadata.size <= 32 * 1024 * 1024, 'Local archive exceeds its reviewed size bound')
      if (integrity !== undefined) {
        assert.match(integrity, /^sha512-[A-Za-z0-9+/]+=*$/u, 'Locked local archives require complete SHA512 integrity')
        const actual = `sha512-${createHash('sha512').update(await readFile(filename)).digest('base64')}`
        assert.equal(actual, integrity, `Local archive integrity differs: ${filename}`)
      }
    }
    checked.add(filename)
  }
  async function visit(directory, value) {
    if (typeof value === 'string' && value.startsWith('file:')) {
      await verifySpec(directory, value)
    }
    else if (value && typeof value === 'object') {
      for (const item of Object.values(value))
        await visit(directory, item)
    }
  }
  for (const graph of graphs) {
    const directory = path.resolve(root, graph)
    const manifest = await readJson(path.join(directory, 'package.json'))
    await visit(directory, manifest)
    const lock = await readJson(path.join(directory, 'package-lock.json'))
    for (const entry of Object.values(lock.packages)) {
      if (entry.resolved?.startsWith('file:')) {
        const metadata = await localStat(path.resolve(directory, entry.resolved.slice(5)))
        assert.ok(metadata.isDirectory() || entry.integrity, 'Every locked archive requires an integrity value')
        await verifySpec(directory, entry.resolved, entry.integrity)
      }
    }
  }
  return { graphs: graphs.length, inputs: checked.size }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(import.meta.dirname, '..')
  console.log(JSON.stringify(await verifyLocalInputs(root, ['.', ...referenceGraphs])))
}
