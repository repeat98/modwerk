import { afterAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FFT_SIZE, FULL_SCALE, LIMITS, SAMPLE_RATE, TONES_HZ, WARMUP, analyzeTone, readAudio, selfTest, toneBin, toneHz, toneSamples, wavFile } from './fx-audit-analysis.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const audit = (...args) => spawnSync(process.execPath, ['scripts/fx-audit.mjs', ...args], { cwd: root, encoding: 'utf8' })
const scratch = mkdtempSync(join(tmpdir(), 'fx-audit-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

// What dsp_host does: mono raw in, the effect applied to each sample, interleaved L R int32 words out.
function render(planDir, outDir, effect) {
  for (const name of readdirSync(planDir).filter(file => file.endsWith('.raw'))) {
    const bytes = readFileSync(join(planDir, name)), input = new Int32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2)
    const out = new Int32Array(input.length * 2)
    input.forEach((word, n) => { out[2 * n] = out[2 * n + 1] = Math.round(Math.max(-1, Math.min(1, effect(word / FULL_SCALE, n))) * FULL_SCALE) })
    writeFileSync(join(outDir, name), Buffer.from(out.buffer))
  }
}
const run = (name, effect) => {
  const plan = join(scratch, name + '-plan'), out = join(scratch, name + '-out')
  expect(audit('plan', plan).status).toBe(0)
  rmSync(out, { recursive: true, force: true })
  spawnSync('mkdir', ['-p', out])
  render(plan, out, effect)
  return audit('check', plan, out)
}

describe('fx audit', () => {
  it('proves its own analysis before judging anything', () => {
    for (const row of selfTest()) expect(row.ok, row.name + ': ' + row.detail).toBe(true)
  })

  it('puts every test tone on whole cycles whose folded harmonics miss the true ones', () => {
    for (const hz of TONES_HZ) {
      const m = toneBin(hz)
      expect(m % 2).toBe(1)
      expect(Math.abs(toneHz(m) / hz - 1)).toBeLessThan(0.02)
    }
  })

  it('measures aliasing where it is, and nothing in a linear effect', () => {
    const tone = { m: toneBin(5300) }, input = Float64Array.from(toneSamples(tone.m, -1), word => word / FULL_SCALE)
    expect(analyzeTone(input.map(x => 0.5 * x), tone).aliasDbc).toBeLessThan(-100)
    const drive = analyzeTone(input.map(x => Math.tanh(6 * x)), tone)
    expect(drive.aliasDbc).toBeGreaterThan(LIMITS.alias)
    expect(drive.harmonicsDbc).toBeGreaterThan(-20)     // a true harmonic is distortion, not aliasing
    expect(() => analyzeTone(input.subarray(0, WARMUP + FFT_SIZE - 1), tone)).toThrow('needs')
  })

  it('fails a drive that aliases and passes a clean gain, through the files the harness reads and writes', () => {
    const drive = run('drive', x => Math.tanh(6 * x))
    expect(drive.status).toBe(1)
    expect(drive.stdout).toMatch(/tone-5301hz-1db .* FAIL/)
    expect(drive.stdout).toContain('check(s) failed')
    const gain = run('gain', x => 0.5 * x)
    expect(gain.stdout + gain.stderr).not.toContain('FAIL')
    expect(gain.status).toBe(0)
  })

  it('writes each signal twice, as the raw words dsp_host reads and as a WAV rig_render reads, with the same samples', () => {
    const plan = join(scratch, 'twice-plan')
    audit('plan', plan)
    const bytes = readFileSync(join(plan, 'tone-5301hz-1db.raw')), words = new Int32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2)
    expect(words.length % 240).toBe(0)                  // whole blocks of 15 and of 16 frames
    expect(words).toEqual(toneSamples(toneBin(5300), -1))
    const [wav] = readAudio(join(plan, 'tone-5301hz-1db.wav'), { channels: 1 })
    words.forEach((word, n) => expect(wav[n]).toBeCloseTo(word / 8388608, 7))
    expect(wavFile(Int32Array.of(8388607, -8388608)).length).toBe(44 + 6)
  })

  it('uses the recorded longer settling interval without changing alias limits or FFT geometry', () => {
    const planDir = join(scratch, 'long-warmup-plan'), outDir = join(scratch, 'long-warmup-out')
    expect(audit('plan', planDir, '--warmup', '2').status).toBe(0)
    const plan = JSON.parse(readFileSync(join(planDir, 'plan.json'), 'utf8'))
    expect(plan.warmup).toBe(2 * SAMPLE_RATE)
    expect(plan.fftSize).toBe(FFT_SIZE)
    spawnSync('mkdir', ['-p', outDir])
    render(planDir, outDir, (x, n) => n < WARMUP + FFT_SIZE ? Math.tanh(6 * x) : 0.5 * x)
    const tone = plan.tones.find(tone => tone.file === 'tone-5301hz-1db')
    const [audio] = readAudio(join(outDir, tone.file + '.raw'))
    expect(analyzeTone(audio, tone).aliasDbc).toBeGreaterThan(LIMITS.alias)
    expect(analyzeTone(audio, tone, plan.warmup).aliasDbc).toBeLessThan(-100)
    const checked = audit('check', planDir, outDir)
    expect(checked.status).toBe(0)
    expect(checked.stdout).not.toContain('FAIL')
    expect(audit('plan', join(scratch, 'negative-warmup'), '--warmup', '-1').status).toBe(2)
  })

  it('refuses a check with renders missing, and says which', () => {
    const plan = join(scratch, 'empty-plan'), out = join(scratch, 'empty-out')
    audit('plan', plan)
    spawnSync('mkdir', ['-p', out])
    const result = audit('check', plan, out)
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('tone-1100hz-12db')
  })

  it('reads 16, 24 and 32-bit PCM and float WAV renders and rejects another sample rate', () => {
    const wav = (name, { tag, bits, rate = SAMPLE_RATE, samples }) => {
      const bytesPer = bits / 8, data = Buffer.alloc(samples.length * bytesPer), header = Buffer.alloc(44)
      samples.forEach((x, n) => {
        if (tag === 3) data.writeFloatLE(x, n * 4)
        else if (bits === 16) data.writeInt16LE(Math.round(x * 32767), n * 2)
        else if (bits === 24) data.writeIntLE(Math.round(x * 8388607), n * 3, 3)
        else data.writeInt32LE(Math.round(x * 2147483647), n * 4)
      })
      header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8)
      header.writeUInt32LE(16, 16); header.writeUInt16LE(tag, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24)
      header.writeUInt32LE(rate * bytesPer, 28); header.writeUInt16LE(bytesPer, 32); header.writeUInt16LE(bits, 34)
      header.write('data', 36); header.writeUInt32LE(data.length, 40)
      const path = join(scratch, name + '.wav')
      writeFileSync(path, Buffer.concat([header, data]))
      return path
    }
    const samples = [0, 0.5, -0.5, 0.25]
    for (const [tag, bits] of [[1, 16], [1, 24], [1, 32], [3, 32]]) {
      const [channel] = readAudio(wav('t' + tag + bits, { tag, bits, samples }), { channels: 1 })
      samples.forEach((x, n) => expect(channel[n]).toBeCloseTo(x, 3))
    }
    expect(() => readAudio(wav('rate', { tag: 1, bits: 16, rate: 48000, samples }))).toThrow('48000 Hz')
  })
})
