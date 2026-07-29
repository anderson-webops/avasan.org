import process, { env, exit } from 'node:process'

import { createApp } from './app.js'
import 'dotenv/config'

async function main() {
  const app = createApp()
  const port = Number(env.PORT || 3006)
  const host = env.HOST || env.BACKEND_HOST || '127.0.0.1'

  const server = app.listen(port, host, () => {
    console.log(`Server listening on http://${host}:${port}!`)
  })

  let isShuttingDown = false

  const shutdown = async (signal: NodeJS.Signals) => {
    if (isShuttingDown) {
      return
    }

    isShuttingDown = true
    console.log(`${signal} received, shutting down gracefully...`)

    try {
      if (server.listening) {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error)
              return
            }

            resolve()
          })
        })
      }

      console.log('Graceful shutdown complete.')
      exit(0)
    }
    catch (error) {
      console.error('Graceful shutdown failed:', error)
      exit(1)
    }
  }

  process.once('SIGINT', () => {
    void shutdown('SIGINT')
  })
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM')
  })
}

main().catch((error) => {
  console.error(error)
  exit(1)
})
