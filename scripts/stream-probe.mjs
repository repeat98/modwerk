// SPDX-License-Identifier: GPL-3.0-or-later
// Stream probes' replies (sdk/machines/octatrack/module-adapters/stream_probe.py, stream_probe.c), development twins:
// probe A (dev request 47, built with --stream-probe N): device.mjs `do stream`, `stream:on`, `stream:off`, `stream:dsp`;
// probe B (dev request 48, built with --stream-read N): `do streamb`, `streamb:on`, `streamb:off`, `streamb:zero`.
export const STREAM_REQUEST = 47
export const STREAM_OPS = { read: 0, start: 1, stop: 2, snapshot: 3, window: 4 }
export const STREAM_REPLY_BYTES = 204
export const STREAM_DSP_BITS = 240
const FRAME = 47891 // DTCN3 counts a frame (16 samples at 44.1 kHz, 132 MHz)
const WINDOWS = ['start', 'complete', 'transfer', 'unmask', 'baseline'] // baseline: the unmask in a frame without a block
const DSP = ['frames', 'good', 'bad', 'missing', 'jumps', 'junk', 'last', 'diff']

/** The reply's words, named; throws on anything that is not a stream probe reply. */
export function parseStreamReply(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), w = i => view.getUint32(4 * i)
  if (bytes.byteLength !== STREAM_REPLY_BYTES || w(0) !== 0x4d575350) throw new Error('Not a stream probe reply: build the twin with --stream-probe N.')
  const flags = w(2)
  const windows = Object.fromEntries(WINDOWS.map((name, k) => {
    const at = 16 + 5 * k, count = w(at + 2), sum = w(at + 3) * 2 ** 32 + w(at + 4)
    return [name, { min: w(at), max: w(at + 1), count, mean: count ? sum / count : 0 }]
  }))
  const published = Array.from({ length: 10 }, (_, i) => w(16 + 5 * WINDOWS.length + i))
  return {
    words: w(1), armed: !!(flags & 1), stopping: !!(flags & 2), failed: !!(flags & 4), snapshotPending: !!(flags & 8),
    snapshotWaiting: !!(flags & 16), dspReadQueued: !!(flags & 32), offered: w(3), sent: w(4), completed: w(5), accounted: w(6),
    straddles: w(7), refused: w(8), snapshots: w(9), sequence: w(10), early: w(11), loaderStraddles: w(12), dspBits: w(13),
    counters: w(14), taken: !!w(15), windows,
    dsp: { serial: published[0], serialAfter: published[9], ...Object.fromEntries(DSP.map((name, i) => [name, published[1 + i]])) },
  }
}

const us = counts => `${(counts / 132).toFixed(1)} us (${(100 * counts / FRAME).toFixed(1)} %)`

/** One line per part, for people: the ColdFire's counts and this window's times. */
export function describeStream(r) {
  const state = r.failed ? 'stopped by the watchdog (a transfer it gave up)' : r.armed ? (r.stopping ? 'stopping' : 'sending') : 'idle'
  const lines = [`stream probe, ${r.words} halfwords a frame: ${state}; ${r.sent} blocks sent of ${r.offered} offered, ${r.completed} completed, ` +
    `${r.accounted} accounted, ${r.refused} refused, ${r.straddles} across a frame start; state-7 early visits ${r.early}, loader packets across a frame start ${r.loaderStraddles}`]
  for (const name of WINDOWS) {
    const t = r.windows[name]
    lines.push(`  ${name.padEnd(8)} ${t.count ? `min ${us(t.min)}, mean ${us(t.mean)}, max ${us(t.max)} over ${t.count}` : 'none in this window'}`)
  }
  return lines.join('\n')
}

/** The checker's published counters (after `stream:dsp`). */
export function describeDsp(r) {
  const d = r.dsp
  if (r.dspBits < STREAM_DSP_BITS) return `DSP checker: ${r.dspBits} of ${STREAM_DSP_BITS} bits read`
  if (d.serial !== d.serialAfter) return `DSP checker: torn read (serials ${d.serial} and ${d.serialAfter}), read again`
  const blocks = d.good + d.bad
  return `DSP checker (snapshot ${d.serial}, P:$${r.counters.toString(16)}): ${d.frames} frames, ${d.good} good, ${d.bad} bad, ${d.missing} missing, ` +
    `${d.jumps} out of order, ${d.junk} with bits 16-23 set; last sequence ${d.last}` + (d.bad ? `, last bad block's differences $${d.diff.toString(16).padStart(6, '0')}` : '') +
    (blocks ? `; ${(100 * d.good / blocks).toFixed(3)} % of blocks good` : '')
}

export const STREAM_READ_REQUEST = 48
export const STREAM_READ_OPS = { read: 0, start: 1, stop: 2, zero: 3, window: 4 }
export const STREAM_READ_REPLY_BYTES = 200
// The read's start, completion and transfer; the unmask with a read and without (baseline); the ColdFire's check.
const READ_WINDOWS = ['start', 'complete', 'transfer', 'unmask', 'baseline', 'check']

/** Probe B's reply, named; throws on anything that is not one. */
export function parseStreamReadReply(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), w = i => view.getUint32(4 * i)
  if (bytes.byteLength !== STREAM_READ_REPLY_BYTES || w(0) !== 0x4d575352) throw new Error('Not a stream probe B reply: build the twin with --stream-read N.')
  const windows = Object.fromEntries(READ_WINDOWS.map((name, k) => {
    const at = 20 + 5 * k, count = w(at + 2), sum = w(at + 3) * 2 ** 32 + w(at + 4)
    return [name, { min: w(at), max: w(at + 1), count, mean: count ? sum / count : 0 }]
  }))
  return {
    words: w(1), armed: !!(w(2) & 1), failed: !!(w(2) & 4), offered: w(3), sent: w(4), completed: w(5), checked: w(6),
    refused: w(7), lost: w(8), blocks: w(9), good: w(10), bad: w(11), missing: w(12), jumps: w(13), stale: w(14),
    last: w(15), diff: w(16), head: [w(17) >>> 16, w(17) & 0xffff, w(18) >>> 16, w(18) & 0xffff],
    taken: !!(w(19) & 1), region: w(19) >>> 16, windows,
  }
}

/** Probe B for people: the ColdFire's counts, its check of the blocks and this window's times. */
export function describeStreamRead(r) {
  const state = r.failed ? 'stopped by the watchdog (the frame chain was recovered)' : r.armed ? 'reading' : 'idle'
  const hex = n => '$' + n.toString(16).padStart(4, '0')
  const lines = [`stream probe B, ${r.words} halfwords a frame from core 0 X:$x${r.region.toString(16)}: ${state}; ${r.sent} reads of ${r.offered} offered, ` +
    `${r.completed} completed, ${r.checked} checked, ${r.refused} refused, ${r.lost} lost to a restarted frame`,
  `  blocks ${r.blocks}: ${r.good} good, ${r.bad} bad, ${r.missing} missing, ${r.jumps} out of order, ${r.stale} stale; last sequence ${r.last}` +
    (r.bad ? `, last bad block's differences ${hex(r.diff)}` : '') + (r.bad || r.missing ? `, its first words ${r.head.map(hex).join(' ')}` : '') +
    (r.blocks ? `; ${(100 * r.good / r.blocks).toFixed(3)} % good` : '')]
  for (const name of READ_WINDOWS) {
    const t = r.windows[name]
    lines.push(`  ${name.padEnd(8)} ${t.count ? `min ${us(t.min)}, mean ${us(t.mean)}, max ${us(t.max)} over ${t.count}` : 'none in this window'}`)
  }
  return lines.join('\n')
}
