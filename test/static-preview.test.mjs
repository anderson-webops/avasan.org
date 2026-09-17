import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

test('preview normalizes static policy and drains interrupted clients after repeated signals', { timeout: 12_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'avasan-preview-'))
  const publicRoot = join(root, 'front-end/.output/public')
  await mkdir(publicRoot, { recursive: true })
  await writeFile(join(publicRoot, 'index.html'), 'Synthetic public homepage')
  await writeFile(join(publicRoot, '404.html'), 'Page not found')
  await writeFile(join(publicRoot, 'release.json'), '{"ok":true}\n')
  const held = net.createServer()
  held.listen(0, '127.0.0.1')
  await once(held, 'listening')
  const port = held.address().port
  await new Promise(resolve => held.close(resolve))
  const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/static-preview-server.mjs', import.meta.url))], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const exit = once(child, 'exit')
  let logs = ''
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', bytes => logs = (logs + bytes).slice(-4000))
  let slow
  try {
    for (let i = 0; i < 60 && !logs.includes('listening'); i++)
      await delay(30)
    assert.match(logs, /listening/u)
    const base = `http://127.0.0.1:${port}`
    for (const path of ['/404.html', '/%34%30%34.html', '/api', '/healthz', '/readyz', '/.env']) {
      const response = await fetch(base + path)
      assert.equal(response.status, 404, path)
      assert.equal(await response.text(), 'Page not found')
    }
    const release = await fetch(`${base}/%72elease.json`, { method: 'HEAD' })
    assert.equal(release.status, 200)
    assert.equal(release.headers.get('cache-control'), 'no-store')
    assert.equal(await release.text(), '')
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => {
        const req = http.get(`${base}/`, response => response.destroy())
        req.on('error', () => {})
        req.on('close', resolve)
      })
    }
    slow = net.connect(port, '127.0.0.1')
    slow.on('error', () => {})
    await once(slow, 'connect')
    slow.write('GET / HTTP/1.1\r\nHost: local\r\nX-Incomplete: ')
    child.kill('SIGTERM')
    await delay(30)
    child.kill('SIGTERM')
    assert.deepEqual(await exit, [0, null])
    assert.doesNotMatch(logs, /uncaught|ERR_STREAM|Error:/u)
  }
  finally {
    slow?.destroy()
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await exit
    }
    await rm(root, { recursive: true, force: true })
  }
})
