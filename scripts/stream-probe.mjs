// SPDX-License-Identifier: GPL-3.0-or-later
// Stream probe A's reply (dev request 47; sdk/machines/octatrack/module-adapters/stream_probe.py, stream_probe.c):
// development twins built with --stream-probe N. device.mjs `do stream`, `stream:on`, `stream:off`, `stream:dsp`.
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
