import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..')
const defaultOutput = resolve(projectRoot, 'front-end/.output/public/release.json')
const releaseVersionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/u
const sourceRevisionPattern = /^[0-9a-f]{40}$/u

function gitRevision() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

export function releaseMetadata(environment = process.env) {
  const rootPackage = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'))
  const version = rootPackage.version
  const revision = (
    environment.AVASAN_RELEASE_REVISION
    || environment.SOURCE_REVISION
    || environment.COMMIT_REF
    || environment.GITHUB_SHA
    || gitRevision()
  ).trim().toLowerCase()

  if (!releaseVersionPattern.test(version))
    throw new Error('The root package version must be a semantic version.')
  if (!sourceRevisionPattern.test(revision))
    throw new Error('The release revision must be a full 40-character Git commit SHA.')

  return { revision, version }
}

export async function writeReleaseMetadata(
  target = defaultOutput,
  environment = process.env,
) {
  const metadata = releaseMetadata(environment)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
  return metadata
}

const invokedUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === invokedUrl)
  await writeReleaseMetadata()
