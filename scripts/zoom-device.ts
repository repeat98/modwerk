// SPDX-License-Identifier: GPL-3.0-or-later
// A Zoom MultiStomp from Node: Web MIDI's shape (MidiAccessLike) over the computer's MIDI (CoreMIDI, ALSA, WinMM)
// through @julusian/midi (RtMidi, MIT, prebuilt), so the site's own ZoomLink drives the pedal from the CLI
// (scripts/zoom.ts) and the developer MCP (scripts/frontend-mcp.mjs). Node only: nothing in src/ or the Worker imports it.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import type { MidiAccessLike, MidiIn, MidiOut, ZoomLink } from '../src/engine/zoom/zoom-link.ts'
import { isUpdateMode } from '../src/engine/zoom/zoom-protocol.ts'

type Native = Pick<typeof import('@julusian/midi'), 'Input' | 'Output'>
type Closable = { closePort(): void }

/** Every MIDI port, as Web MIDI lists them when this is called (no hot-plug: ask again for a pedal plugged in later).
 * A port opens when it is first used: an input when it gets a listener, an output on its first send. close() closes
 * them so the process can end. */
export async function nodeMidiAccess(native?: Native): Promise<MidiAccessLike & { close(): void }> {
  const { Input, Output } = native ?? await import('@julusian/midi'), open: Closable[] = []
  const inputs = new Map(Input.getPortNames().map((name, index): [string, MidiIn] => {
    let port: InstanceType<typeof Input> | undefined, listener: MidiIn['onmidimessage'] = null
    return ['in-' + index, { id: 'in-' + index, name, state: 'connected',
      get onmidimessage() { return listener },
      set onmidimessage(next) {
        listener = next
        if (!next || port) return
        port = new Input()
        port.ignoreTypes(false, true, true)   // RtMidi drops SysEx unless asked, and the pedal speaks only SysEx
        port.on('message', (_delta, bytes) => listener?.({ data: Uint8Array.from(bytes) }))
        port.openPort(index); open.push(port)
      } }]
  }))
  const outputs = new Map(Output.getPortNames().map((name, index): [string, MidiOut] => {
    let port: InstanceType<typeof Output> | undefined, queue = Promise.resolve()
    return ['out-' + index, { id: 'out-' + index, name, state: 'connected', send(data, timestamp = 0) {
      // Web MIDI sends at `timestamp` (performance.now()): ZoomLink paces long messages 22 ms apart that way.
      queue = queue.then(async () => {
        const wait = timestamp - performance.now()
        if (wait > 0) await new Promise(done => setTimeout(done, wait))
        if (!port) { port = new Output(); port.openPort(index); open.push(port) }
        port.sendMessage(data)
      }).catch(error => console.error('MIDI send to ' + name + ' failed: ' + (error as Error).message))
    } }]
  }))
  return { inputs, outputs, onstatechange: null, close: () => { for (const port of open.splice(0)) port.closePort() } }
}

/**
 * One command through a ZoomLink that has connected: `status` (identity, and MIDISTOMP's load on its base), `list`
 * (files with each effect's group, ID and version, and the free space), `backup` (every file into a zip at `file`,
 * resolved against `dir`, by default a new name in `dir`), `install` (the effect file at path `file`) and `remove`
 * (the effect named `file`). Install and remove write to the pedal: only `confirmed`, and the effect list from before
 * is saved in `dir`. Every file written here is new and private.
 */
export async function zoomCommand(link: ZoomLink, command: string, file: string | undefined, { dir, confirmed = false }: { dir: string; confirmed?: boolean }) {
  const { status, identity, notice } = link.getState()
  if (status !== 'ready' || !identity) throw new Error(notice?.text ?? 'The Zoom pedal is not ready (' + status + ').')
  if (command === 'status') { const load = await link.load(); return { ...link.getState().identity, ...(load ? { load } : {}) } }
  if (isUpdateMode(identity)) throw new Error('The pedal is in update mode (bootloader ' + identity.firmware + '): unplug it and plug it in again to use its files.')
  if (command === 'list') return { files: await link.listFiles({ versions: true }), free: await link.freeSpace() ?? null }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-'), save = async (path: string, data: Uint8Array) => {
    await mkdir(dir, { recursive: true, mode: 0o700 })
    await writeFile(path, data, { mode: 0o600, flag: 'wx' })
    return { path, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }
  }
  if (command === 'backup') {
    const { files, zip } = await link.backup()
    return { files, ...await save(resolve(dir, file ?? identity.model.toLowerCase() + '-backup-' + stamp + '.zip'), new Uint8Array(await zip.arrayBuffer())) }
  }
  if (command !== 'install' && command !== 'remove') throw new Error('Unknown Zoom command: ' + command)
  if (!file) throw new Error('Name the effect file.')
  if (!confirmed) throw new Error(command + ' writes to the pedal: confirm it (CLI --yes; MCP confirm=true with --allow-device-writes).')
  const kept = async (list?: number[]) => list && (await save(join(dir, 'pedal-FLST_SEQ-' + stamp + '.ZDT'), Uint8Array.from(list))).path
  if (command === 'remove') return { removed: file.toUpperCase(), previousList: await kept((await link.removeFile(file)).previousList) }
  const name = basename(file).toUpperCase(), { previousList, unchanged, moved } = await link.installFile(name, new Uint8Array(await readFile(file)))
  return { installed: name, unchanged, moved, previousList: await kept(previousList) }
}
