// SPDX-License-Identifier: GPL-3.0-or-later
// Work directly on a unit running a Modwerk base, without a reboot: read its
// state, try a runtime module, then keep or roll it back. Speaks the USB bench
// protocol, so a real unit needs the bridge (Octatrack only so far):
//
//   ~/.cache/modwerk-upstream/venv/bin/python -B scripts/octatrack-usb-bridge.py /tmp/modwerk-ot.sock &
//   npm run device -- status
//   while :; do npm run device -- serve [--share /tmp/modwerk-share.sock]; sleep 1; done   # one long-lived link (starts the bridge
//       if needed; --share lets the frontend MCP use the unit through it, --device-socket that path); send it
//       scripts/device-send.py part2 pick:T1:FX2:E-Verb stats png:/tmp/s.png   # or 'try FILE', 'remove FILE', 'boot DIR'
//   npm run device -- try MODULE.mwrm [--seconds 5] [--accept]
//   npm run device -- remove [MODULE.mwrm] [--accept]   # that file's module, else module 0
//   npm run device -- lifecycle
//   npm run device -- boot BUILD_DIR [--chunk 4096]  # RAM boot: build_core.py's output, no flashing; serve: 'boot DIR 4096'
//   npm run device -- flash BUILD_DIR               # after `boot BUILD_DIR`: that base writes itself to NOR (two slots: it runs on)
//   npm run device -- key PLAY | FUNC+FX1 | 0x27    # development bases (build_core.py --dev)
//   npm run device -- screen [--png FILE] [--scale 1-4]  # the display, in block characters or as a PNG (4x unless --scale)
//   npm run device -- ui                            # tracks, effects and transport as text, read from RAM (MEM)
//   npm run device -- do 'T5 FX2 FUNC+FX2 DOWN*4 YES w300 encC+3 ui stats'  # a sequence in one connection
//   npm run device -- mem 0x80000ec4 16             # RAM, read-only (development bases)
//   npm run device -- state                         # stopped / playing, recording
//   npm run device -- loader                        # the DSP loader's counters (--dsp-loader bases)
//   npm run device -- report                        # its full report (dsp.c modwerk_dsp_report, version 11: 78 words; miss0-2 the first refused packet (dsp_receiver.asm))
//   npm run device -- stats                         # CPU and DSP load, DSP arena, delay buffers, module pool (status.c; the modal is CUE + PROJ)
//   npm run device -- probe 0|1                     # one no-op loader packet to a DSP core
//   npm run device -- meter 0|1                     # the DSP load meter's last 1024-frame window (core 0's idle iterations)
//   npm run device -- missing                       # the modules the project names that are not installed (MISSING request)
//   npm run device -- enc A+3 | LEVEL-1 | fader 128 # encoders A-F and LEVEL, the crossfader
//
// --emulator drives ot_emu's USB bench socket instead (it enumerates the device
// first; ot_emu takes one connection, so one command per emulator run).
// Each command is one whole transaction. A trial is rolled back unless --accept
// is given; Ctrl-C rolls back early. If this process dies mid-trial, unplug USB:
// the base rolls back any module that was not accepted.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { deflateSync, crc32 } from 'node:zlib'
import { join, resolve } from 'node:path'
import { createConnection, createServer } from 'node:net'
import { spawn, spawnSync } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { rmSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { sha } from '../vendor/elekloader/kit/src/bytes.ts'
import * as formats from '../vendor/elekloader/kit/src/formats.ts'
import { OCTATRACK } from '../vendor/elekloader/kit/src/devices.ts'
import { UploadSession } from '../src/engine/elekloader/upload-session.ts'
import { findVendorInterface, UsbVendorTransport } from '../src/engine/elekloader/upload-usb.ts'
import { DEVICE_LOG_PAGE, DEVICE_LOG_PAGES, DEVICE_LOG_REQUEST, parseDeviceLog } from '../src/engine/elekloader/device-log.ts'
import { diagnostics, removal, runLifecycle } from '../src/dev/octatrack-usb-lifecycle.ts'
import { Bench, benchEndpoint, device, enumerate, shareBench } from './usb-bench.mjs'

const { values, positionals: [command, file] } = parseArgs({ allowPositionals: true, options: {
  socket: { type: 'string', default: '/tmp/modwerk-ot.sock' },
  seconds: { type: 'string', default: '5' },
  accept: { type: 'boolean', default: false },
  emulator: { type: 'boolean', default: false },
  png: { type: 'string' },
  scale: { type: 'string', default: '2' },
  share: { type: 'string' }, // serve: a second bench socket for the frontend MCP (shareBench)
  chunk: { type: 'string' }, // boot: bytes a frame (4096 for the flashed usbtest9 on macOS; docs/OCTATRACK_HARDWARE_TRAPS.md)
} })
let seconds = Number(values.seconds)
if (!['serve', 'status', 'stats', 'try', 'remove', 'lifecycle', 'boot', 'flash', 'key', 'screen', 'state', 'enc', 'fader', 'loader', 'report', 'probe', 'meter', 'missing', 'ui', 'do', 'mem'].includes(command) || (['try', 'boot', 'flash', 'key', 'enc', 'fader', 'probe', 'meter', 'do', 'mem'].includes(command) && !file) ||
  (['serve', 'status', 'stats', 'lifecycle', 'screen', 'state', 'loader', 'report', 'missing', 'ui'].includes(command) && file) ||
  !Number.isInteger(seconds) || seconds < 1 || seconds > 3600 || (values.chunk && !(Number(values.chunk) >= 1 && Number(values.chunk) <= 4096 && Number.isInteger(Number(values.chunk))))) {
  console.error('Usage: device.mjs status | stats | try MODULE.mwrm [--seconds 1-3600] [--accept] | remove [MODULE.mwrm] [--accept] | lifecycle | boot BUILD_DIR [--chunk 1-4096] | flash BUILD_DIR | key NAME[+NAME] | screen | state | loader | report | probe 0|1 | meter 0|1 | missing | ui | do SEQUENCE | mem ADDR LENGTH | enc A+3 | fader 0-255 [--socket PATH] [--emulator]')
  process.exit(2)
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
if (command === 'serve' && !await new Promise(resolve => { const c = createConnection(benchEndpoint(values.socket), () => { c.end(); resolve(true) }); c.on('error', () => resolve(false)) })) {
  const bridge = spawn(process.env.MODWERK_PYTHON ?? join(homedir(), '.cache/modwerk-upstream/venv/bin/python'),
    ['-B', 'scripts/octatrack-usb-bridge.py', values.socket], { stdio: ['ignore', 'pipe', 'inherit'] })
  await new Promise((resolve, reject) => { bridge.stdout.on('data', d => /ready/.test(d) && resolve()); bridge.once('exit', code => reject(new Error('bridge exited ' + code))) })
  process.once('exit', () => bridge.kill())
}
const bench = new Bench(values.socket)
await bench.ready()
const unit = device(bench), index = findVendorInterface(await enumerate(bench, !values.emulator))
const transport = new UsbVendorTransport(unit, index, { pollMs: 5 })
const identity = await transport.identify()
// DIAG is the Octatrack base's own request; other bases may not answer it.
const diag = () => diagnostics(unit, index).catch(() => undefined)

// Development bases (build_core.py --dev, dev.c): keys as the panel reports them, and the composed screen.
const KEYS = { DOWN: 0x20, RIGHT: 0x21, SRC: 0x22, AMP: 0x23, LFO: 0x24, FX1: 0x25, FX2: 0x26, STOP: 0x27, PLAY: 0x28,
  REC: 0x29, CUE: 0x2a, FUNC: 0x2d, PATTERN: 0x2e, BANK: 0x2f, YES: 0x31, NO: 0x32, UP: 0x33, LEFT: 0x34, MIDI: 0x35,
  PAGE: 0x1b, PROJ: 0x1c, PART: 0x1d, AED: 0x1e, ARR: 0x1f, SCENEA: 0x19, SCENEB: 0x1a, LEVEL: 0x3e,
  ...Object.fromEntries(Array.from({ length: 16 }, (_, i) => ['TRIG' + (i + 1), i])),
  ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => ['T' + (i + 1), 0x10 + i])),
  ...Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'F'].map((e, i) => ['PUSH' + e, 0x38 + i])) }
