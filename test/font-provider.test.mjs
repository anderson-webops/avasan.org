import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

test('the site directly declares and resolves its local font processor', async () => {
  const frontendManifest = new URL('../front-end/package.json', import.meta.url)
  const metadata = JSON.parse(readFileSync(frontendManifest, 'utf8'))
  assert.equal(metadata.devDependencies['@unocss/preset-web-fonts'], metadata.devDependencies.unocss)
  const frontend = createRequire(frontendManifest)
  const provider = await import(pathToFileURL(frontend.resolve('@unocss/preset-web-fonts/local')))
  assert.equal(typeof provider.createLocalFontProcessor, 'function')
})
