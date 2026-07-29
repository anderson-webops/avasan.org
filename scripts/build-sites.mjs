import { cp, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const projectRoot = process.cwd()
const staticOutput = resolve(projectRoot, 'front-end/.output/public')
const distDirectory = resolve(projectRoot, 'dist')

await rm(distDirectory, { force: true, recursive: true })
await mkdir(resolve(distDirectory, 'server'), { recursive: true })
await cp(staticOutput, resolve(distDirectory, 'assets'), { recursive: true })
await cp(resolve(projectRoot, 'sites/worker.js'), resolve(distDirectory, 'server/index.js'))