async function devIn(request, value, length) {
  const reply = await unit.controlTransferIn({ requestType: 'vendor', recipient: 'interface', request, value, index }, length)
  if (reply.status !== 'ok' || reply.data?.byteLength !== length) throw new Error(request === 16 ?
    'The base refused this MEM read: development bases read 0x40000400-0x40cfffff, 0x46000000-0x46ffffff, 0x80000000-0x8000ffff and 0x100f0000-0x100fffff only (dev.c).' :
    'This base does not answer development requests: build it with --dev.')
  return new Uint8Array(reply.data.buffer, reply.data.byteOffset, reply.data.byteLength)
}
/** FUNC+PLAY: hold every key but the last, tap the last, release the held ones. */
async function keys(spec) {
  const codes = spec.split('+').map(name => KEYS[name.toUpperCase()] ?? Number(name))
  if (codes.some(code => !Number.isInteger(code) || code < 0 || code > 63)) throw new Error('Unknown key in ' + spec + ': ' + Object.keys(KEYS).join(' '))
  for (const code of codes) { await devIn(5, code | 0x100, 1); await wait(code === codes.at(-1) ? 80 : 30) }
  for (const code of codes.reverse()) { await devIn(5, code, 1); await wait(30) }
}
async function screen(png = values.png) {
  const frame = (await devIn(7, 0, 1028)).subarray(4)
  const on = (x, y) => (frame[x * 8 + ((63 - y) >> 3)] >> (7 - ((63 - y) & 7))) & 1
  const s = Math.max(1, Math.min(4, Number(values.scale) | 0))
  if (png) { // greyscale, each pixel s x s (2 unless --scale)
    const rows = Buffer.concat(Array.from({ length: 64 * s }, (_, y) =>
      Buffer.from([0, ...Array.from({ length: 128 * s }, (_, x) => on(Math.floor(x / s), Math.floor(y / s)) ? 255 : 24)])))
    const chunk = (type, data) => { const t = Buffer.from(type), l = Buffer.alloc(4), c = Buffer.alloc(4)
      l.writeUInt32BE(data.length); c.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([l, t, data, c]) }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(128 * s, 0); ihdr.writeUInt32BE(64 * s, 4); ihdr[8] = 8; ihdr[9] = 0
    writeFileSync(png, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]))
    return console.log('screen saved to ' + png)
  }
  for (let y = 0; y < 64; y += 2)
    console.log(Array.from({ length: 128 }, (_, x) => ' ▄▀█'[on(x, y) * 2 + on(x, y + 1)]).join(''))
}
/** RAM, read-only (dev.c MEM): at most 511 bytes, never a whole number of 64-byte packets. */
async function mem(at, length) {
  if (length > 448) { // one reply holds at most 511 bytes: read in pieces
    const out = new Uint8Array(length)
    for (let done = 0; done < length; done += 448) out.set(await mem(at + done, Math.min(448, length - done)), done)
    return out
  }
  const n = length % 64 ? length : length + 1
  await devIn(15, at >>> 16, 1)
  return (await devIn(16, at & 0xffff, n)).subarray(0, length)
}
/** The effect id tables, wherever the base keeps them: stock names each only by lea operands, which a base
 * repoints at its own copies (dsp_loader.py choosers): FX1_IDS and FX2_IDS (id -> descriptor, its name at +9, then
 * a 0, which gives the id count) and FX1_ID2POS and ID2POS (id -> chooser row). */
async function effectTables() {
  const operand = async at => { const b = await mem(at, 4); return new DataView(b.buffer, b.byteOffset, 4).getUint32(0) }
  const [fx1, fx2, row1, row2] = [await operand(0x40052798), await operand(0x4005252a), await operand(0x40037aa8), await operand(0x4003770c)]
  const words = async (at, n) => { const b = await mem(at, 4 * n), v = new DataView(b.buffer, b.byteOffset, 4 * n); return Array.from({ length: n }, (_, i) => v.getUint32(4 * i)) }
  const first = await words(fx1, 129), count = first.indexOf(0) < 0 ? 128 : first.indexOf(0)
  return { count, ids: [first.slice(0, count), await words(fx2, count)], rows: [await words(row1, count), await words(row2, count)] }
}
/** MEMORY MAP (dev request 24): the module pool's free bytes and largest free run, the delay-buffer blocks in use, and
 * each core's code arena with the blocks the loader has placed there (committed), sorted by where they start. */
async function memoryMap() {
  const pages = [Buffer.from(await devIn(24, 0, 276))] // then 32 packages a page until the base stalls (fxids.h)
  for (;;) { try { pages.push(Buffer.from(await devIn(24, pages.length, 276))) } catch { break } }
  const b = pages[0]
  if (b.toString('latin1', 0, 4) !== 'MWMP') throw new Error('Not a memory map.')
  const cores = [0, 1].map(core => {
    const arena = b.readUInt16BE(12 + 2 * core), blocks = []
    pages.forEach((page, k) => {
      for (let i = 0; i < 32; i++) {
        const at = page.readUInt16BE(20 + 4 * (32 * core + i))
        if (at !== 0xffff) blocks.push({ p: 32 * k + i, at: at - 64, n: page.readUInt16BE(22 + 4 * (32 * core + i)) })
      }
    })
    blocks.sort((x, y) => x.at - y.at)
    // Holes: free words outside the largest free run (big blocks sit at the top, the rest at the bottom: dsp.c)
    let end = 0, largest = 0
    for (const k of [...blocks, { at: arena, n: 0 }]) { largest = Math.max(largest, k.at - end); end = Math.max(end, k.at + k.n) }
    const used = blocks.reduce((s, k) => s + k.n, 0)
    return { arena, blocks, used, largest, holes: arena - used - largest }
  })
  return { free: b.readUInt32BE(4), largest: b.readUInt32BE(8), buffers: b.readUInt32BE(16), cores }
}
/** The DSP code map (development bases): each core's arena as a bar of 64 cells, each placed block a letter and free
 * words '.', then each block's name, where it starts, its words and the slots that run it, else "preloaded" (code a Part
 * of the bank names, kept loaded so a Part change waits for no upload). watch:N redraws it whenever a block comes, goes
 * or moves (compaction, preloading, a pick) for N seconds, at most 15 (the session answers within 20). */
async function dspmap(seconds) {
  const tables = await effectTables(), names = new Map()
  const label = async d => d ? Buffer.from(await mem(d + 9, 13)).toString('latin1').replace(/\0.*$/s, '') : ''
  const name = async p => {
    if (!names.has(p)) { const n2 = await label(tables.ids[1][p]); names.set(p, (n2 && n2 !== 'NONE') || !p ? n2 : (await label(tables.ids[0][p])) || 'id ' + p) }
    return names.get(p)
  }
  const letter = i => String.fromCharCode(65 + i % 26)
  const t0 = Date.now()
  let last = ''
  do {
    const map = await memoryMap(), live = await mem(0x80000ec4, 16), key = JSON.stringify(map.cores) + live.join()
    if (key !== last) {
      const out = seconds ? [`${((Date.now() - t0) / 1000).toFixed(1)} s`] : []
      for (const core of [1, 0]) {
        const { arena, blocks, used, largest, holes } = map.cores[core], cells = Array(64).fill('.')
        blocks.forEach((k, i) => { for (let c = 0; c < 64; c++) { const mid = (c + 0.5) * arena / 64; if (mid >= k.at && mid < k.at + k.n) cells[c] = letter(i) } })
        blocks.forEach((k, i) => { if (!cells.includes(letter(i))) cells[Math.min(63, Math.floor(k.at * 64 / arena))] = letter(i) }) // smaller than a cell
        out.push(`core ${core} (${core ? 'T1-4' : 'T5-8'}) |${cells.join('')}| ${used}/${arena} words, largest free run ${largest}, holes ${holes}`)
        for (const [i, k] of blocks.entries()) {
          const slots = [...live].flatMap((p, s) => p === k.p && ((s & 7) < 4 ? 1 : 0) === core ? [`T${(s & 7) + 1} FX${s < 8 ? 1 : 2}`] : [])
          out.push(`  ${letter(i)} ${(await name(k.p)).padEnd(13)} @${String(k.at).padEnd(5)} +${String(k.n).padEnd(5)} ${slots.join(', ') || 'preloaded'}`)
        }
      }
      console.log(out.join('\n'))
      last = key
    }
    if (seconds) await wait(250)
  } while (Date.now() - t0 < Math.min(seconds, 15) * 1000)
}
/** The build `boot DIR` last started, whose symbols.json and proofs.json `profile` reads. */
const LAST_BOOT = join(homedir(), '.cache/modwerk-octatrack/last-boot')
/** The base's tick profile (development bases, diag.h modwerk_cost): what each hook of the UI tick costs, in µs a tick over
 * N seconds (at most 15), and the frame transfer's µs a frame. The build it reads the address from must be the base that
 * runs: `boot DIR` records DIR, and its proofs name the base. */
