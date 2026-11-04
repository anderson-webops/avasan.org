import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { join, resolve } from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { rootCertificates } from 'node:tls'
import { listen } from 'listhen'
import { getSecureResponse } from '../scripts/trusted-https-test-client.mjs'

const repository = resolve(import.meta.dirname, '..')
const readManifest = async relative => JSON.parse(await readFile(join(repository, relative), 'utf8'))

async function fixture() {
  const scratch = join(repository, '.ai-work/runs')
  await mkdir(scratch, { recursive: true })
  const root = await mkdtemp(join(scratch, 'preview-entrypoints-'))
  await mkdir(join(root, 'front-end/.output/public'), { recursive: true })
  await mkdir(join(root, 'scripts'))
  for (const [filename, contents] of [
    ['index.html', 'Synthetic preview'],
    ['404.html', 'Not found'],
    ['release.json', '{"fixture":true}'],
  ])
    await writeFile(join(root, 'front-end/.output/public', filename), contents)
  await copyFile(join(repository, 'scripts/static-preview-server.mjs'), join(root, 'scripts/static-preview-server.mjs'))
  const manifest = await readManifest('package.json')
  const frontend = await readManifest('front-end/package.json')
  await writeFile(join(root, 'package.json'), JSON.stringify({
    private: true,
    workspaces: ['front-end'],
    scripts: { preview: manifest.scripts.preview },
  }))
  await writeFile(join(root, 'front-end/package.json'), JSON.stringify({
    name: 'preview-fixture',
    private: true,
    scripts: { 'preview': frontend.scripts.preview, 'preview-https': frontend.scripts['preview-https'] },
  }))
  await writeFile(join(root, '.npmrc'), 'allow-remote=none\n')
  const reservation = net.createServer()
  reservation.listen(0, '127.0.0.1')
  await once(reservation, 'listening')
  const port = reservation.address().port
  await new Promise(resolveClose => reservation.close(resolveClose))
  return { root, port }
}

function start(root, port, arguments_, tls = {}) {
  const child = spawn(process.execPath, arguments_, {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      HOME: root,
      TMPDIR: root,
      NPM_CONFIG_CACHE: join(root, 'npm-cache'),
      NPM_CONFIG_OFFLINE: 'true',
      NPM_CONFIG_YES: 'false',
      PORT: String(port),
      ...tls,
    },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const exited = once(child, 'exit')
  let output = ''
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', bytes => output = (output + bytes).slice(-8000))
  return {
    child,
    exited,
    output: () => output,
  }
}

async function ready(running) {
  for (let attempt = 0; attempt < 120 && !running.output().includes('listening') && running.child.exitCode === null; attempt += 1)
    await delay(30)
  assert.match(running.output(), /listening/u)
}

async function beforeDeadline(promise, milliseconds, message) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, rejectResult) => {
        timer = setTimeout(() => rejectResult(new Error(message)), milliseconds)
      }),
    ])
  }
  finally {
    clearTimeout(timer)
  }
}

function signalGroup(running, signal) {
  try {
    process.kill(-running.child.pid, signal)
  }
  catch (error) {
    if (error.code !== 'ESRCH')
      throw error
  }
}

async function stop(running) {
  let failure
  try {
    signalGroup(running, 'SIGTERM')
    await beforeDeadline(running.exited, 6500, 'Preview process did not exit')
  }
  catch (error) {
    failure = error
  }
  signalGroup(running, 'SIGKILL')
  await running.exited
  if (failure)
    throw failure
}

async function certificate(root) {
  const issuer = await listen((_request, response) => response.end('fixture'), {
    hostname: '127.0.0.1',
    port: 0,
    autoClose: false,
    isTest: true,
    https: {
      domains: ['localhost', '127.0.0.1'],
      validityDays: 1,
    },
  })
  const material = issuer.https
  await issuer.close()
  const key = join(root, 'key.pem')
  const cert = join(root, 'cert.pem')
  await writeFile(key, material.key, { mode: 0o600 })
  await writeFile(cert, material.cert, { mode: 0o600 })
  return {
    material,
    environment: { AVASAN_PREVIEW_TLS_KEY: key, AVASAN_PREVIEW_TLS_CERT: cert },
  }
}

test('preview entry points use only the maintained locked static listener', async () => {
  const manifest = await readManifest('package.json')
  const frontend = await readManifest('front-end/package.json')
  assert.equal(manifest.scripts.preview, 'node scripts/static-preview-server.mjs')
  assert.equal(frontend.scripts.preview, 'cd .. && node scripts/static-preview-server.mjs')
  assert.equal(frontend.scripts['preview-https'], 'cd .. && node scripts/static-preview-server.mjs --https')
})

