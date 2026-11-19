#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Soak test of the RAM boot's restart: does the unit come back on USB every time?
//
//   node scripts/octatrack-bootsoak.mjs BUILD_DIR --socket PATH [--cycles 15] [--log FILE] [--chunk 4096] [--resume]
//
// RAM-boots BUILD_DIR (build_core.py's output) again and again with `device.mjs boot`, one boot per cycle, and appends
// one JSON line per boot to the log: how long it took, whether the unit came back on the base sent, whether it first
// fell back to the flashed base. It stops at the first boot that does not come back, because only a power cycle clears
// that, and says what to note down before it; --resume goes on after that power cycle, and the failure stays counted.
// A batch of 15 takes about four minutes; run batches against the same log and the last line counts them all. With no failure in n boots the true rate is under about 3/n (95 %): 20 clean
// boots allow one failure in seven, 300 allow one in a hundred.
//
// The base must be a development twin of the flashed one. Nothing is flashed and no module set is written; every boot
// ends a trial and restarts the audio, so use a scratch project and stop the sequencer first.
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const TIMEOUT_MS = 200000 // device.mjs gives each of up to two restarts 60 s, and the upload its own time

/** One boot's result from `device.mjs boot`'s exit status and output. */
export function readBoot({ status, stdout = '', stderr = '', error }) {
  const text = stdout + '\n' + stderr
  const rearmed = /came back on the flashed base/.test(text)
  if (status === 0 && /^booted: base /m.test(text)) return { ok: true, rearmed }
  const reason = error?.code === 'ETIMEDOUT' ? 'the boot command itself timed out'
    : /did not come back within/.test(text) ? 'no USB within 60 s of the restart'
      : /came back on base/.test(text) ? 'came back on another base'
        : /^armed: /m.test(text) ? 'armed, then lost' : 'never armed (the link was not up before the boot)'
  return { ok: false, rearmed, reason, armed: /^armed: /m.test(text), tail: text.trim().split('\n').slice(-3).join(' | ') }
}

/** Every boot in the log so far: how many, how many came back, their times, and the rate that many clean boots still allow. */
export function summarize(lines) {
  const boots = lines.filter(line => line.cycle !== undefined), ok = boots.filter(boot => boot.ok)
  const seconds = ok.map(boot => boot.seconds).sort((a, b) => a - b), failed = boots.length - ok.length
  return {
    boots: boots.length, back: ok.length, failed, rearmed: boots.filter(boot => boot.rearmed).length,
    seconds: seconds.length ? { least: seconds[0], median: seconds[seconds.length >> 1], most: seconds.at(-1) } : null,
    // No failure in n: under 3/n at 95 % (the rule of three). With failures, the plain rate.
    rate: !boots.length ? null : failed ? `${failed} in ${boots.length}` : `none in ${boots.length}: under 1 in ${Math.floor(boots.length / 3)} at 95 %`,
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values, positionals: [dir] } = parseArgs({ allowPositionals: true, options: {
    socket: { type: 'string' }, cycles: { type: 'string', default: '15' }, log: { type: 'string', default: 'bootsoak.jsonl' }, chunk: { type: 'string' }, resume: { type: 'boolean' },
  } })
  const cycles = Number(values.cycles)
  if (!dir || !values.socket || !Number.isInteger(cycles) || cycles < 1 || cycles > 300 || !existsSync(join(dir, 'MAIN.raw'))) {
    console.error('Usage: octatrack-bootsoak.mjs BUILD_DIR --socket PATH [--cycles 1-300] [--log FILE] [--chunk 1-4096] [--resume]\nBUILD_DIR is build_core.py\'s output (MAIN.raw, proofs.json).')
    process.exit(2)
  }
  const device = join(dirname(fileURLToPath(import.meta.url)), 'device.mjs')
  const earlier = existsSync(values.log) ? readFileSync(values.log, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
  const last = earlier.filter(line => line.cycle !== undefined).at(-1)
  if (last && !last.ok && !values.resume) {
    console.error(`The log's last boot (${last.cycle}) did not come back: ${last.reason}. Power-cycle the unit, then pass --resume to go on; that boot stays counted.`)
    process.exit(1)
  }
  const base = JSON.parse(readFileSync(join(dir, 'proofs.json'), 'utf8')).configurationHash.slice(0, 16)
  let cycle = last?.cycle ?? 0
  const written = [...earlier]
  for (let n = 0; n < cycles; n++) {
    const start = Date.now()
    const run = spawnSync(process.execPath, [device, 'boot', dir, '--socket', values.socket, ...(values.chunk ? ['--chunk', values.chunk] : [])], { encoding: 'utf8', timeout: TIMEOUT_MS })
    const line = { cycle: ++cycle, at: new Date(start).toISOString(), base, seconds: Math.round((Date.now() - start) / 100) / 10, ...readBoot(run) }
    appendFileSync(values.log, JSON.stringify(line) + '\n'); written.push(line)
    console.log(JSON.stringify(line))
    if (!line.ok) {
      console.error(`Boot ${cycle} did not come back (${line.reason}). Before the power cycle, note: does the screen show the logo, the project, or nothing; do the keys answer; does the computer still list the USB device. Then power-cycle.`)
      break
    }
  }
  const summary = summarize(written)
  appendFileSync(values.log, JSON.stringify({ summary }) + '\n')
  console.log(JSON.stringify({ summary }))
  process.exitCode = summary.failed ? 1 : 0
}
