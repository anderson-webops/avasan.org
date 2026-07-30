import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const projectRoot = process.cwd()
const staticOutput = resolve(projectRoot, 'front-end/.output/public')
const distDirectory = resolve(projectRoot, 'dist')
const workerSourcePath = resolve(projectRoot, 'sites/worker.js')
const indexHtml = await readFile(resolve(staticOutput, 'index.html'), 'utf8')
const workerSource = await readFile(workerSourcePath, 'utf8')
const htmlMarker = 'const bundledIndexHtml = null'

if (!workerSource.includes(htmlMarker))
  throw new Error('Sites worker is missing its bundled HTML marker.')

const generatedWorker = workerSource.replace(
  htmlMarker,
  `const bundledIndexHtml = ${JSON.stringify(indexHtml)}`,
)

await rm(distDirectory, { force: true, recursive: true })
await mkdir(resolve(distDirectory, 'server'), { recursive: true })
await cp(staticOutput, resolve(distDirectory, 'assets'), { recursive: true })
for (const filename of ['200.html', '404.html', 'index.html'])
  await rm(resolve(distDirectory, 'assets', filename), { force: true })
await writeFile(resolve(distDirectory, 'server/index.js'), generatedWorker)
