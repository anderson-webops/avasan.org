import assert from 'node:assert/strict'
import { readFile, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { releaseMetadata, writeReleaseMetadata } from '../scripts/write-release-metadata.mjs'

const testDirectory = dirname(fileURLToPath(import.meta.url))
const temporaryRelease = resolve(testDirectory, '.release-metadata.test.json')

test('release metadata records only the semantic version and exact source revision', async () => {
  const revision = 'a'.repeat(40)
  assert.deepEqual(releaseMetadata({ AVASAN_RELEASE_REVISION: revision }), {
    revision,
    version: '1.2.7',
  })

  try {
    await writeReleaseMetadata(temporaryRelease, { AVASAN_RELEASE_REVISION: revision })
    assert.deepEqual(JSON.parse(await readFile(temporaryRelease, 'utf8')), {
      revision,
      version: '1.2.7',
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
