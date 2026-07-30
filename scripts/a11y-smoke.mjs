import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const require = createRequire(import.meta.url)
const axeSourcePath = require.resolve('axe-core/axe.min.js')
const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const frontendRoot = resolve(projectRoot, 'front-end')
const nuxtPackagePath = require.resolve('nuxt/package.json')
const nuxtPackage = JSON.parse(readFileSync(nuxtPackagePath, 'utf8'))
const nuxtCliPath = resolve(dirname(nuxtPackagePath), nuxtPackage.bin.nuxt)

const siteName = 'avasan.org'
const frontendPort = Number(process.env.A11Y_FRONTEND_PORT || 3356)
const baseUrl = `http://127.0.0.1:${frontendPort}`
const routes = [
  '/',
]
const colorSchemes = (process.env.A11Y_COLOR_SCHEMES || 'light,dark')
  .split(',')
  .map(scheme => scheme.trim())
  .filter(Boolean)

const chromeCandidates = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter(Boolean)

const chromePath = chromeCandidates.find(candidate => existsSync(candidate))
if (chromePath)
  process.env.PUPPETEER_EXECUTABLE_PATH = chromePath

function writeServerLine(prefix, data) {
  const text = data.toString().trim()
  if (text)
    process.stderr.write(`[${prefix}] ${text}\n`)
}

async function waitForHttp(url, timeoutMs = 45_000) {
  const start = Date.now()
  let lastError
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok)
        return
      lastError = new Error(`${url} returned ${response.status}`)
    }
    catch (error) {
      lastError = error
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 400))
  }
  throw lastError || new Error(`Timed out waiting for ${url}`)
}

function startFrontend() {
  const child = spawn(process.execPath, [
    nuxtCliPath,
    'dev',
    '--host',
    '127.0.0.1',
    '--port',
    String(frontendPort),
  ], {
    cwd: frontendRoot,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      BROWSER: 'none',
      NUXT_A11Y_SCAN: 'true',
      NUXT_TELEMETRY_DISABLED: '1',
      NUXT_PUBLIC_APP_URL: baseUrl,
      NUXT_PUBLIC_SITE_URL: baseUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', data => writeServerLine('nuxt', data))
  child.stderr.on('data', data => writeServerLine('nuxt', data))
  return child
}

function delay(durationMs) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, durationMs))
}

function signalProcessTree(child, signal) {
  if (!child.pid)
    return false

  try {
    if (process.platform === 'win32')
      return child.kill(signal)

    process.kill(-child.pid, signal)
    return true
  }
  catch (error) {
    if (error?.code === 'ESRCH')
      return false
    throw error
  }
}

async function stopProcessTree(child) {
  if (!child.pid)
    return

  signalProcessTree(child, 'SIGTERM')
  await delay(1_000)

  if (process.platform === 'win32') {
    if (child.exitCode === null)
      signalProcessTree(child, 'SIGKILL')
  }
  else {
    try {
      process.kill(-child.pid, 0)
      signalProcessTree(child, 'SIGKILL')
    }
    catch (error) {
      if (error?.code !== 'ESRCH')
        throw error
    }
  }

  await Promise.race([
    new Promise(resolveClose => child.once('close', resolveClose)),
    delay(1_000),
  ])
}

async function analyzePage(browser, route, scheme) {
  const url = `${baseUrl}${route}`
  const page = await browser.newPage()
  page.setDefaultTimeout(30_000)
  await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1 })
  if (scheme === 'dark' || scheme === 'light') {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }])
  }
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 8_000 }).catch(() => {})
  await page.addScriptTag({ path: axeSourcePath })
  const result = await page.evaluate(async () => {
    return await globalThis.axe.run(document, {
      resultTypes: ['violations'],
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa'],
      },
    })
  })
  await page.close()
  return {
    url,
    scheme,
    violations: result.violations.filter(violation => violation.id !== 'frame-tested'),
  }
}

const frontendProcess = startFrontend()
let browser

try {
  await waitForHttp(baseUrl)

  browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })

  const failures = []
  for (const route of routes) {
    for (const scheme of colorSchemes) {
      const result = await analyzePage(browser, route, scheme)
      if (result.violations.length) {
        failures.push(result)
        continue
      }
      console.log(`a11y ok: ${result.url} [${scheme}]`)
    }
  }

  if (failures.length) {
    for (const failure of failures) {
      console.error(`\nAccessibility issues for ${siteName} at ${failure.url} [${failure.scheme}]`)
      for (const violation of failure.violations) {
        console.error(`- [${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.help}`)
        console.error(`  ${violation.helpUrl}`)
        for (const node of violation.nodes) {
          console.error(`  ${node.target.join(', ')}`)
        }
      }
    }
    process.exitCode = 1
  }
}
finally {
  if (browser)
    await browser.close()
  await stopProcessTree(frontendProcess)
}
