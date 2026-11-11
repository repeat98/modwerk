// Zoom effect files (module contract v3, platform zdl): `npm run zdl:vendor` puts each module's pinned release file in
// public/zoom-effects/<id>/<version>/<file>, where the site serves it to the pedal page's install. These checks hold the
// committed file to its pin and its header to the manifest, and keep names and effect IDs apart (docs/ZDL_MODULE_CONTRACT.md).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { effectInfo } from '../src/engine/zoom/zoom-protocol.ts'

export const ZDL_FOLDER = 'public/zoom-effects'
export const zdlPath = document => ZDL_FOLDER + '/' + document.id + '/' + document.version + '/' + document.platform.file

export function requireZdlBinary(root, label, document) {
  const path = zdlPath(document), { binary, effectId, effectVersion } = document.platform
  if (!existsSync(resolve(root, path))) throw new Error(label + ': ' + path + ' is missing. Run npm run zdl:vendor -- ' + document.id + ' (docs/ZDL_MODULE_CONTRACT.md#install).')
  const data = readFileSync(resolve(root, path)), sha256 = createHash('sha256').update(data).digest('hex')
  if (sha256 !== binary.sha256 || data.length !== binary.bytes) throw new Error(label + ': ' + path + ' is not the pinned release file (it has sha256 ' + sha256 + ', ' + data.length + ' bytes)')
  const info = effectInfo(data)
  if (!info || info.gid !== effectId.gid || info.fxid !== effectId.fxid || info.version !== effectVersion) throw new Error(label + ': the file’s header names ' + (info ? info.gid + '/' + info.fxid + ', version ' + info.version : 'no effect') + '; the manifest says ' + effectId.gid + '/' + effectId.fxid + ', version ' + effectVersion)
}

// Two effects with one name or one effect ID can't share a pedal (one becomes unreachable, and a swap froze a pedal at boot).
export function requireDistinctZdl(documents) {
  const seen = new Map()
  for (const document of documents) for (const key of ['file ' + document.platform.file.toUpperCase(), 'effect ID ' + document.platform.effectId.gid + '/' + document.platform.effectId.fxid]) {
    if (seen.has(key) && seen.get(key) !== document.id) throw new Error('zoom/' + document.id + ' and ' + seen.get(key) + ' have the same ' + key + '. Each Zoom effect takes its own (docs/ZDL_MODULE_CONTRACT.md#effect-ids).')
    seen.set(key, document.id)
  }
}

// A module update replaces its file: the site serves only what a manifest names.
export function unlistedZdl(root, documents) {
  const named = new Set(documents.map(zdlPath)), base = resolve(root, ZDL_FOLDER)
  if (!existsSync(base)) return
  const files = [], walk = path => { for (const name of readdirSync(resolve(root, path))) { const child = path + '/' + name; if (statSync(resolve(root, child)).isDirectory()) walk(child); else files.push(child) } }
  walk(ZDL_FOLDER)
  const stale = files.filter(path => !named.has(path))
  if (stale.length) throw new Error(stale.join(', ') + ': no Zoom effect module names ' + (stale.length > 1 ? 'these' : 'this') + ' any more. git rm ' + stale.join(' '))
}
