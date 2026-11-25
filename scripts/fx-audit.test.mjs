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

function rawCapture(name, samples) {
  const path = join(scratch, name + '.raw')
  const bytes = Buffer.alloc(samples.length * 4)
  samples.forEach((word, i) => bytes.writeInt32LE(word, i * 4))
  writeFileSync(path, bytes)
  return path
}

// What dsp_host does: mono raw in, the effect applied to each sample, interleaved L R int32 words out. `right` is the R side's effect.
function render(planDir, outDir, effect, right = effect) {
  for (const name of readdirSync(planDir).filter(file => file.endsWith('.raw'))) {
    const bytes = readFileSync(join(planDir, name)), input = new Int32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2)
    const out = new Int32Array(input.length * 2)
    const word24 = (fn, word) => Math.round(Math.max(-1, Math.min(1, fn(word / FULL_SCALE))) * FULL_SCALE)
    input.forEach((word, n) => { out[2 * n] = word24(effect, word); out[2 * n + 1] = word24(right, word) })
    writeFileSync(join(outDir, name), Buffer.from(out.buffer))
  }
}
const run = (name, effect, right) => {
  const plan = join(scratch, name + '-plan'), out = join(scratch, name + '-out')
  expect(audit('plan', plan).status).toBe(0)
  rmSync(out, { recursive: true, force: true })
  spawnSync('mkdir', ['-p', out])
  render(plan, out, effect, right)
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
    expect(gain.stdout).not.toContain('mono:')
    expect(gain.status).toBe(0)
  })

  it('notes a stereo render whose sides cancel in mono, without failing it', () => {
    const flipped = run('flipped', x => 0.5 * x, x => -0.5 * x)
    expect(flipped.stdout).toMatch(/tone-5301hz-1db +.* note/)
    expect(flipped.stdout).toContain('tone-5301hz-1db mono: the sides cancel completely summed to mono')
    expect(flipped.status).toBe(0)
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

  it('refuses a check with renders missing, and says which', () => {
    const plan = join(scratch, 'empty-plan'), out = join(scratch, 'empty-out')
    audit('plan', plan)
    spawnSync('mkdir', ['-p', out])
    const result = audit('check', plan, out)
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('tone-1100hz-12db')
  })

  it('compares renders of the noise signal: a dead knob is identical, a live one differs, silence proves nothing', () => {
    const plan = join(scratch, 'compare-plan')
    audit('plan', plan)
    const renderNoise = (name, effect) => {
      const bytes = readFileSync(join(plan, 'noise.raw')), input = new Int32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2)
      let state = 0
      writeFileSync(join(scratch, name + '.raw'), Buffer.from(Int32Array.from(input, word => Math.round(effect(word, state = 0.1 * word + 0.9 * state))).buffer))
      return join(scratch, name + '.raw')
    }
    const low = renderNoise('knob-low', word => word / 2), high = renderNoise('knob-high', word => word / 2), cutoff = renderNoise('cutoff', (_, lowpass) => lowpass)
    const result = audit('compare', low, high, cutoff, '--mono')
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/knob-low\.raw +knob-high\.raw .* identical/)
    expect(result.stdout).toMatch(/knob-high\.raw +cutoff\.raw .* differs/)
    const quieter = renderNoise('quieter', word => word / 4)
    expect(audit('compare', low, quieter, '--mono').stdout).toMatch(/knob-low\.raw +quieter\.raw .* -6\.02 dB .* differs/)
    const silent = renderNoise('silent', () => 0)
    expect(audit('compare', silent, silent, '--mono').stdout).toContain('1 silent pair(s)')
    expect(audit('compare', low, join(scratch, 'none.raw')).status).toBe(2)
  })

  it('explains a 32-frame shift in either direction and judges the original samples', () => {
    const burst = Array(160).fill(0)
    burst.splice(40, 3, 100000, -80000, 30000)
    const early = rawCapture('early', burst)
    const late = rawCapture('late', [...Array(32).fill(0), ...burst.slice(0, -32)])
    const compare = (...args) => audit('compare', early, late, '--mono', ...args)
    expect(compare().stdout).not.toContain('Shift:')
    const info = compare('--explain', '--block-frames', '16')
    expect(info.status).toBe(0)
    expect(info.stdout).toContain('Compared frames [0, 160) at 44100 Hz')
    expect(info.stdout).toContain('first differs at frame 40 (block 2, frame 8)')
    expect(info.stdout).toContain('Shift: +32 frames')
    expect(compare('--expect-identical').status).toBe(1)
    expect(audit('compare', late, early, '--mono', '--explain').stdout).toContain('Shift: -32 frames')
    expect(audit('compare', early, early, '--mono', '--expect-identical').status).toBe(0)
  })

  it('distinguishes a level change and a one-word stereo mismatch from an exact match', () => {
    const a = Array(128).fill(100000), b = a.slice()
    b[2 * 23 + 1]++
    const reference = rawCapture('reference', a), changed = rawCapture('changed', b)
    const result = audit('compare', reference, changed, changed, '--expect-identical', '--block-frames', '16')
    expect(result.status).toBe(1)
    expect(result.stdout).toMatch(/reference\.raw +changed\.raw .* same/)
    expect(result.stdout).toContain('Channel 1 matches in the window')
    expect(result.stdout).toContain('Channel 2 first differs at frame 23 (block 1, frame 7)')
    const half = rawCapture('half', a.map(word => word / 2))
    const gain = audit('compare', reference, half, '--explain')
    expect(gain.stdout).toMatch(/-6\.02 dB .* differs/)
    expect(gain.stdout).toContain('no exact shift')
    expect(audit('compare', reference, half, '--expect-identical', '--same-limit', '0').status).toBe(1)
  })

  it('reports indeterminate offsets for silence and repeating signals', () => {
    const silence = rawCapture('zero', Array(160).fill(0))
    const unproven = audit('compare', silence, silence, '--expect-identical')
    expect(unproven.status).toBe(1)
    expect(unproven.stdout).toContain('indeterminate (silent window)')
    const wave = Array.from({ length: 160 }, (_, i) => [200000, 0, -200000, 0][i % 4])
    const tone = rawCapture('wave', wave), rotated = rawCapture('rotated', [...wave.slice(1), wave[0]])
    const periodic = audit('compare', tone, rotated, '--mono', '--expect-identical')
    expect(periodic.status).toBe(1)
    expect(periodic.stdout).toContain('indeterminate (multiple matching shifts)')
  })

  it('rejects missing frames and channels even when the common samples match', () => {
    const full = rawCapture('full', Array(128).fill(-FULL_SCALE)), short = rawCapture('short', Array(126).fill(-FULL_SCALE))
    const tail = audit('compare', full, short, '--expect-identical')
    expect(tail.status).toBe(1)
    expect(tail.stdout).toContain('shape mismatch  (lengths 64 and 63')
    expect(tail.stdout).toContain('Compared frames [0, 63)')
    expect(tail.stdout).toContain('Channel 2 matches in the window')
    const mono = join(scratch, 'mono.wav')
    writeFileSync(mono, wavFile(Int32Array.from({ length: 64 }, () => -8388608)))
    const channels = audit('compare', mono, full, '--expect-identical')
    expect(channels.status).toBe(1)
    expect(channels.stdout).toContain('shape mismatch')
    expect(channels.stdout).toContain('channel counts 1 and 2')
    expect(channels.stdout).toContain('Channel 1 matches in the window')
    const partial = rawCapture('incomplete-stereo', Array(127).fill(200000))
    expect(audit('compare', full, partial, '--expect-identical').status).toBe(2)
    expect(audit('compare', full, short, '--block-frames', '0').status).toBe(2)
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
    const invalid = wav('nan', { tag: 3, bits: 32, samples: [0.5, NaN] })
    expect(audit('compare', invalid, invalid, '--expect-identical').status).toBe(2)
    const empty = wav('empty', { tag: 1, bits: 24, samples: [] })
    expect(audit('compare', empty, empty, '--expect-identical').stdout).toContain('indeterminate (silent window)')
    const truncated = wav('truncated', { tag: 1, bits: 24, samples })
    writeFileSync(truncated, readFileSync(truncated).subarray(0, -3))
    expect(audit('compare', truncated, truncated, '--expect-identical').stderr).toContain('truncated WAV data')
  })
})
