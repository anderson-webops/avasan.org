import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, readFile, writeFile } from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

assert.equal(process.cwd(), '/app')
for (const path of ['/app/node_modules', '/app/.git', '/app/back-end', '/home/builder/source', '/mnt/input'])
  await assert.rejects(access(path))
const identity = JSON.parse(await readFile('/app/front-end/.output/public/release.json', 'utf8'))
const held = net.createServer()
await new Promise(resolve => held.listen(0, '127.0.0.1', resolve))
const port = held.address().port
await new Promise(resolve => held.close(resolve))
const policy = (await readFile('/app/deploy/nginx/server-policy.conf', 'utf8'))
  .replace('/srv/avasan.org/current/front-end/.output/public', '/app/front-end/.output/public')
await writeFile('/tmp/policy.conf', policy)
const serverBlock = (await readFile('/harness/nginx-server.conf', 'utf8'))
  .replace('listen 80;', `listen 127.0.0.1:${port};`)
  .replace('listen [::]:80;', `listen [::1]:${port};`)
  .replace('/etc/nginx/snippets/avasan.org-http-maps.conf', '/app/deploy/nginx/http-maps.conf')
  .replace('/etc/nginx/snippets/avasan.org-server-policy.conf', '/tmp/policy.conf')
await writeFile('/tmp/nginx.conf', `daemon off; master_process off; pid /tmp/nginx.pid;
error_log stderr notice;
events { worker_connections 128; }
http { include /etc/nginx/mime.types; access_log off;
client_body_temp_path /tmp/body; proxy_temp_path /tmp/proxy; fastcgi_temp_path /tmp/fastcgi;
uwsgi_temp_path /tmp/uwsgi; scgi_temp_path /tmp/scgi;
${serverBlock}
}`)
const server = spawn('/usr/sbin/nginx', ['-p', '/tmp', '-c', '/tmp/nginx.conf'], { stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
for (const stream of [server.stdout, server.stderr])
  stream.on('data', bytes => output = (output + bytes.toString()).slice(-4000))
const exit = new Promise(resolve => server.once('exit', (code, signal) => resolve({ code, signal })))
function request(path, { method = 'GET', ipv6 = false } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: ipv6 ? '::1' : '127.0.0.1', port, path, method, headers: { Host: 'avasan.org' }, agent: false }, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (bytes) => {
        body += bytes
        if (body.length > 4 * 1024 * 1024)
          req.destroy(new Error('Fixture body exceeded limit'))
      })
      response.on('error', reject)
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }))
    })
    req.on('error', reject)
    req.setTimeout(3000, () => req.destroy(new Error('Fixture deadline exceeded')))
    req.end()
  })
}
try {
  let ready = false
  for (let i = 0; i < 40; i++) {
    try {
      ready = (await request('/')).status === 200
    }
    catch {}
    if (ready)
      break
    await delay(100)
  }
  assert.ok(ready, output)
  for (const ipv6 of [false, true]) {
    const home = await request('/', { ipv6 })
    assert.equal(home.status, 200)
    assert.match(home.body, /href="https:\/\/cs\.avasan\.org"/u)
    assert.match(home.body, /href="https:\/\/math\.avasan\.org"/u)
    assert.doesNotMatch(home.body, /analytics|<form\b|<script[^>]+src="https?:/iu)
    assert.equal(home.headers['set-cookie'], undefined)
    assert.match(home.headers['content-security-policy'], /frame-ancestors 'none'/u)
    const release = await request('/release.json', { ipv6 })
    assert.deepEqual(JSON.parse(release.body), identity)
    assert.match(release.headers['cache-control'], /no-store/u)
    assert.equal((await request('/release.json', { ipv6, method: 'HEAD' })).body, '')
    const assetPath = home.body.match(/(?:href|src)="(\/_nuxt\/[^"]+)"/u)?.[1]
    assert.ok(assetPath)
    assert.match((await request(assetPath, { ipv6 })).headers['cache-control'], /immutable/u)
    for (const path of ['/missing', '/404.html', '/api', '/api/health', '/healthz', '/readyz', '/.env', '/.avasan-static-release.json']) {
      const response = await request(path, { ipv6 })
      assert.equal(response.status, 404, path)
      assert.match(response.body, /Page not found/u)
      assert.equal(response.headers['set-cookie'], undefined)
    }
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
      const response = await request('/', { ipv6, method })
      assert.equal(response.status, 405)
      assert.equal(response.headers.allow, 'GET, HEAD')
    }
  }
  server.kill('SIGQUIT')
  assert.deepEqual(await exit, { code: 0, signal: null })
  console.log(JSON.stringify({ sterileStaticArtifact: 'passed', server: 'nginx', revision: identity.revision, version: identity.version, residentApplicationProcessesRequired: 0, addressFamilies: ['IPv4', 'IPv6'] }))
}
finally {
  if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGKILL')
    await exit
  }
}
