import { copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import downloads from '../src/engine/assets/linked-audio-0.7.11/downloads.json' with { type: 'json' }

/** Preserve file URLs embedded in already-open 0.7.11 installers after a package is relinked. */
export function octatrackPublishedDownloads(): Plugin {
  const aliases = new Map(Object.entries(downloads))
  let publicDir: string
  return {
    name: 'octatrack-retained-downloads',
    configResolved(config) { publicDir = config.publicDir },
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url) {
          const url = new URL(req.url, 'http://localhost')
          const target = aliases.get(url.pathname.slice(1))
          if (target) req.url = '/' + target + url.search
        }
        next()
      })
    },
    async writeBundle({ dir }) {
      if (!dir) return
      for (const [original, retained] of aliases) {
        await copyFile(resolve(publicDir, retained), resolve(dir, original))
      }
    },
  }
}
