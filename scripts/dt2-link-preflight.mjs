// SPDX-License-Identifier: GPL-3.0-or-later
// Offline prerequisite for the DT2 link port. Uses Modwerk's reader, never builds or connects to a unit.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { ELE3_DEVICES, mainImage, readEle3Syx } from '../src/engine/elektron/ele3.ts'
import { wholeInstructions } from '../src/engine/elektron/coldfire-isa.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MACHINE = 'sdk/machines/digitakt-ii'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const hex = n => '0x' + n.toString(16)
function requireThat(ok, message) { if (!ok) throw new Error(message) }

/** A checked view of one address range in the privately decoded MAIN section. */
function span(image, load, address, length) {
  const offset = address - load
  requireThat(Number.isSafeInteger(offset) && offset >= 0 && Number.isSafeInteger(length) && length > 0 &&
    length <= image.length - offset, `Range ${hex(address)} + ${length} is outside MAIN`)
  return image.subarray(offset, offset + length)
}
const be32 = (bytes, at) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at)
const le16 = (bytes, at) => bytes[at] | bytes[at + 1] << 8

/** Walk the template's declared length, not wTotalLength: stock fills that field at runtime. */
export function inspectConfiguration(bytes) {
  requireThat(bytes.length >= 9 && bytes[0] === 9 && bytes[1] === 2, 'Invalid configuration header')
  const total = le16(bytes, 2)
  requireThat(total === 0 || total === bytes.length, 'Configuration length disagrees with its profile')
  const interfaces = [], settings = new Set()
  let current
  for (let at = 0; at < bytes.length;) {
    const length = bytes[at], type = bytes[at + 1]
    requireThat(length >= 2 && length <= bytes.length - at, 'Truncated or zero-length USB descriptor')
    if (type === 4) {
      requireThat(length >= 9, 'Truncated interface descriptor')
      const key = `${bytes[at + 2]}/${bytes[at + 3]}`
      requireThat(!settings.has(key), 'Duplicate interface alternate setting')
      settings.add(key)
      current = { number: bytes[at + 2], alternate: bytes[at + 3], class: bytes[at + 5],
        subclass: bytes[at + 6], declaredEndpoints: bytes[at + 4], endpoints: [] }
      interfaces.push(current)
    } else if (type === 5) {
      requireThat(length >= 7 && current, 'Endpoint without a complete interface')
      const address = bytes[at + 2]
      requireThat((address & 0x70) === 0 && (address & 15) !== 0, 'Invalid endpoint address')
      requireThat(!current.endpoints.some(ep => ep.address === address), 'Duplicate endpoint in one alternate setting')
      current.endpoints.push({ address, transfer: bytes[at + 3] & 3, packetBytes: le16(bytes, at + 4) })
    }
    at += length
  }
  requireThat(new Set(interfaces.map(i => i.number)).size === bytes[4], 'Interface count disagrees with configuration')
  for (const i of interfaces) requireThat(i.endpoints.length === i.declaredEndpoints, 'Interface endpoint count disagrees')
  return interfaces
}

export function inspectProfile(image, bindings, profile) {
  const load = Number(bindings.mainLoad)
  const record = span(image, load, Number(bindings.profileTable) + profile.index * bindings.profileStride, 20)
  const device = span(image, load, be32(record, 8), 18)
  requireThat(device[0] === 18 && device[1] === 1 && device[7] === 64, `${profile.name}: invalid device descriptor`)
  requireThat(le16(device, 8) === Number(bindings.vid) && le16(device, 10) === Number(profile.pid), `${profile.name}: wrong VID/PID`)
  const config = span(image, load, be32(record, 12), be32(record, 16))
  const interfaces = inspectConfiguration(config)
  const midi = interfaces.filter(i => i.class === 1 && i.subclass === 3)
  requireThat(midi.length === 1 && midi[0].number === profile.midiInterface && midi[0].alternate === 0,
    `${profile.name}: unexpected MIDIStreaming interface`)
  const endpoints = midi[0].endpoints
  requireThat(endpoints.length === 2 && [1, 0x81].every(address =>
    endpoints.some(ep => ep.address === address && ep.transfer === 2 && ep.packetBytes === 512)),
  `${profile.name}: expected bulk MIDI endpoints 01/81, 512 bytes`)
  for (const i of interfaces.filter(i => i !== midi[0]))
    requireThat(!i.endpoints.some(ep => endpoints.some(m => m.address === ep.address)),
      `${profile.name}: another interface uses a MIDI endpoint`)
  return { mode: profile.name, vid: hex(le16(device, 8)), pid: hex(le16(device, 10)),
    midiInterface: midi[0].number, endpoints, otherInterfaces: [...new Set(interfaces.filter(i => i !== midi[0]).map(i => i.number))] }
}

/** Check every potential base site conservatively, including dev and optional additions.
 * This is an overlap audit, not a second implementation of machine-base.py's variant selection. */