for (const scope of ['root', 'workspace']) {
  test(`${scope} HTTP preview works without remotely installed tools`, { timeout: 12000 }, async () => {
    const { root, port } = await fixture()
    assert.ok(process.env.npm_execpath)
    const running = start(root, port, [
      process.env.npm_execpath,
      'run',
      ...(scope === 'workspace'
        ? ['--workspace', 'front-end']
        : []),
      'preview',
    ])
    try {
      await ready(running)
      const response = await fetch(`http://127.0.0.1:${port}/`)
      assert.equal(response.status, 200)
      assert.equal(await response.text(), 'Synthetic preview')
    }
    finally {
      await stop(running)
      await rm(root, { recursive: true })
    }
  })
}

test('workspace HTTPS preview authenticates supplied local certificates', { timeout: 15000 }, async () => {
  const { root, port } = await fixture()
  const issued = await certificate(root)
  assert.ok(process.env.npm_execpath)
  const running = start(root, port, [
    process.env.npm_execpath,
    'run',
    '--workspace',
    'front-end',
    'preview-https',
  ], issued.environment)
  try {
    await ready(running)
    const url = `https://127.0.0.1:${port}/`
    await assert.rejects(getSecureResponse(url))
    await assert.rejects(getSecureResponse(url, rootCertificates[0]))
    await assert.rejects(getSecureResponse(url, issued.material.cert, 'wrong.invalid'), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' })
    assert.deepEqual(await getSecureResponse(url, issued.material.cert), { status: 200, body: 'Synthetic preview' })
    assert.deepEqual(await getSecureResponse(`${url}api`, issued.material.cert), { status: 404, body: 'Not found' })
    assert.doesNotMatch(running.output(), /BEGIN .*PRIVATE KEY/u)
  }
  finally {
    await stop(running)
    await rm(root, { recursive: true })
  }
})

test('HTTPS preview fails closed without configured certificate files', { timeout: 10000 }, async () => {
  const { root, port } = await fixture()
  const running = start(root, port, ['scripts/static-preview-server.mjs', '--https'])
  try {
    const result = await beforeDeadline(running.exited, 5000, 'Missing TLS configuration did not fail closed')
    assert.notEqual(result[0], 0)
    assert.match(running.output(), /AVASAN_PREVIEW_TLS_KEY.*AVASAN_PREVIEW_TLS_CERT/u)
    assert.doesNotMatch(running.output(), /listening/u)
  }
  finally {
    await stop(running)
    await rm(root, { recursive: true })
  }
})

test('HTTPS preview rejects malformed certificate material without disclosure', { timeout: 10000 }, async () => {
  const { root, port } = await fixture()
  const key = join(root, 'invalid-key.pem')
  const cert = join(root, 'invalid-cert.pem')
  const marker = 'synthetic-private-fixture-value'
  await writeFile(key, marker, { mode: 0o600 })
  await writeFile(cert, 'invalid-certificate', { mode: 0o600 })
  const running = start(root, port, ['scripts/static-preview-server.mjs', '--https'], { AVASAN_PREVIEW_TLS_KEY: key, AVASAN_PREVIEW_TLS_CERT: cert })
  try {
    const result = await beforeDeadline(running.exited, 5000, 'Invalid TLS configuration did not fail closed')
    assert.notEqual(result[0], 0)
    assert.match(running.output(), /readable, valid PEM/u)
    assert.ok(!running.output().includes(marker))
    assert.doesNotMatch(running.output(), /listening/u)
  }
  finally {
    await stop(running)
    await rm(root, { recursive: true })
  }
})

test('HTTPS preview bounds shutdown while a client withholds its TLS handshake', { timeout: 12000 }, async () => {
  const { root, port } = await fixture()
  const issued = await certificate(root)
  const running = start(root, port, ['scripts/static-preview-server.mjs', '--https'], issued.environment)
  let held
  try {
    await ready(running)
    held = net.connect(port, '127.0.0.1')
    held.on('error', () => {})
    await once(held, 'connect')
    running.child.kill('SIGTERM')
    await delay(30)
    running.child.kill('SIGTERM')
    const result = await beforeDeadline(running.exited, 6500, 'TLS handshake prevented bounded shutdown')
    assert.deepEqual(result, [0, null])
  }
  finally {
    held?.destroy()
    await stop(running)
    await rm(root, { recursive: true })
  }
})
