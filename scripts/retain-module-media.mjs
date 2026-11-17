// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Each GitHub Pages deploy replaces the whole site, and module media lives in a folder per module version. A tab opened
// before a release still asks for the previous version's clips and screenshots, which would then be gone. So a release
// keeps every file it drops for a week, copied from the live site, and module-media/manifest.json records when each one
// left the catalogue. Run after the build: node scripts/retain-module-media.mjs [dist]
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export const RETAIN_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_BYTES = 200 * 1024 * 1024
const MANIFEST = 'manifest.json'

/** A path below module-media/: plain segments only, never '.', '..' or the manifest itself. */
export function safeMediaPath(path) {
  return typeof path === 'string' && path !== MANIFEST && path.length <= 300 && path.split('/').every(part => /^[A-Za-z0-9._-]+$/.test(part) && part !== '.' && part !== '..')
}

/** The new manifest's current files, and which of the live site's files to carry over with the time each was retired. */
export function planRetention(current, live, now) {
  const files = Object.fromEntries(current.map(path => [path, {}]))
  const carry = []
  const entries = live && typeof live === 'object' && live.files && typeof live.files === 'object' ? Object.entries(live.files) : []
  for (const [path, entry] of entries) {
    if (Object.hasOwn(files, path) || !safeMediaPath(path)) continue
    const stamp = Date.parse(entry?.retiredAt)
    // A file the live build still served retires now; a stamp from the future is treated the same way.
    const retired = Number.isFinite(stamp) && stamp <= now ? stamp : now
    if (now - retired < RETAIN_MS) carry.push({ path, retiredAt: new Date(retired).toISOString() })
  }
  return { files, carry }
}

async function listFiles(root, folder = root) {
  const entries = await readdir(folder, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error })
  const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? listFiles(root, join(folder, entry.name)) : [relative(root, join(folder, entry.name)).split(sep).join('/')]))
  return nested.flat()
}

export async function retainModuleMedia(dist, site, { fetch: get = fetch, now = Date.now(), log = console, maxBytes = MAX_BYTES } = {}) {
  const root = resolve(dist, 'module-media'), base = new URL('module-media/', site)
  const current = (await listFiles(root)).filter(path => path !== MANIFEST)
  let live = null
  try {
    const response = await get(new URL(MANIFEST, base), { cache: 'no-store' })
    if (response.ok) live = await response.json()
    else log.warn(`No live module media manifest (HTTP ${response.status}); nothing to carry over.`)
  } catch (error) { log.warn('The live module media manifest could not be read: ' + (error instanceof Error ? error.message : error)) }
  const { files, carry } = planRetention(current, live, now)
  let bytes = 0, kept = 0
  for (const item of carry) {
    try {
      const response = await get(new URL(item.path, base))
      if (!response.ok) { log.warn(`Not kept: ${item.path} (HTTP ${response.status})`); continue }
      const body = Buffer.from(await response.arrayBuffer())
      if (bytes + body.length > maxBytes) { log.warn(`Stopped carrying files over at ${maxBytes} bytes; the rest are dropped.`); break }
      const target = join(root, ...item.path.split('/'))
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, body)
      files[item.path] = { retiredAt: item.retiredAt }
      bytes += body.length; kept++
    } catch (error) { log.warn(`Not kept: ${item.path} (${error instanceof Error ? error.message : error})`) }
  }
  await mkdir(root, { recursive: true })
  await writeFile(join(root, MANIFEST), JSON.stringify({ version: 1, files }) + '\n')
  log.log(`Module media: ${current.length} current files, ${kept} earlier ones kept (${bytes} bytes) for tabs opened before this release.`)
  return { current: current.length, kept, bytes }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await retainModuleMedia(process.argv[2] ?? 'dist', process.env.MODWERK_SITE ?? 'https://modwerk.app/')
}
