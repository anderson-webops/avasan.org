import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'

export function releaseIdentity(root, version, env = {}) {
  function git(...args) {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  }
  function optionalGit(...args) {
    try {
      return git(...args)
    }
    catch {
      return ''
    }
  }
  const top = git('rev-parse', '--show-toplevel')
  if (!top || realpathSync(top) !== realpathSync(root))
    throw new Error('Build identity requires the actual source checkout.')
  const commit = git('rev-parse', 'HEAD')
  if (!/^[a-f0-9]{40}$/u.test(commit))
    throw new Error('A full 40-character source commit is required for deployment metadata.')
  for (const field of ['SOURCE_COMMIT', 'COMMIT_REF', 'GITHUB_SHA']) {
    if (env[field]?.trim() && env[field].trim().toLowerCase() !== commit)
      throw new Error(`${field} does not match the source checkout.`)
  }
  const branch = (env.SOURCE_BRANCH || env.BRANCH || env.GITHUB_REF_NAME || git('rev-parse', '--abbrev-ref', 'HEAD')).trim()
  if (!branch || /[\r\n]/u.test(branch))
    throw new Error('A single-line source branch is required for deployment metadata.')
  const expectedTag = `v${version}`
  const ref = `refs/tags/${expectedTag}`
  const dirty = git('status', '--porcelain').length !== 0
  const releaseVerified = !dirty && optionalGit('cat-file', '-t', ref) === 'tag' && optionalGit('rev-parse', `${ref}^{commit}`) === commit
  const tag = releaseVerified ? expectedTag : null
  if (env.SOURCE_TAG?.trim() && env.SOURCE_TAG.trim() !== tag)
    throw new Error('SOURCE_TAG must be an exact annotated tag of the clean checkout.')
  if (env.SOURCE_RELEASE_REQUIRED === '1' && !releaseVerified)
    throw new Error('Release preparation requires a clean checkout at its annotated version tag.')
  return { commit, branch, tag, dirty, releaseVerified }
}