async function profile(seconds) {
  let dir = ''
  try { dir = readFileSync(LAST_BOOT, 'utf8').trim() } catch { /* below */ }
  const symbols = dir && JSON.parse(readFileSync(join(dir, 'symbols.json'), 'utf8'))
  const base = dir && JSON.parse(readFileSync(join(dir, 'proofs.json'), 'utf8')).configurationHash
  if (!symbols?.modwerk_cost || base !== identity.base) throw new Error('No symbols for the running base: RAM-boot a development build with `boot DIR` (its symbols.json names modwerk_cost).')
  const read = async () => { const b = await mem(symbols.modwerk_cost, 112), v = new DataView(b.buffer, b.byteOffset, 112); return Array.from({ length: 28 }, (_, i) => v.getUint32(4 * i)) }
  const a = await read(); await wait(1000 * Math.min(seconds, 15)); const b = await read()
  const ticks = (b[15] - a[15]) >>> 0 || 1, frames = (b[11] - a[11]) >>> 0, us = k => (((b[k] - a[k]) >>> 0) / ticks / 132).toFixed(1)
  const hooks = [[0, 'whole chain'], [1, 'runtime'], [2, 'USB'], [3, 'dsp'], [4, 'loader manager'], [5, 'status'], [6, 'controllers'], [7, 'crash'],
    [8, 'diagnostics'], [14, 'module UI ticks'], [24, 'MIDI generators']]
  console.log(`profile over ${ticks} UI ticks, µs a tick: ${hooks.map(([k, name]) => `${name} ${us(k)}`).join(', ')}` +
    (frames ? `; frame transfer ${(((b[10] - a[10]) >>> 0) / frames / 132).toFixed(1)} µs a frame` : ''))
}
/** What the unit shows, as text: each track's effects (their descriptors' names), the current track, transport. */
async function ui() {
  const track = (await mem(0x80000000, 1))[0], live = await mem(0x80000ec4, 16)
  const tables = await effectTables(), names = new Map()
  const name = async descriptor => {
    if (!names.has(descriptor)) names.set(descriptor, Buffer.from(await mem(descriptor + 9, 13)).toString('latin1').replace(/\0.*$/s, ''))
    return names.get(descriptor)
  }
  const [stopped, recording] = await devIn(6, 0, 2)
  const lines = []
  for (let t = 0; t < 8; t++)
    lines.push(`${t === track ? '>' : ' '}T${t + 1} ${(await name(tables.ids[0][live[t]])).padEnd(12)} ${await name(tables.ids[1][live[8 + t]])}`)
  console.log(lines.join('\n') + `\npart ${(await mem(0x80000003, 1))[0] + 1}, ${stopped ? 'stopped' : 'playing'}${recording ? ', recording' : ''}`)
}
/** Wait until test() holds, polling every 50 ms; false after ms. */
async function until(test, ms = 5000) {
  for (const start = Date.now(); Date.now() - start < ms; await wait(50)) if (await test()) return true
  return false
}
/** PART + an arrow (1 up, 2 right, 3 down, 4 left), then wait for the Part to change. */
async function part(n) {
  await keys('PART+' + ['UP', 'RIGHT', 'DOWN', 'LEFT'][n - 1])
  if (!await until(async () => (await mem(0x80000003, 1))[0] === n - 1)) throw new Error('Part ' + n + ' did not become active.')
}
/** Pick an effect by name through the stock chooser, then wait until the track runs it (effectTables: id -> descriptor
 * and id -> chooser row); what runs, 0x80000ec4 (FX1 T1-8, FX2). */
async function pick(track, slot, wanted) {
  const tables = await effectTables(), ids = tables.ids[slot - 1], rows = tables.rows[slot - 1]
  let id = typeof wanted === 'number' ? wanted : -1 // a number: that effect id, through its chooser row (pickid)
  for (let i = 0; i < tables.count && id < 0; i++)
    if (ids[i] && Buffer.from(await mem(ids[i] + 9, 13)).toString('latin1').replace(/\0.*$/s, '').toLowerCase() === wanted.toLowerCase()) id = i
  if (id < 0 || id >= tables.count || (typeof wanted === 'number' && !rows[id])) throw new Error('No ' + wanted + ' in the FX' + slot + ' chooser.')
  // NO first: right after a pick on another track the next FUNC+FX can be lost, and the LEVEL turn below then changes that
  // track's level in the Part instead of scrolling (owner's MKII, 20 October 2026)
  await run(`NO w300 T${track + 1} FX${slot} FUNC+FX${slot} w150`)
  const cursor = await mem(slot === 1 ? 0x460d5c94 : 0x460d5ca8, 4)
  const move = rows[id] - new DataView(cursor.buffer, cursor.byteOffset, 4).getUint32(0) // the chooser's cursor (dsp.c)
  if (move) await run(`encLEVEL${move < 0 ? '-' : '+'}${Math.abs(move)} w100`) // LEVEL scrolls the chooser, a row a detent
  const refused = (await statusWords())(21), start = Date.now()
  await keys('YES')
  let no = false
  const ok = await until(async () => (await mem(0x80000ec4 + 8 * (slot - 1) + track, 1))[0] === id || (no = (await statusWords())(21) !== refused))
  if (no) { // the refusal's reason is on the screen (DSP MEMORY FULL, cycles, ...): keep it before NO clears it
    const shot = join(tmpdir(), `modwerk-refused-T${track + 1}-FX${slot}.png`)
    await screen(shot)
    await keys('NO'); throw new Error(wanted + ' refused on T' + (track + 1) + ' FX' + slot + ' (the loader said no; its screen: ' + shot + ')')
  }
  const took = Date.now() - start
  await keys('NO')
  if (!ok) throw new Error(wanted + ' was not admitted on T' + (track + 1) + ' FX' + slot + ' within 5 s.')
  console.log(`T${track + 1} FX${slot} ${wanted} (running ${took} ms after YES)`)
}
/** The loader's report words (dsp.c modwerk_dsp_report, version 11), and those printed in hex. */
const REPORT_NAMES = ['version', 'frames', 'phase', 'job0', 'job1', 'hostFlags', 'accepted0', 'accepted1', 'rejected0', 'rejected1',
  'errors', 'stalls', 'drained', 'residencyEnabled', 'manager', 'watchTicks', 'probesSent', 'probesAnswered', 'probesTimedOut',
  'selRequested', 'selCompleted', 'selRefused', 'selCancelled', 'resCommits', 'resFailures', 'resRollbacks',
  'words0', 'words1', 'earlyVisits', 'parked', 'reinit', 'missing', 'used', 'dry',
  'frameState', 'frameBusy', 'intcIprl', 'intcImrl', 'eportPinFlagSelect', 'edmaIntErr', 'csr0csr1', 'edmaEs',
  'edmaErrors', 'edmaEsSeen', 'missCore', 'missBits', 'missCheck', 'miss0', 'miss1', 'miss2', 'pin7', 'straddles', 'core1Sent',
  'meterCore', 'meterBits', 'meterSerial', 'idleLeast', 'idleMost', 'idleSum', 'missed', 'mapGeneration', 'mapRead', 'mapWritten', 'setGeneration', 'setModules', 'setResult',
  'cpu', 'dsp0Mean', 'dsp0Peak', 'dsp1Mean', 'dsp1Peak', 'buffers', 'poolUsed', 'modules', 'idleWrap', 'arenas', 'idleSum0', 'idleSum1']
