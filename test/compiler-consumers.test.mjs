import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

const frontend = createRequire(new URL('../front-end/package.json', import.meta.url))
const root = createRequire(new URL('../package.json', import.meta.url))

test('the frontend declares and resolves its matching Vue compiler directly', () => {
  const manifest = JSON.parse(readFileSync(new URL('../front-end/package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.devDependencies['@vue/compiler-sfc'], manifest.dependencies.vue)
  const compiler = frontend('@vue/compiler-sfc')
  assert.equal(compiler.version, frontend('vue').version)
  const result = compiler.parse('<template><h1>Teacher homepage</h1></template>')
  assert.deepEqual(result.errors, [])
  assert.match(result.descriptor.template.content, /Teacher homepage/u)
})

test('Vue checking retains its supported TypeScript compiler API', () => {
  assert.match(root('typescript').version, /^6\./u)
  assert.match(root.resolve('typescript/lib/tsc'), /typescript\/lib\/tsc\.js$/u)
})
