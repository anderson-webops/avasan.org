import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { verifyLocalInputs } from './check-local-inputs.mjs'

async function fixture(context, spec = 'file:input.tgz') {
  const parent = path.resolve(import.meta.dirname, '../.ai-work/runs')
  await mkdir(parent, { recursive: true })
  const root = await mkdtemp(path.join(parent, 'local-input-'))
  context.after(() => rm(root, { recursive: true }))
  const payload = Buffer.from('isolated package archive fixture')
  const integrity = `sha512-${createHash('sha512').update(payload).digest('base64')}`
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    private: true,
    dependencies: { fixture: spec },
  }))
  await writeFile(path.join(root, 'package-lock.json'), JSON.stringify({
    packages: {
      '': {
        dependencies: { fixture: spec },
      },
      'node_modules/fixture': { resolved: spec, integrity },
    },
  }))
  return { root, payload }
}

test('complete local archives verify independently of package-manager cache state', async (context) => {
  const { root, payload } = await fixture(context)
  await writeFile(path.join(root, 'input.tgz'), payload)
  assert.deepEqual(await verifyLocalInputs(root, ['.']), { graphs: 1, inputs: 1 })
  await writeFile(path.join(root, 'input.tgz'), 'corrupted cached-input fixture')
  await assert.rejects(verifyLocalInputs(root, ['.']), /integrity differs/)
})

test('missing declared archives fail before a warm cache can mask them', async (context) => {
  const { root } = await fixture(context)
  await assert.rejects(verifyLocalInputs(root, ['.']), { code: 'ENOENT' })
})

test('local references reject links and traversal outside the reviewed source root', async (context) => {
  const { root, payload } = await fixture(context)
  await writeFile(path.join(root, 'original.tgz'), payload)
  await symlink('original.tgz', path.join(root, 'input.tgz'))
  await assert.rejects(verifyLocalInputs(root, ['.']), /must not follow a link/)
  const traversing = await fixture(context, 'file:../outside.tgz')
  await assert.rejects(verifyLocalInputs(traversing.root, ['.']), /remain inside/)
})