const named = w => REPORT_NAMES.map((name, i) => name + '=' + (REPORT_HEX.has(name) ? '0x' + w(i).toString(16) : ['job0', 'job1', 'missCore', 'meterCore'].includes(name) ? w(i) | 0 : w(i))).join(' ')
const REPORT_HEX = new Set(['buffers', 'arenas', 'hostFlags', 'manager', 'used', 'dry', 'intcIprl', 'intcImrl', 'eportPinFlagSelect', 'edmaIntErr', 'csr0csr1', 'edmaEs', 'edmaEsSeen', 'missCheck', 'miss0', 'miss1', 'miss2'])
/** The report, at the length the base sends: 78 words, or 81 past 32 effect ids (version 12: the used and dry
 * masks' second words and a pad at the end; fxids.h). The base answers only its own length. */
async function reportView() {
  for (const words of [78, 81, 83, 85]) { // 32, 64, 96 or 128 ids
    try { const bytes = await devIn(11, 0, 4 * words); return new DataView(bytes.buffer, bytes.byteOffset, 4 * words) } catch { /* the other length */ }
  }
  throw new Error('This base does not answer development requests: build it with --dev.')
}
/** status.c's tail of the report (version 11 and up): word i of the first 78. */
async function statusWords() {
  const view = await reportView(), w = i => view.getUint32(4 * i)
  if (w(0) < 11) throw new Error('This base has no status (report version ' + w(0) + ').')
  return w
}
/** MISSING (ep0.c, dsp.c): the modules the project names that are not installed. "MWM", a count, then 24 bytes a handle. */
async function missing() {
  const all = []
  for (let first = 0; ; first += 13) { // pages of 13 from wValue on: a full page means there may be more
    const reply = await unit.controlTransferIn({ requestType: 'vendor', recipient: 'interface', request: 14, value: first, index }, 316)
    if (reply.status !== 'ok' && first) break // a base from before pages: one page is all it has
    if (reply.status !== 'ok' || !reply.data) throw new Error('This base does not answer MISSING: build it with --dsp-loader.')
    const bytes = new Uint8Array(reply.data.buffer, reply.data.byteOffset, reply.data.byteLength), view = new DataView(reply.data.buffer, reply.data.byteOffset, reply.data.byteLength)
    const n = bytes[3], text = (at, length) => String.fromCharCode(...bytes.subarray(at, at + length)).replace(/\0.*$/, '')
    if (text(0, 3) !== 'MWM' || bytes.byteLength !== 4 + 24 * n) throw new Error('Not a MISSING reply.')
    all.push(...Array.from({ length: n }, (_, i) => ({ handle: bytes[4 + 24 * i], layout: view.getUint16(6 + 24 * i),
      module: view.getUint32(8 + 24 * i).toString(16).padStart(8, '0'), name: text(12 + 24 * i, 16) })))
    if (n < 13) break
  }
  return all.length ? JSON.stringify(all) : 'nothing missing'
}

/** One connection for a whole sequence: KEY or KEY+KEY (with *N to repeat), w300 (wait ms), encC+3, fader128, ui, screen, state,
 * stats (one line: CPU, each core's mean/peak per mille and idle passes a frame), png:FILE, mem:0xADDR:LEN, part1-4, pick:T1:FX2:NAME,
 * +KEY / -KEY (press, release), crash (the last crash's record), crashtest (development bases: crash on purpose),
 * stall (the last DSP stall's record), stalltest (development bases: write one now), selftest (PROJ > MODWERK > SELF TEST, about 15 s)
 * hold:N (development bases: host frames wait N seconds, as after a boot), missing (modules the project names, not installed),
 * inventory (the installed modules, INVENTORY),
 * reload (the current Part from its saved copy, through the Part menu), gap (the longest time between frames since the last gap),
 * memory (development bases: each memory's use, holes and largest free run), compact (pack each core's code now, timed),
 * dspmap (development bases: each core's code arena drawn, every block named with its slots), dspmap:watch:N (redrawn on change)
 * profile, profile:N (development bases: each UI tick hook's µs over N seconds, from the symbols of the build `boot` started)
 * (spaces in NAME as _; it waits until the track runs it). */
