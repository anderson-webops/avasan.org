import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { releaseMetadata, writeReleaseMetadata } from '../scripts/write-release-metadata.mjs'

const testDirectory = dirname(fileURLToPath(import.meta.url))
const temporaryRelease = resolve(testDirectory, '.release-metadata.test.json')

test('release metadata records only the semantic version and exact source revision', async () => {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assert.deepEqual(releaseMetadata({ AVASAN_RELEASE_REVISION: revision }), {
    revision,
    version: JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version,
  })

  try {
    await writeReleaseMetadata(temporaryRelease, { AVASAN_RELEASE_REVISION: revision })
    assert.deepEqual(JSON.parse(await readFile(temporaryRelease, 'utf8')), {
      revision,
      version: JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version,
    })
  }
  finally {
    await rm(temporaryRelease, { force: true })
  }
})

test('release metadata rejects a missing or abbreviated revision', () => {
  assert.throws(
    () => releaseMetadata({ AVASAN_RELEASE_REVISION: 'abc123' }),
    /full 40-character Git commit SHA/u,
  )
})

test('release metadata rejects an unrelated full commit override', () => {
  for (const key of ['AVASAN_RELEASE_REVISION', 'SOURCE_REVISION', 'COMMIT_REF', 'GITHUB_SHA'])
    assert.throws(() => releaseMetadata({ [key]: 'a'.repeat(40) }), /differs from the actual/u)
})
