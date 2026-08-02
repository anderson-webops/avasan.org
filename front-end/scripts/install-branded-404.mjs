import { copyFile } from 'node:fs/promises'

await copyFile(
  new URL('../404.html', import.meta.url),
  new URL('../.output/public/404.html', import.meta.url),
)