async function run(sequence, until = Infinity) { // serve: past its time limit a sequence stops before its next step
  for (const step of sequence.trim().split(/\s+/)) {
    if (Date.now() > until) throw new Error('stopped at the time limit before ' + step)
    let m
    if ((m = /^w(\d+)$/.exec(step))) await wait(Number(m[1]))
    else if ((m = /^enc([A-F]|LEVEL)([+-]\d+)$/i.exec(step))) await devIn(8, 0x30 | ('ABCDEF'.indexOf(m[1].toUpperCase()) >= 0 ? 'ABCDEF'.indexOf(m[1].toUpperCase()) : 6) | (Number(m[2]) & 0xff) << 8, 1)
    else if ((m = /^fader(\d+)$/.exec(step))) await devIn(8, 0x40 | Number(m[1]) << 8, 1)
    else if (step === 'ui') await ui()
    else if (step === 'screen') await screen()
    else if ((m = /^([+-])([A-Z0-9]+)$/i.exec(step))) { // +BANK holds, -BANK lets go
      const code = KEYS[m[2].toUpperCase()]
      if (code === undefined) throw new Error('Unknown key in ' + step + ': ' + Object.keys(KEYS).join(' ')) // not TRIG1 (undefined | 0x100)
      await devIn(5, code | (m[1] === '+' ? 0x100 : 0), 1)
    }
    else if ((m = /^png:(\S+)$/.exec(step))) await screen(m[1])
    else if ((m = /^mem:(0x[0-9a-f]+):(\d+)$/i.exec(step))) { // RAM, read-only, hex; any length (500-byte reads)
      const at = Number(m[1]), length = Number(m[2]), parts = []
      for (let off = 0; off < length; off += 500) parts.push(Buffer.from(await mem(at + off, Math.min(500, length - off))).toString('hex'))
      console.log(parts.join(''))
    }
    else if (step === 'report') console.log(named(await statusWords())) // the loader's full report (dsp.c modwerk_dsp_report)
    else if (step === 'stalltest') await devIn(18, 0, 1) // development bases: write the stall record now, nothing recovered
    else if ((m = /^storm([01])$/.exec(step))) await devIn(19, Number(m[1]), 1) // development bases: a finished PEEK goes again at once
    else if ((m = /^mask:(\d+)$/.exec(step))) await devIn(20, Math.min(Number(m[1]), 65535), 1) // development bases: interrupts off for N microseconds
    else if (step === 'missing') console.log(await missing())
    else if (step === 'inventory') console.log(JSON.stringify(await transport.inventory() ?? 'this base does not answer INVENTORY'))
    else if (step === 'xwatch') { // probe X bases (dev request 26): does anything write X:$7a92-$7fff? per core
      for (const core of [1, 0]) {
        for (const until = Date.now() + 10000; !(await devIn(26, 0x100 | core, 1))[0]; await wait(100))
          if (Date.now() > until) throw new Error('An X watch read stayed queued for 10 s.')
        let v
        for (const until = Date.now() + 15000; ; await wait(200)) { // 96 PEEKs, a few seconds
          const b = Buffer.from(await devIn(26, core, 24)); v = [0, 1, 2, 3, 4, 5].map(i => b.readUInt32BE(4 * i))
          if (v[0] === core && v[1] >= 96) break
          if (Date.now() > until) throw new Error('The X watch was not read within 15 s.')
        }
        console.log(`core ${core} (${core ? 'T1-4' : 'T5-8'}): ${v[5]} passes over X:$7a92-$7fff, ${v[2]} words found changed` +
          (v[2] ? `, the first at X:$${v[3].toString(16)} holding $${v[4].toString(16).padStart(6, '0')} (expected $${(v[3] ^ 0xa5a5a5).toString(16).padStart(6, '0')})` : ''))
      }
    }
    else if (step === 'memory') { // MEMORY MAP (dev request 24): how full and how fragmented each memory is
      const map = await memoryMap(), pool = map.free + (await statusWords())(72) // the base's own size
      console.log(`pool: ${pool - map.free} of ${pool} bytes used; free ${map.free}, largest free run ${map.largest}${map.free ? ` (${Math.round(100 * map.largest / map.free)} % of free)` : ''}`)
      for (const [core, name] of [[1, 'core 1 (T1-4)'], [0, 'core 0 (T5-8)']]) {
        const { arena, blocks, used, largest, holes } = map.cores[core]
        console.log(`${name}: ${used} of ${arena} words in ${blocks.length} blocks [${blocks.map(k => `id ${k.p} @${k.at}+${k.n}`).join(', ')}]; ` +
          `holes ${holes} words, largest free run ${largest} of ${arena - used} free`)
      }
      console.log(`buffer blocks in use: 0x${map.buffers.toString(16)}`)
    }
    else if ((m = /^dspmap(?::watch:(\d+))?$/.exec(step))) await dspmap(Number(m[1] ?? 0))
    else if ((m = /^profile(?::(\d+))?$/.exec(step))) await profile(Number(m[1] ?? 3))
    else if (step === 'compact') { // COMPACT (dev request 25): pack each core's code now (transport stopped); how long it took
      const read = async go => { const b = Buffer.from(await devIn(25, go, 8)); return { step: b.readUInt32BE(0), counts: b.readUInt32BE(4) } }
      if (!(await read(1)).step) throw new Error('Compaction did not start: stop the transport and let the loader finish.')
      const start = Date.now()
      for (let r = await read(0); r.step && Date.now() - start < 15000; r = await read(0)) await wait(20)
      const r = await read(0)
      console.log(r.counts === 0xffffffff ? 'compaction gave up (playing again, or ten seconds)' : `compacted in ${(r.counts / 132000).toFixed(1)} ms (${Date.now() - start} ms seen from here)`)
    }
    else if (step === 'guard' || step.startsWith('guard:')) { // GUARD (dev request 29): guard:MILLE sets the frame guard's share
      const b = Buffer.from(await devIn(29, Number(step.slice(6)) || 0, 28)), pc = n => `${(n / 478.91).toFixed(1)} %`
      const [max, late, busy, frames, skips, tracks, share] = [0, 4, 8, 12, 16, 20, 24].map(at => b.readUInt32BE(at))
      console.log(`frame max ${pc(max)}, latest start ${pc(late)}, in the frame interrupt ${frames ? pc(busy * 256 / frames) : '-'} over ${frames} frames, skipped ${skips} on ${[...Array(8).keys()].filter(t => tracks >> t & 1).map(t => 'T' + (t + 1)).join(' ') || '-'}, share ${pc(share)}`)
    }
    else if (step === 'gap') { const g = Buffer.from(await devIn(23, 0, 4)).readUInt32BE(0); console.log(`gap ${g} counts ${(g / 132).toFixed(0)} us`) } // since the last read
    // RELOAD from the Part menu, which keeps its cursor and stops at RENAME. Never PART+FUNC+PLAY: that is CLEAR.
    else if (step === 'reload') await run('FUNC+PART w600 UP w150 UP w150 UP w150 DOWN w200 YES w1000')
    else if ((m = /^hold:(\d)$/.exec(step))) await devIn(22, Number(m[1]), 1) // development bases: host frames wait N seconds, as after a boot
    else if (step === 'selftest' || step === 'selftest:trace') { // dsp.c's self-test (PROJ > MODWERK > SELF TEST): started, then read until it is done
      // :trace prints each read beside the CPU meter's latest half-second window (development bases), to see what a peak was
      const trace = step.endsWith(':trace') && (async (r, t0) => { const w = await statusWords(); console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)} s phase ${r.phase} done ${r.done}/${r.total} ran ${r.ran} cpu now ${w(66)} recorded ${r.cpu} T1-4 ${w(70)} T5-8 ${w(68)}`) })
      const read = async go => { const b = Buffer.from(await devIn(21, go, 96)); return { state: b.readUInt32BE(0), phase: b.readUInt32BE(4), failed: b.readUInt32BE(8),
        modules: b.readUInt32BE(12), dsp: b.readUInt32BE(16), intact: b.readUInt32BE(20), ran: b.readUInt32BE(24), peak: [b.readUInt32BE(28), b.readUInt32BE(32)],
        cpu: b.readUInt32BE(36), done: b.readUInt32BE(40), total: b.readUInt32BE(44), track: [...b.subarray(48, 56)], gap: b.readUInt32BE(56),
        saved: b.readUInt32BE(60), savedCount: b.readUInt32BE(64), live: b.readUInt32BE(68), culprit: b.subarray(76, 92).toString('latin1').replace(/\0.*$/s, '') } }
      let r = await read(1)
      if (r.state !== 1) throw new Error('The self-test did not start: stop the transport, and let the loader finish.')
      for (const start = Date.now(); r.state === 1 && Date.now() - start < 120000; await wait(500)) { r = await read(0); if (trace) await trace(r, start) }
      const why = ['a module broken', 'refused under load', 'frames stopped', 'a core over 90 %', 'loader errors or a stall', 'tracks not back', 'stopped', 'a module did not run alone', 'the CPU over 90 %', 'a frame late', 'code damaged'].filter((_, i) => r.failed >> i & 1)
      console.log(`selftest ${['idle', 'running', 'passed', 'failed'][r.state]}${why.length ? ': ' + why.join(', ') : ''}${r.culprit ? ' (' + r.culprit + ')' : ''}; modules ${r.intact}/${r.modules} intact, ${r.dsp} with DSP effects; ` +
        `together ${r.ran}/${r.dsp} ran (last batch ${r.track.map(id => id ? '0x' + id.toString(16) : '-').join(' ')}), peaks CPU ${r.cpu / 10}% T1-4 ${r.peak[0] / 10}% T5-8 ${r.peak[1] / 10}%; longest frame ${(r.gap / 132).toFixed(0)} us; card set ${r.saved}, ${r.savedCount}/${r.live}`)
    }
    else if (step === 'stall') { // dsp.c's record in battery RAM: the loader as it stood when the last stall was seen
      const b = await mem(0x100ff900, 456), v = new DataView(b.buffer, b.byteOffset, 456), w = i => v.getUint32(4 * i)
      if (w(0) !== 0x4d575354) console.log('stall: none recorded')
      else console.log(`stall ${w(1)}: ${['test', 'frames stopped', 'eDMA refused a transfer'][w(2)] ?? 'reason ' + w(2)} at tick ${w(3)}\n  ` +
        named(i => i < w(4) ? w(5 + i) : 0) + `\n  packets core 0 ${Buffer.from(b.subarray(404, 420)).toString('hex')} core 1 ${Buffer.from(b.subarray(420, 436)).toString('hex')}` +
        `\n  live FX ${Buffer.from(b.subarray(436, 452)).toString('hex')}\n  host ISR selected core 0x${v.getUint16(452).toString(16)} ` +
        `(RXDF ${v.getUint16(452) & 1}: a word the ColdFire never took), core 1 as last read 0x${v.getUint16(454).toString(16)}`)
    }
    else if (step === 'crashtest') await devIn(17, 0, 1) // development bases: an illegal instruction on the next tick (crash.c)
    else if ((m = /^freezetest:(\d+)$/.exec(step))) await devIn(28, Number(m[1]), 1) // development bases: the UI tick stands still N s (diag.c)
    else if (step === 'diaglog') { // diag.c's log over LOG (any base with it): its incidents and the last loads
      const data = new Uint8Array(DEVICE_LOG_PAGE * DEVICE_LOG_PAGES)
      for (let page = 0; page < DEVICE_LOG_PAGES; ++page) {
        const reply = await unit.controlTransferIn({ requestType: 'vendor', recipient: 'interface', request: DEVICE_LOG_REQUEST, value: page, index }, DEVICE_LOG_PAGE)
        if (reply.status !== 'ok' || reply.data?.byteLength !== DEVICE_LOG_PAGE) throw new Error(`This base does not answer LOG (diag.c): page ${page} ${reply.status} ${reply.data?.byteLength}`)
        data.set(new Uint8Array(reply.data.buffer, reply.data.byteOffset, DEVICE_LOG_PAGE), page * DEVICE_LOG_PAGE)
      }
      const log = parseDeviceLog(data)
      if (!log) console.log('diaglog: no log yet')
      else {
        console.log(`diaglog boot ${log.boot} seq ${log.seq}: ${log.incidents.length} incidents, ${log.loads.length} loads`)
        for (const r of log.incidents) console.log(`  #${r.seq} boot ${r.boot} +${r.second}s ${r.kind} a=${r.kind === 'base' ? r.a.toString(16).padStart(8, '0') : r.kind === 'set' ? r.a + ' [' + [...r.machines, ...r.fx, ...r.keys].slice(0, 4 * r.a).map((b, i, all) => i % 4 ? '' : all.slice(i, i + 4).map(x => x.toString(16).padStart(2, '0')).join('')).filter(Boolean).join(' ') + ']' : r.a} cpu ${r.cpu / 10}% T1-4 ${r.dsp1to4 / 10}% T5-8 ${r.dsp5to8 / 10}% ` +
          `${r.playing ? 'playing' : 'stopped'} tempo ${(r.tempo24 / 24).toFixed(1)} screen 0x${r.screen.toString(16)} keys ${r.keys.filter(k => k !== 255).map(k => k.toString(16)).join(',')} ` +
          `fx ${r.fx.map(f => f.toString(16)).join(',')} machines ${r.machines.join(',')}`)
        for (const r of log.loads.slice(-6)) console.log(`  #${r.seq} boot ${r.boot} min ${r.minute} cpu ${r.cpu.map(v => v / 10).join('/')}% T1-4 ${r.dsp1to4.map(v => v / 10).join('/')}% ` +
          `T5-8 ${r.dsp5to8.map(v => v / 10).join('/')}% playing ${r.playing}/${r.samples}` + (r.frameGap !== undefined ? ` frame gap ${r.frameGap} us, tick gap ${r.tickGap} frames` : ''))
        if (log.crash) console.log(`  crash record ${log.crash.count}: vector ${log.crash.vector} PC 0x${log.crash.pc.toString(16)} code ${log.crash.code.map(w => w.toString(16).padStart(8, '0')).join(' ')} uncached ${log.crash.memory.map(w => w.toString(16).padStart(8, '0')).join(' ')}`)
        if (log.stall) console.log(`  stall record ${log.stall.count}: reason ${log.stall.reason} tick ${log.stall.ticks}, ${log.stall.report.length} report words`)
      }
    }
    else if (step === 'crash') { // crash.c's record in battery RAM: what the last error exception was, and where
      const b = await mem(0x100ff800, 180), v = new DataView(b.buffer, b.byteOffset, 180), w = i => v.getUint32(4 * i)
      if (w(0) !== 0x4d574352) console.log('crash: none recorded')
      else console.log(`crash ${w(1)} (shown ${w(28)}): vector ${w(2) >>> 18 & 0xff} PC 0x${w(3).toString(16)} SR 0x${(w(2) & 0xffff).toString(16)} ` +
        `FS ${(w(2) >>> 24 & 0xc) | (w(2) >>> 16 & 3)} SP 0x${w(19).toString(16)}\n  d ${[...Array(8)].map((_, i) => w(4 + i).toString(16)).join(' ')}\n` +
        `  a ${[...Array(7)].map((_, i) => w(12 + i).toString(16)).join(' ')}\n  stack ${[...Array(8)].map((_, i) => w(20 + i).toString(16)).join(' ')}\n` +
        `  code at PC ${[...Array(8)].map((_, i) => w(29 + i).toString(16).padStart(8, '0')).join(' ')}\n` +
        `  uncached   ${[...Array(8)].map((_, i) => w(37 + i).toString(16).padStart(8, '0')).join(' ')}`)
    }
    else if (step === 'loader') { // packets each core took, the jobs in flight, the manager's transactions (report words)
      const w = await statusWords()
      console.log(`loader accepted ${w(6)}/${w(7)} rejected ${w(8)}/${w(9)} errors ${w(10)} jobs ${w(3) | 0}/${w(4) | 0} selections ${w(20)}/${w(19)} commits ${w(23)} rollbacks ${w(25)} words ${w(26)}/${w(27)} dry 0x${w(33).toString(16)}`)
    }
    else if ((m = /^part([1-4])$/.exec(step))) await part(Number(m[1]))
    else if ((m = /^pick:T([1-8]):FX([12]):(\S+)$/i.exec(step))) await pick(Number(m[1]) - 1, Number(m[2]), m[3].replace(/_/g, ' '))
    else if ((m = /^pickid:T([1-8]):FX([12]):(\d+)$/i.exec(step))) await pick(Number(m[1]) - 1, Number(m[2]), Number(m[3])) // by effect id
    else if (step === 'state') { const [s, r] = await devIn(6, 0, 2); console.log(s ? 'stopped' : 'playing', r ? 'recording' : '') }
    else if (step === 'stats') { const w = await statusWords(); console.log(`stats cpu ${w(66)} T1-4 ${w(69)}/${w(70)} T5-8 ${w(67)}/${w(68)} passes ${(w(76) / 1024).toFixed(1)} ${(w(77) / 1024).toFixed(1)}`) }
    else { const [, spec, times] = /^(.+?)(?:\*(\d+))?$/.exec(step); for (let i = 0; i < Number(times ?? 1); i++) await keys(spec) }
    await wait(60)
  }
}
const state = s => `${s.phase}, generation ${s.generation}, active ${s.active?.slice(0, 16) ?? 'unknown'}…`
console.log(`${identity.model}, base ${identity.base.slice(0, 16)}…`)

