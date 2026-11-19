// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { pathToFileURL } from 'node:url'
import { compareRenders, readAudio, SAMPLE_RATE, wavFile } from './fx-audit-analysis.mjs'

export const MINI_VERB_023 = 'eea25e6cf8ac0a39ab300d8ba543b0d5829b789a03e0081c8d136c64f2eed518'
const controls = ['ATK', 'REL', 'THRS', 'RAT', 'GAIN', 'MIX', 'RMS', 'KGN', 'KBAS', 'KWID']

// Only these messages go to the operator on a measurement failure. Device replies stay private.
export class SidechainAudioError extends Error {}

// One second at 120 BPM. The key decays twice per loop while the receiver plays a steady tone.
export function writeSidechainSources(dir) {
  const tone = Int32Array.from({ length: SAMPLE_RATE }, (_, n) => Math.round(0x200000 * Math.sin(2 * Math.PI * 220 * n / SAMPLE_RATE)))
  const pulse = Int32Array.from({ length: SAMPLE_RATE }, (_, n) => {
    const t = (n % (SAMPLE_RATE / 2)) / SAMPLE_RATE
    return t < 0.25 ? Math.round(0x600000 * Math.sin(2 * Math.PI * 110 * t) * Math.exp(-24 * t)) : 0
  })
  writeFileSync(join(dir, 'T1-key.wav'), wavFile(pulse), { flag: 'wx' })
  writeFileSync(join(dir, 'T5-program.wav'), wavFile(tone), { flag: 'wx' })
}

function settings(dir, phase) {
  const state = JSON.parse(readFileSync(join(dir, phase + '.json'), 'utf8'))
  assert.ok(['physical Octatrack', 'emulator'].includes(state.target), 'Record the actual capture target.')
  assert.ok(['MKI', 'MKII'].includes(state.model) && typeof state.os === 'string' && state.os.trim(), 'Record the model and OS.')
  assert.deepEqual([state.track, state.slot, state.effect, state.KEY, state.MON], [5, 'FX2', 'COMPRESSOR', 'T1', 'OFF'],
    'Capture T5 FX2 COMPRESSOR, keyed from T1, with MON off.')
  for (const control of controls) {
    const value = state.parameters?.[control]
    assert.ok(Number.isFinite(value) || (typeof value === 'string' && value.trim()), 'Missing displayed compressor control ' + control)
  }
  return { target: state.target, model: state.model, os: state.os, track: state.track, slot: state.slot, effect: state.effect, KEY: state.KEY, MON: state.MON,
    parameters: Object.fromEntries(controls.map(control => [control, state.parameters[control]])) }
}

function capture(dir, name) {
  const file = join(dir, name + '.wav'), bytes = readFileSync(file)
  assert.ok(bytes.length >= 44 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.readUInt32LE(4) === bytes.length - 8,
    name + ' must be a complete RIFF WAV capture.')
  const audio = readAudio(file)
  assert.ok(audio.length === 2 && audio.every(channel => channel.length === SAMPLE_RATE && channel.every(Number.isFinite)),
    name + ' must contain one second of finite stereo samples at 44.1 kHz.')
  return { audio, sha256: createHash('sha256').update(bytes).digest('hex') }
}

function exact(reference, observed, label) {
  const result = compareRenders(reference, observed)
  if (result.verdict !== 'identical') throw new SidechainAudioError(label + ': ' + result.verdict +
    (result.firstSeconds === null ? '' : ' at frame ' + Math.round(result.firstSeconds * SAMPLE_RATE)))
}

/** The operator records a triggered, isolated stereo CUE stem. Read each phase while the verifier owns that phase. */
export function readSidechainBaseline(dir) {
  const state = settings(dir, 'before'), muted = capture(dir, 'key-muted'), keyed = capture(dir, 'before'), repeat = capture(dir, 'repeat')
  const keyResponseDb = keyed.audio.map((channel, i) => {
    const label = i === 0 ? 'left' : 'right'
    exact([channel], [repeat.audio[i]], 'Repeated keyed baseline on ' + label)
    const response = compareRenders([muted.audio[i]], [channel])
    if (response.verdict !== 'differs' || response.levelDb === null || response.levelDb > -1)
      throw new SidechainAudioError('The T1 key must duck the ' + label + ' T5 output by at least 1 dB versus the key-muted take.')
    return response.levelDb
  })
  return { state, keyed, repeatSha256: repeat.sha256, keyMutedSha256: muted.sha256, keyResponseDb }
}

export function compareSidechainAfterUndo(dir, baseline) {
  assert.deepEqual(settings(dir, 'after'), baseline.state, 'The reported survivor assignment or control settings changed.')
  const after = capture(dir, 'after')
  exact(baseline.keyed.audio, after.audio, 'Sidechain Compressor after Undo')
  return {
    target: baseline.state.target, capture: 'operator-triggered T5-only stereo CUE', reportedPanel: baseline.state,
    neighbour: { module: 'miniverb', version: '0.2.3-experimental', track: 3, slot: 'FX2', gesture: 'operator confirmed MIX 0 to 64' },
    sampleRate: SAMPLE_RATE, frames: SAMPLE_RATE, channels: 2, verdict: 'identical', keyResponseDb: baseline.keyResponseDb,
    wavSha256: { keyMuted: baseline.keyMutedSha256, before: baseline.keyed.sha256, repeat: baseline.repeatSha256, after: after.sha256 },
  }
}

export function openSidechainBench() {
  assert.ok(process.stdin.isTTY, 'The audio bench needs an operator terminal.')
  const dir = mkdtempSync(join(tmpdir(), 'modwerk-sidechain-'))
  const terminal = createInterface({ input: process.stdin, output: process.stderr })
  const cancelled = new AbortController()
  terminal.on('SIGINT', () => cancelled.abort())
  terminal.once('close', () => cancelled.abort())
  let baseline
  async function confirm(prompt, answer, signal) {
    const active = signal ? AbortSignal.any([signal, cancelled.signal]) : cancelled.signal
    assert.equal((await terminal.question(prompt + '\nType ' + answer + ' to continue: ', { signal: active })).trim(), answer,
      'The operator did not confirm this observation.')
  }
  return {
    async baseline() {
      await confirm('Capture the T5-only CUE stem in ' + dir + '. Write key-muted.wav with the T1 trigger disabled, then before.wav and repeat.wav with T1 playing. Record before.json from the panel.', 'BASELINE')
      baseline = readSidechainBaseline(dir)
    },
    async gesture() {
      await confirm('Select Mini Verb on T3 FX2. Play the prepared pattern and turn MIX from 0 to 64. Leave T5 unchanged.', 'MIX 64', AbortSignal.timeout(60000))
    },
    async afterUndo() {
      assert.ok(!existsSync(join(dir, 'after.wav')) && !existsSync(join(dir, 'after.json')), 'The post-Undo observations must be made after restoration.')
      await confirm('Undo and inventory restoration have completed. Retrigger the same pattern, record after.wav and read the T5 panel into after.json in ' + dir + '.', 'CAPTURED')
      return compareSidechainAfterUndo(dir, baseline)
    },
    close() { terminal.close() },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.deepEqual(process.argv.slice(2), ['--prepare'], 'Usage: node scripts/sidechain-undo-audio.mjs --prepare')
  const dir = mkdtempSync(join(tmpdir(), 'modwerk-sidechain-sources-'))
  writeSidechainSources(dir)
  console.log(dir)
}
