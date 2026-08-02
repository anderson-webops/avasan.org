import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const testDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(testDirectory, '..')
const releaseSourceGate = resolve(projectRoot, 'deploy/direct/verify-release-source.sh')
const nginxSnippetGate = resolve(projectRoot, 'deploy/direct/verify-nginx-snippet-dump.sh')
const temporaryDirectories = []

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function runGate(script, args) {
  return spawnSync('bash', [script, ...args], { encoding: 'utf8' })
}

async function createReleaseRepository() {
  const directory = await mkdtemp(join(tmpdir(), 'avasan-release-gate-'))
  temporaryDirectories.push(directory)
  git(directory, 'init', '--quiet', '--initial-branch=main')
  git(directory, 'config', 'user.email', 'release-gate@example.invalid')
  git(directory, 'config', 'user.name', 'Release Gate Test')
  await writeFile(join(directory, 'release.txt'), 'release\n')
  git(directory, 'add', 'release.txt')
  git(directory, 'commit', '--quiet', '-m', 'Release')
  git(directory, 'remote', 'add', 'origin', 'git@github.com:anderson-webops/avasan.org.git')
  git(directory, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  git(directory, 'tag', '--annotate', 'v1.2.3', '-m', 'v1.2.3')
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, {
    force: true,
    recursive: true,
  })))
})

describe('native release source gate', () => {
  test('accepts the annotated package tag at exact canonical origin/main', async () => {
    const repository = await createReleaseRepository()
    const result = runGate(releaseSourceGate, [repository, '1.2.3'])

    assert.equal(result.status, 0)
    assert.match(result.stdout, /Verified annotated v1\.2\.3 at exact origin\/main revision/u)
  })

  test('rejects a lightweight release tag', async () => {
    const repository = await createReleaseRepository()
    git(repository, 'tag', '--delete', 'v1.2.3')
    git(repository, 'tag', 'v1.2.3')

    const result = runGate(releaseSourceGate, [repository, '1.2.3'])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /must exist as an annotated tag/u)
  })

  test('rejects a candidate that is not exact origin/main', async () => {
    const repository = await createReleaseRepository()
    await writeFile(join(repository, 'next.txt'), 'next\n')
    git(repository, 'add', 'next.txt')
    git(repository, 'commit', '--quiet', '-m', 'Unpublished')

    const result = runGate(releaseSourceGate, [repository, '1.2.3'])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /not the exact fetched origin\/main/u)
  })

  test('rejects a checkout from another origin', async () => {
    const repository = await createReleaseRepository()
    git(repository, 'remote', 'set-url', 'origin', 'git@github.com:anderson-webops/math.avasan.org.git')

    const result = runGate(releaseSourceGate, [repository, '1.2.3'])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /origin is not anderson-webops\/avasan\.org/u)
  })
})

describe('effective Nginx snippet gate', () => {
  const snippets = [
    '/etc/nginx/snippets/avasan.org-http-maps.conf',
    '/etc/nginx/snippets/avasan.org-server-policy.conf',
  ]

  async function writeDump(markers) {
    const directory = await mkdtemp(join(tmpdir(), 'avasan-nginx-gate-'))
    temporaryDirectories.push(directory)
    const dump = join(directory, 'nginx-T.txt')
    await writeFile(dump, `${markers.join('\n')}\n`)
    return dump
  }

  test('accepts each required snippet exactly once', async () => {
    const dump = await writeDump(snippets.map(snippet => `# configuration file ${snippet}:`))
    const result = runGate(nginxSnippetGate, [dump, ...snippets])

    assert.equal(result.status, 0)
    assert.match(result.stdout, /loaded exactly once/u)
  })

  for (const problem of ['missing', 'duplicate']) {
    test(`rejects a ${problem} required snippet`, async () => {
      const markers = snippets.map(snippet => `# configuration file ${snippet}:`)
      if (problem === 'missing')
        markers.pop()
      else
        markers.push(markers[0])
      const dump = await writeDump(markers)
      const result = runGate(nginxSnippetGate, [dump, ...snippets])

      assert.notEqual(result.status, 0)
      assert.match(result.stderr, /exactly once/u)
    })
  }
})