export function inspectBase(core, config, guards) {
  requireThat(config.core === 'core-dt2' && (!config.source || config.source === 'digitakt-ii') && !config.recipe &&
    core.device === 'digitakt-mk2' && core.os === '1.17', 'Expected a DT2 OS 1.17 base recipe')
  const sites = [...(core.sites ?? []), ...['common', 'add', 'dev'].flatMap(part => config[part]?.sites ?? [])]
  for (const site of sites) {
    const address = Number(site.addr)
    if (site.stock !== undefined) requireThat(typeof site.stock === 'string' && /^(?:[0-9a-f]{2})+$/i.test(site.stock), 'Invalid stock site length')
    const length = site.stock !== undefined ? site.stock.length / 2 : site.len
    requireThat(Number.isSafeInteger(address) && address >= 0 && Number.isSafeInteger(length) && length > 0 &&
      address + length <= 0x100000000, 'Invalid base site range')
    for (const guard of guards) {
      const start = Number(guard.address)
      requireThat(address + length <= start || address >= start + guard.length,
        `Base site ${hex(address)} (${site.target ?? 'unnamed'}) overlaps ${guard.name}`)
    }
  }
  return { checkedSites: sites.length, scope: 'core, common, add and dev sites (all optional additions included)' }
}

export function inspectStock(raw, bindings) {
  requireThat(hash(raw) === bindings.stockSha256, 'Expected the exact stock Digitakt II OS 1.17 file (SHA-256 mismatch)')
  const file = readEle3Syx(raw)
  requireThat(file.deviceId === 0x14 && file.version === '1.17', 'Wrong machine or OS version')
  const image = mainImage(file, ELE3_DEVICES['digitakt-ii'])
  requireThat(image.length === bindings.mainLength && hash(image) === bindings.mainSha256, 'MAIN identity mismatch')
  const guards = bindings.guards.map(guard => {
    requireThat(hash(span(image, Number(bindings.mainLoad), Number(guard.address), guard.length)) === guard.sha256,
      `${guard.name}: stock guard mismatch`)
    if (guard.purpose === 'patch-candidate') {
      const boundary = wholeInstructions(image, Number(bindings.mainLoad), Number(guard.address), guard.length)
      requireThat(boundary.ok, `${guard.name}: ${boundary.note}`)
    }
    return { name: guard.name, address: guard.address, length: guard.length, sha256: guard.sha256 }
  })
  return { stockSha256: bindings.stockSha256, mainSha256: bindings.mainSha256,
    guards, profiles: bindings.profiles.map(profile => inspectProfile(image, bindings, profile)) }
}

function repositoryReader(root, ref) {
  if (ref) {
    requireThat(!ref.startsWith('-') && /^[a-zA-Z0-9_./~-]+$/.test(ref), 'Use a local Git ref or commit for --base-ref')
    // Resolve once so a moving branch cannot mix two recipes in the same audit.
    const commit = execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: root, encoding: 'utf8' }).trim()
    return { identity: commit, read: path => execFileSync('git', ['show', `${commit}:${path}`], { cwd: root }) }
  }
  return { identity: 'working tree (includes uncommitted recipe changes)', read: path => readFileSync(resolve(root, path)) }
}

export function main(argv = process.argv.slice(2), root = ROOT) {
  const { values } = parseArgs({ args: argv, options: { stock: { type: 'string' }, 'base-ref': { type: 'string' }, help: { type: 'boolean' } } })
  if (values.help) {
    console.log('node scripts/dt2-link-preflight.mjs --stock C:/private/Digitakt_II_OS1.17.syx [--base-ref origin/base/digitakt-ii-next]')
    return
  }
  requireThat(values.stock, 'Supply --stock with your own unmodified Digitakt II OS 1.17 file')
  const bindings = JSON.parse(readFileSync(resolve(root, MACHINE, 'usb-link-bindings.json'), 'utf8'))
  const stock = inspectStock(readFileSync(values.stock), bindings)
  const source = repositoryReader(root, values['base-ref'])
  const config = JSON.parse(source.read(`${MACHINE}/elekloader/base.json`))
  const original = source.read(`${MACHINE}/elekloader/core-dt2/mod.json`)
  let core = JSON.parse(original)
  const copy = config.copies?.find(c => c.path === 'core-dt2/mod.json')
  if (copy) {
    requireThat(copy.from === 'core-dt2/mod.json' && hash(original) === copy.sha256, 'Base copy provenance guard mismatch')
    core = JSON.parse(source.read(`${MACHINE}/elekloader/copies/core-dt2/mod.json`))
  }
  const base = inspectBase(core, config, bindings.guards)
  console.log(JSON.stringify({ machine: 'digitakt-ii', os: '1.17', result: 'offline binding checks passed',
    evidence: 'SOURCE/STATIC only. No device connection, build or firmware modification.',
    baseSource: source.identity, ...stock, base,
    runtimeReady: false,
    unresolved: ['Bounded device-side transmit and synchronization', 'DT2 identity/status responder',
      'Shared-link ownership agreement', 'DT2 loader memory, cache and paused-task bindings',
      'Exact-build hardware coexistence in MIDI, Audio/MIDI and Overbridge'] }, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main() } catch (error) { console.error(`DT2 link preflight: ${error.message}`); process.exitCode = 1 }
}