const interrupt = new AbortController()
process.once('SIGINT', () => { console.log('interrupted: rolling back'); process.exitCode = 130; interrupt.abort() })

/** While the unit plays, the base presses STOP and refuses with `unsafe`; retry for 3 s as the site does. A rollback
 * the loader could not switch yet answers `needs-recovery` and stays in recovery, from where it rolls back again
 * (OctatrackLink.whenStopped); given up at once, it left the unit in recovery until the base's own timeout. */
async function stopping(step) {
  for (const start = Date.now(); ; await wait(200)) {
    try { return await step() } catch (error) { if (!['unsafe', 'needs-recovery'].includes(error.status?.result) || Date.now() - start > 3000) throw error }
  }
}

/** Stage, publish and run `pkg` in a trial for `seconds`, then accept or roll back. */
/** A step the loader refused as busy (refusal 5: DSP code moving, a resident controller quiescing before it leaves) is
 * tried again for 5 s, as the site does; any other refusal is named (loader.h runtime_refusal: 7 a track plays it). */
async function retried(step) {
  for (const start = Date.now(); ; await wait(300)) {
    try { return await step() } catch (error) {
      const refusal = /rejected|backend/.test(error.message) ? (await transport.selftest(false).catch(() => undefined))?.refusal : undefined
      if (refusal === 5 && Date.now() - start < 5000) continue
      if (refusal !== undefined) error.message += ` (loader refusal ${refusal})`
      throw error
    }
  }
}
async function trial(session, pkg) {
  await stopping(() => session.stage(pkg, { signal: interrupt.signal })); await session.activate(); await session.startTrial()
  console.log(`trial: ${pkg.sha256.slice(0, 16)}… running`)
  for (let second = 1; second <= seconds && !interrupt.signal.aborted; second++) {
    await wait(1000)
    const d = await diag()
    if (d) console.log(`  ${second}s: ticks ${d.ticks}, value 0x${d.value.toString(16)}, slot ${d.active ? 'running' : 'empty'}, refusals ${d.refusals}`)
  }
  await stopping(() => session.holdTrial())
  if (values.accept && !interrupt.signal.aborted) { await session.accept(); console.log('accepted') }
  else { await stopping(() => session.rollback()); console.log('rolled back' + (values.accept ? '' : ' (pass --accept to keep it)')) }
  const left = Date.now(), status = await session.leaveUploadMode()
  console.log(`left upload mode in ${Date.now() - left} ms`) // the card-set save runs first, in the same task
  return status
}

