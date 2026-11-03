// SPDX-License-Identifier: GPL-3.0-or-later
// Startup-trusted private preparation inputs, never MCP tool arguments.
import { readFile, lstat, realpath } from 'node:fs/promises'
import { resolve, join, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { assertMcpPrivateHost } from './frontend-mcp-private-host.mjs'

const PORTS = new Set(['playmodes', 'tapeecho', 'euclid', 'cc-map', 'recorder-loop-fix'])
const digest = data => createHash('sha256').update(data).digest('hex')
const privateFile = async (path, maximum, root) => {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum || info.mode & 0o077)
    throw new Error('Private preparation inputs must be bounded regular files (0600), without symlinks.')
  const actual = await realpath(path)
  if (root && (relative(root, actual).startsWith('..') || actual !== resolve(path))) throw new Error('Private preparation files must stay inside their startup-selected directory.')
  return readFile(actual)
}

export async function loadPreparedModules(directory, published, frontend) {
  assertMcpPrivateHost()
  directory = resolve(directory)
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink() || info.mode & 0o077)
    throw new Error('Use a private prepared-module directory (0700), without symlinks.')
  directory = await realpath(directory)
  const receipt = JSON.parse(await privateFile(join(directory, 'candidate-packages.json'), 256 * 1024, directory))
  if (receipt.schema !== 1 || receipt.preparation !== true || typeof receipt.base?.identity !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.base.identity) ||
      !Array.isArray(receipt.packages) || receipt.packages.length > published.packages.length + PORTS.size ||
      !Array.isArray(receipt.held) || receipt.held.some(entry => entry.id !== 'mute-modes' || entry.admission !== false))
    throw new Error('Invalid private preparation manifest.')
  const existing = new Map(published.packages.map(entry => [entry.id, entry])), saved = new Map()
  const seen = new Set(), added = []
  for (const entry of receipt.packages) {
    if (seen.has(entry.id)) throw new Error('Duplicate private package identity.')
    seen.add(entry.id)
    const previous = existing.get(entry.id)
    if (previous) {
      if (JSON.stringify(entry) !== JSON.stringify(previous)) throw new Error('Private preparation changed an existing published package.')
    } else {
      if (!PORTS.has(entry.id) || ![8, 9].includes(entry.abi) || entry.requiredBase !== receipt.base.identity ||
          frontend.modules.find(module => module.id === entry.id)?.version !== entry.version)
        throw new Error('A prepared port needs its reviewed current adapter and exact base identity.')
      added.push(entry.id)
    }
    if (typeof entry.version !== 'string' || !/^[a-zA-Z0-9.-]{1,80}$/.test(entry.version) ||
        entry.path !== `octatrack-modules/${entry.id}/${entry.version}.mwrm` ||
        !Number.isInteger(entry.bytes) || entry.bytes < 68 || entry.bytes > 256 * 1024 ||
        typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid bounded private package asset.')
    const bytes = new Uint8Array(await privateFile(join(directory, entry.path), entry.bytes, directory))
    if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256) throw new Error('The saved private package differs from its manifest.')
    saved.set(entry.path, bytes)
  }
  if (existing.size !== receipt.packages.length - added.length) throw new Error('Private preparation must preserve every published package.')
  const manifest = { ...published, packages: receipt.packages }, catalogue = frontend.createRuntimeCatalogue(manifest)
  const load = async entry => {
    const bytes = saved.get(entry.path)
    if (!bytes) throw new Error('The private package was not verified at startup.')
    return new Uint8Array(bytes)
  }
  // Real frontend package parsing checks record counts, module id and flags.
  // Theoretical capabilities here are planning inputs; device_review observes
  // the actual connected identity/capabilities before preparing any USB trial.
  for (const id of added) await catalogue.prepare({ name: 'Private preparation', moduleIds: [id], removedStockFx: [] },
    { moduleIds: [], removedStockFx: [] }, load, { abi: 10, features: 7, maxSites: 128, maxCopies: 128 }, receipt.base.identity)
  return { catalogue, load, info: { base: receipt.base.identity, moduleIds: added, admission: false },
    requireBase(moduleIds, base) {
      if (moduleIds.some(id => PORTS.has(id)) && base !== receipt.base.identity) throw new Error('This private prepared package needs the exact observed Modwerk base.')
    } }
}
