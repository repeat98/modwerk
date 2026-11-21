import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readAudio, SAMPLE_RATE, wavFile } from './fx-audit-analysis.mjs'
import { compareSidechainAfterUndo, readSidechainBaseline, writeSidechainSources } from './sidechain-undo-audio.mjs'

const panel = { target: 'emulator', model: 'MKII', os: '1.40C', track: 5, slot: 'FX2', effect: 'COMPRESSOR', KEY: 'T1', MON: 'OFF',
  parameters: { ATK: 4, REL: 24, THRS: 32, RAT: 80, GAIN: 0, MIX: 127, RMS: 0, KGN: 64, KBAS: 0, KWID: 127 } }
let dir
function take(name, gain = 1, frames = SAMPLE_RATE) {
  const words = Int32Array.from({ length: frames * 2 }, (_, n) => Math.round(1000000 * gain * Math.sin(Math.floor(n / 2) / 11)))
  const wav = wavFile(words)
  wav.writeUInt16LE(2, 22)
  wav.writeUInt32LE(6 * SAMPLE_RATE, 28)
  wav.writeUInt16LE(6, 32)
  writeFileSync(join(dir, name + '.wav'), wav)
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sidechain-undo-test-'))
  for (const name of ['before', 'after']) writeFileSync(join(dir, name + '.json'), JSON.stringify(panel))
  take('key-muted', 2)
  for (const name of ['before', 'repeat', 'after']) take(name)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('Sidechain Compressor stereo capture', () => {
  it('prepares a retriggerable key and continuous receiver at the capture rate', () => {
    writeSidechainSources(dir)
    const [key] = readAudio(join(dir, 'T1-key.wav')), [tone] = readAudio(join(dir, 'T5-program.wav'))
    expect(tone).toHaveLength(SAMPLE_RATE)
    expect(key.slice(0, SAMPLE_RATE / 2)).toEqual(key.slice(SAMPLE_RATE / 2))
    expect(key.slice(SAMPLE_RATE / 4, SAMPLE_RATE / 2).every(x => x === 0)).toBe(true)
    expect(tone[SAMPLE_RATE / 4 + 1]).not.toBe(0)
  })
  it('requires a repeatable keyed signal and compares the restored track sample for sample', () => {
    const baseline = readSidechainBaseline(dir), result = compareSidechainAfterUndo(dir, baseline)
    expect(result.verdict).toBe('identical')
    expect(result.target).toBe('emulator')
    for (const db of result.keyResponseDb) expect(db).toBeCloseTo(-6.02, 2)
    expect(result.wavSha256.after).toBe(result.wavSha256.before)
    const file = join(dir, 'after.wav'), wav = readFileSync(file)
    wav[44 + 6 * 500 + 3] ^= 1  // one word on the right, well below the audible tolerance
    writeFileSync(file, wav)
    expect(() => compareSidechainAfterUndo(dir, baseline)).toThrow(/frame 500/)
  })
  it('rejects silence, an inactive key and unstable repeats before trial', () => {
    take('key-muted')
    expect(() => readSidechainBaseline(dir)).toThrow(/duck/)
    take('repeat', 0.95)
    expect(() => readSidechainBaseline(dir)).toThrow(/Repeated/)
    take('before', 0)
    take('repeat', 0)
    expect(() => readSidechainBaseline(dir)).toThrow(/silent/)
  })
  it('rejects truncated takes and changed panel settings even when the audio prefix matches', () => {
    const baseline = readSidechainBaseline(dir)
    take('after', 1, SAMPLE_RATE - 1)
    expect(() => compareSidechainAfterUndo(dir, baseline)).toThrow(/one second/)
    take('after')
    writeFileSync(join(dir, 'after.json'), JSON.stringify({ ...panel, parameters: { ...panel.parameters, REL: 25 } }))
    expect(() => compareSidechainAfterUndo(dir, baseline)).toThrow(/settings changed/)
  })
})