/** After a RAM boot: wait until the unit has gone away and come back far enough to answer HELLO. */
let backBench
async function rebooted() {
  let gone = false
  for (const start = Date.now(); Date.now() - start < 60000; await wait(500)) {
    const again = backBench = new Bench(values.socket)
    try {
      await again.ready()
      const d = device(again), i = findVendorInterface(await enumerate(again, true))
      const t = new UsbVendorTransport(d, i, { pollMs: 5 }), base = (await t.identify()).base
      if (gone) return { base, session: await UploadSession.connect(t, base, { timeoutMs: 60000 }) } // the engine refuses until it runs
      again.socket.end()
    } catch { gone = true; again.socket.end() }
  }
  throw new Error('The unit did not come back within 60 s; a power cycle boots the flashed base.')
}

if (command === 'serve') {
  // One request per connection: a line in (a do sequence, or try/remove FILE), its output back, then close.
  const path = process.env.MODWERK_DEV_SOCKET ?? '/tmp/modwerk-dev.sock'
  let queue = Promise.resolve()
  const serial = task => (queue = queue.then(task, task))
  const capture = async (line, until) => {
    const out = [], log = console.log
    console.log = (...a) => out.push(a.join(' '))
    try {
      const [verb, arg, chunk] = line.trim().split(/\s+/)
      if (verb === 'boot' || verb === 'flash') { // the unit reboots and this link goes with it: hand the bridge to a one-shot boot or flash, then exit (run serve in a loop)
        bench.socket.end(); await wait(300)
        const r = spawnSync(process.execPath, [process.argv[1], verb, arg, '--socket', values.socket, ...(chunk ? ['--chunk', chunk] : [])], { encoding: 'utf8', timeout: 400000 })
        out.push(r.stdout, r.stderr, 'serve exits; the loop restarts it'); setTimeout(() => process.exit(0), 200)
      } else if (verb === 'recover') { // a transaction left behind (an install whose reply went missing): undo it, as the site does
        const session = await UploadSession.connect(transport, identity.base, { timeoutMs: 10000 })
        const phase = session.status.phase
        console.log(`found ${state(session.status)}`)
        // A published candidate (pending, trial, recovery, publishing) is rolled back, a staged one cancelled, as the site's cleanUp does.
        if (['pending', 'trial', 'recovery', 'publishing'].includes(phase) && session.adopt()) { await stopping(() => session.rollback()); await session.leaveUploadMode() }
        else if (session.adopt()) await session.cancel() // staged by the session that lost its reply
        else if (phase === 'ready') await session.leaveUploadMode() // a published candidate: the base rolls it back after 10 s of quiet
        console.log(`now ${state(session.status)}`)
      } else if (verb === 'try' || verb === 'remove') {
        const session = await UploadSession.connect(transport, identity.base, { timeoutMs: 10000 })
        const view = arg ? new DataView(new Uint8Array(readFileSync(arg)).buffer) : undefined, data = verb === 'try' ? new Uint8Array(readFileSync(arg)) : undefined
        values.accept = true; seconds = 1 // the session accepts at once; `try` from the shell keeps its trial
        console.log(state(await retried(() => trial(session, data ? { base: identity.base, data, sha256: sha(data) } : removal(identity.base, view?.getUint16(4) >= 4 ? view.getUint32(28) : undefined)))))
      } else await run(line, until)
    } catch (error) { out.push('error: ' + error.message + (error.cause ? ' (cause: ' + (error.cause.message ?? error.cause) + ')' : '')) } finally { console.log = log }
    return out.join('\n') + '\n'
  }
  rmSync(path, { force: true })
  createServer(c => {
    let line = ''
    c.setEncoding('utf8').on('data', d => {
      line += d
      if (!line.includes('\n')) return
      const request = line.slice(0, line.indexOf('\n')), waits = [...request.matchAll(/\bw(\d+)\b/g)].reduce((sum, m) => sum + Number(m[1]), 0)
      const limit = 20000 + waits // 20 s beyond the waits the sequence asks for: a hung request answers at once
      serial(() => {
        const work = capture(request, Date.now() + limit)
        Promise.race([work, wait(limit).then(() => `error: no answer from the unit within ${Math.round(limit / 1000)} s\n`)]).then(reply => c.end(reply))
        // The next request waits until this sequence has stopped: two sequences pressing keys at once retired
        // and reloaded an effect under a knob sweep (11 October 2026). A step stuck 30 s more is a dead link.
        return Promise.race([work, wait(limit + 30000)])
      })
    })
  }).listen(path, () => console.log('serving on ' + path))
  // --share PATH: the bench for one more client, such as the frontend MCP (--device-socket PATH), its transfers between
  // this session's (test plan T1). Only one of them may stage or try modules at a time; the session reads and presses keys.
  if (values.share) { if (!/^\d+$/.test(values.share)) rmSync(values.share, { force: true }); shareBench(bench, values.share).on('listening', () => console.log('sharing the unit on ' + values.share)) }
  setInterval(() => serial(() => devIn(6, 0, 2).catch(() => {})), 4000) // a request every 4 s: MODWERK CONNECTED shows once
} else try {
  if (command === 'key') { await keys(file); process.exit(0) }
  if (command === 'screen') { await screen(); process.exit(0) }
  if (command === 'ui') { await ui(); process.exit(0) }
  if (command === 'do') { await run(file); process.exit(0) }
  if (command === 'mem') {
    const [, length] = process.argv.slice(process.argv.indexOf('mem') + 1)
    console.log(Buffer.from(await mem(Number(file), Number(length) || 16)).toString('hex').replace(/(.{8})/g, '$1 ').trim()); process.exit(0)
  }
  if (command === 'enc') {
    const [, name, delta] = /^([A-F]|LEVEL)([+-]\d+)$/i.exec(file) ?? []
    const encoder = 'ABCDEF'.indexOf(name?.toUpperCase()) >= 0 ? 'ABCDEF'.indexOf(name.toUpperCase()) : name?.toUpperCase() === 'LEVEL' ? 6 : -1
    if (encoder < 0 || !Number(delta) || Math.abs(delta) > 127) throw new Error('Use enc A+3, enc F-1 or enc LEVEL+2.')
    await devIn(8, 0x30 | encoder | (Number(delta) & 0xff) << 8, 1); process.exit(0)
  }
  if (command === 'fader') {
    const position = Number(file)
    if (!Number.isInteger(position) || position < 0 || position > 255) throw new Error('Use fader 0-255.')
    await devIn(8, 0x40 | position << 8, 1); process.exit(0)
  }
  if (command === 'loader') {
    const bytes = await devIn(9, 0, 60), view = new DataView(bytes.buffer, bytes.byteOffset, 60)
    const names = ['frames', 'accepted0', 'accepted1', 'rejected0', 'rejected1', 'errors', 'probe', 'stage', 'job0', 'job1',
      'pool0', 'pool1', 'refused', 'missing', 'used']
    console.log(Object.fromEntries(names.map((name, i) => [name, name.startsWith('job') ? view.getInt32(4 * i) : view.getUint32(4 * i)])))
    process.exit(0)
  }
  if (command === 'report') {
    const view = await reportView(), hex = new Set([...REPORT_HEX, 'used1', 'dry1'])
    const names = view.byteLength > 4 * REPORT_NAMES.length ? [...REPORT_NAMES, 'used1', 'dry1', 'pad'] : REPORT_NAMES
    console.log(Object.fromEntries(names.map((name, i) => [name, ['job0', 'job1', 'missCore', 'meterCore'].includes(name) ? view.getInt32(4 * i)
      : hex.has(name) ? '0x' + view.getUint32(4 * i).toString(16) : view.getUint32(4 * i)])))
    process.exit(0)
  }
  if (command === 'stats') { // status.c's tail of the report: per mille, block masks, bytes
    const w = await statusWords(), pc = permille => Math.round(permille / 10) + '%', blocks = mask => [0, 1, 2, 3].filter(b => mask >> b & 1).length + '/4'
    const [buf, arena] = [w(71), w(75)]
    console.log(`CPU ${pc(w(66))}\nDSP T1-4 ${pc(w(69))} (peak ${pc(w(70))})  T5-8 ${pc(w(67))} (peak ${pc(w(68))})\n` +
      `arena T1-4 ${w(27)}/${arena >>> 16} words  T5-8 ${w(26)}/${arena & 0xffff} words\n` +
      `buffers FX1 T1-4 ${blocks(buf >> 8)} T5-8 ${blocks(buf)}  FX2 T1-4 ${blocks(buf >> 12)} T5-8 ${blocks(buf >> 4)}\n` +
      `modules ${w(73)}, pool ${Math.round(w(72) / 1024)} KiB of ${Math.round((w(72) + Buffer.from(await devIn(24, 0, 276)).readUInt32BE(4)) / 1024)}\n` +
      `idle passes a frame (last window): core 0 ${(w(76) / 1024).toFixed(1)}, core 1 ${(w(77) / 1024).toFixed(1)}`)
    process.exit(0)
  }
  if (command === 'missing') { console.log(await missing()); process.exit(0) }
  if (command === 'meter') { // dsp_receiver.asm's load meter, read back a bit a frame (report words 53-59)
    if (!['0', '1'].includes(file)) throw new Error('Use meter 0 or meter 1.')
    if (!(await devIn(13, Number(file), 1))[0]) throw new Error('A meter read is already waiting.')
    for (const until = Date.now() + 15000; Date.now() < until; await new Promise(r => setTimeout(r, 200))) {
      const view = await reportView(), w = i => view.getUint32(4 * i)
      if (view.getInt32(4 * 53) !== Number(file) || w(54) !== 120) continue
      console.log({ core: Number(file), window: w(55), idleLeast: w(56), idleMost: w(57), idleMean: +(w(58) / 1024).toFixed(1), missed: w(59) })
      process.exit(0)
    }
    throw new Error('The meter was not read within 15 s (the loader busy?).')
  }
  if (command === 'probe') {
    if (!['0', '1'].includes(file)) throw new Error('Use probe 0 or probe 1.')
    console.log('probe core', file, (await devIn(12, Number(file), 1))[0] ? 'sent' : 'not sent (busy or not idle)'); process.exit(0)
  }
  if (command === 'state') { const [stopped, recording] = await devIn(6, 0, 2); console.log(stopped ? 'stopped' : 'playing', recording ? '(recording)' : ''); process.exit(0) }
  // A whole OS image takes the unit (and far longer the emulator) a while to hash.
  const session = await UploadSession.connect(transport, identity.base, { timeoutMs: command === 'flash' ? 180000 : command === 'boot' ? 60000 : 10000 })
  if (command === 'status') console.log(state(session.status), '\nDIAG', await diag() ?? 'not answered',
    '\nSLOTS', JSON.stringify(await transport.slots().catch(() => undefined) ?? 'not answered (a base before the two slots)'))
  if (command === 'lifecycle') await runLifecycle(unit, index, console.log)
  if (command === 'remove') {
    // An ABI 4 file names its module (sdk/runtime/loader/README.md); ABI 3 modules are module 0.
    const view = file ? new DataView(new Uint8Array(readFileSync(file)).buffer) : undefined
    if (view && (view.byteLength < 32 || view.getUint32(0) !== 0x4d57524d)) throw new Error(file + ' is not a runtime module.')
    console.log(state(await retried(() => trial(session, removal(identity.base, view?.getUint16(4) >= 4 ? view.getUint32(28) : undefined)))))
  }
  if (command === 'try') {
    const data = new Uint8Array(readFileSync(file))
    // shortcut: runtime module files do not name their base yet, so any file is offered to the connected base,
    // whose loader validates it; bind the base once the hook ABI defines module files.
    console.log(state(await retried(() => trial(session, { base: identity.base, data, sha256: sha(data) }))))
  }
  if (command === 'flash') {
    // The base writes its own container to NOR (flash.c): `boot DIR` first, then this on that base. The plain ELEK
    // container is the .bin deciphered; the base refuses any other base's and verifies NOR before it restarts on it.
    const parsed = formats.parse(new Uint8Array(readFileSync(join(file, 'NOT_FLASH_CANDIDATE.bin'))), OCTATRACK), container = parsed.container
    const expected = JSON.parse(readFileSync(join(file, 'proofs.json'), 'utf8')).configurationHash
    if (identity.base !== expected) throw new Error(`The unit runs base ${identity.base.slice(0, 16)}…, not ${expected.slice(0, 16)}…: RAM-boot it first (boot DIR); a base writes only itself.`)
    let shown = 0
    await session.stage({ base: identity.base, data: container, sha256: sha(container) }, { signal: interrupt.signal, chunk: values.chunk ? Number(values.chunk) : undefined, progress: (done, total) => {
      if (Math.floor(10 * done / total) > shown) console.log(`  staged ${10 * (shown = Math.floor(10 * done / total))}%`)
    } })
    console.log('writing NOR (the base erases, programs and verifies; the unit shows the update on its screen)…')
    await session.activate()
    // A base that answers SLOTS (flash.c's two slots) writes itself while it runs on; one before it restarts on NOR.
    const twoSlots = await transport.slots().catch(() => undefined) !== undefined
    console.log(twoSlots ? 'written and verified into a slot; the unit runs on, and its next start is from that slot' : 'written and verified; accepting: the unit restarts on NOR half a second on')
    await session.accept()
    if (twoSlots) console.log('SLOTS', JSON.stringify(await transport.slots().catch(() => undefined)))
    else {
      bench.socket.end()
      const back = await rebooted()
      if (back.base !== expected) throw new Error(`The unit came back on base ${back.base.slice(0, 16)}…, not the one written.`)
      console.log(`flashed over USB: base ${expected.slice(0, 16)}… (power cycles boot it now)`)
    }
  }
  if (command === 'boot') {
    try { mkdirSync(join(homedir(), '.cache/modwerk-octatrack'), { recursive: true }); writeFileSync(LAST_BOOT, resolve(file)) } catch { /* profile then asks */ }
    const image = new Uint8Array(readFileSync(join(file, 'MAIN.raw')))
    const expected = JSON.parse(readFileSync(join(file, 'proofs.json'), 'utf8')).configurationHash
    if (image.length < 4 || new DataView(image.buffer, image.byteOffset).getUint32(0) !== 0x4fefffe4)
      throw new Error(join(file, 'MAIN.raw') + ' is not an OS image.')
    const arm = async (s, base) => {
      let shown = 0
      await s.stage({ base, data: image, sha256: sha(image) }, { signal: interrupt.signal, chunk: values.chunk ? Number(values.chunk) : undefined, progress: (done, total) => {
        if (Math.floor(10 * done / total) > shown) console.log(`  staged ${10 * (shown = Math.floor(10 * done / total))}%`)
      } })
      await s.activate() // the base arms the boot and resets half a second later
      console.log(`armed: the unit restarts into ${expected.slice(0, 16)}… from RAM; a power cycle returns to the flashed base`)
    }
    await arm(session, identity.base)
    if (values.emulator) await wait(3000) // ot_emu stops when the client hangs up; let the reset run first
    else {
      bench.socket.end()
      let back = await rebooted()
      // Only the flashed base's gate reads the mailbox, at its own address: armed from a RAM-booted base,
      // the boot falls back to the flashed one, which can then arm it properly.
      if (back.base !== expected && back.base !== identity.base) {
        console.log(`came back on the flashed base ${back.base.slice(0, 16)}…: arming again from it`)
        await arm(back.session, back.base)
        backBench.socket.end()
        back = await rebooted()
      }
      if (back.base !== expected) throw new Error(`The unit came back on base ${back.base.slice(0, 16)}…, not the one sent; a power cycle boots the flashed base.`)
      console.log(`booted: base ${expected.slice(0, 16)}…`)
    }
  }
} catch (error) {
  console.error(error.message, error.cause?.message ?? '')
  console.error('If a module was left in trial, unplug USB: the base rolls back anything not accepted.')
  process.exitCode = 1
} finally { bench.socket.end(); backBench?.socket.end() }
