// Offline sound-quality checks for an effect: aliasing, DC, clipping and what it does after the input stops.
// No firmware and no module code runs here. The test signals are written by `plan`, you render them through your effect with the
// harness you already use, and `check` reads the renders back. See docs/module-guides/effects.md, "Sound quality".
import { readFileSync } from 'node:fs'

export const SAMPLE_RATE = 44100
export const FULL_SCALE = 8388607            // the harness's 24-bit words: dsp_host reads and writes int32 holding +-8388607
export const FFT_SIZE = 32768
export const WARMUP = 16384                  // samples of the tone before the analysed window, so a compressor or filter settles
export const TONES_HZ = [1100, 2700, 5300, 9100]
export const LEVELS_DBFS = [-12, -1]
export const LIMITS = { alias: -60, dc: -60, idle: -90 }   // audit defaults (dBc, dBFS, dBFS), not repository rules; the CLI can override each
const LOBE = 4                               // half-width of a 4-term Blackman-Harris main lobe, in bins
const MAX_HARMONIC = 128
const RAIL = 0.9999                          // verify_knob_clicks.py's "a sample on the store's limit"
const BLOCK_MULTIPLE = 240                   // dsp_host renders whole blocks of 15 or 16 frames; 240 is a whole number of both
const wholeBlocks = length => Math.ceil(length / BLOCK_MULTIPLE) * BLOCK_MULTIPLE

const db = value => 10 * Math.log10(Math.max(value, 1e-30))
export const dbfs = amplitude => 20 * Math.log10(Math.max(Math.abs(amplitude), 1e-15))

/** In-place radix-2 FFT of a power-of-two length. */
export function fft(re, im) {
  const n = re.length, half = n >> 1
  for (let i = 1, j = 0; i < n; i++) {
    let bit = half
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
  }
  const cos = new Float64Array(half), sin = new Float64Array(half)
  for (let k = 0; k < half; k++) { cos[k] = Math.cos(2 * Math.PI * k / n); sin[k] = -Math.sin(2 * Math.PI * k / n) }
  for (let size = 2; size <= n; size <<= 1) {
    const step = n / size, h = size >> 1
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < h; k++) {
        const a = start + k, b = a + h, t = k * step
        const xr = re[b] * cos[t] - im[b] * sin[t], xi = re[b] * sin[t] + im[b] * cos[t]
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi
      }
    }
  }
}

const WINDOW = Float64Array.from({ length: FFT_SIZE }, (_, n) => {
  const x = 2 * Math.PI * n / FFT_SIZE
  return 0.35875 - 0.48829 * Math.cos(x) + 0.14128 * Math.cos(2 * x) - 0.01168 * Math.cos(3 * x)
})
const WINDOW_ENERGY = WINDOW.reduce((sum, w) => sum + w * w, 0)

/** The bins a sine of `m` whole cycles per FFT frame puts its harmonics in. A harmonic above Nyquist folds back, so it lands in a
 *  bin that no true harmonic uses as long as m is chosen by `toneBin`: that is what separates aliasing from harmonic distortion. */
function harmonicBins(m) {
  const real = [], folded = []
  for (let k = 1; k <= MAX_HARMONIC; k++) {
    const position = (k * m) % FFT_SIZE, bin = Math.min(position, FFT_SIZE - position)
    ;(k * m < FFT_SIZE / 2 ? real : folded).push(bin)
  }
  return { real, folded }
}

/** The whole-cycle frame count nearest `hz` (odd, so it is coprime with the frame) whose folded harmonics keep clear of the true ones. */
export function toneBin(hz) {
  const target = Math.round(hz * FFT_SIZE / SAMPLE_RATE), base = target % 2 ? target : target + 1
  for (let i = 0; i < 400; i++) {
    for (const m of i ? [base + 2 * i, base - 2 * i] : [base]) {
      const { real, folded } = harmonicBins(m)
      if (Math.min(...real) <= 2 * LOBE) continue
      if (folded.every(bin => real.every(other => Math.abs(bin - other) > 2 * LOBE) && bin > 2 * LOBE)) return m
    }
  }
  throw new Error('No alias-free tone frame found near ' + hz + ' Hz')
}

export const toneHz = m => m * SAMPLE_RATE / FFT_SIZE
const lobe = bin => Array.from({ length: 2 * LOBE + 1 }, (_, i) => bin - LOBE + i).filter(b => b >= 0 && b <= FFT_SIZE / 2)

/** The tone's samples as the harness wants them: a continuous sine of `m` cycles per frame, WARMUP + FFT_SIZE long and padded
 *  with more of the same sine to a whole number of blocks. */
export function toneSamples(m, levelDbfs, warmup = WARMUP) {
  const amplitude = 10 ** (levelDbfs / 20) * FULL_SCALE
  return Int32Array.from({ length: wholeBlocks(warmup + FFT_SIZE) }, (_, n) => Math.round(amplitude * Math.sin(2 * Math.PI * m * n / FFT_SIZE)))
}

export const IDLE_BURST_HZ = 440, IDLE_BURST_DBFS = -6, IDLE_BURST_SECONDS = 0.25, IDLE_WINDOW_SECONDS = 0.5

/** A burst of tone, then silence: what the effect does once the input stops. */
export function idleSamples(tailSeconds) {
  const burst = Math.round(IDLE_BURST_SECONDS * SAMPLE_RATE), total = wholeBlocks(burst + Math.round(tailSeconds * SAMPLE_RATE))
  const amplitude = 10 ** (IDLE_BURST_DBFS / 20) * FULL_SCALE
  return Int32Array.from({ length: total }, (_, n) => n < burst ? Math.round(amplitude * Math.sin(2 * Math.PI * IDLE_BURST_HZ * n / SAMPLE_RATE)) : 0)
}

/** The signals `plan` writes, and what `check` needs to read each render back. */
export function buildPlan(tailSeconds = 3, warmupSeconds = WARMUP / SAMPLE_RATE) {
  if (!Number.isFinite(warmupSeconds) || warmupSeconds < 0) throw new Error('Tone warmup must be a nonnegative number of seconds')
  const warmup = Math.round(warmupSeconds * SAMPLE_RATE)
  const tones = []
  for (const hz of TONES_HZ) {
    const m = toneBin(hz)
    for (const level of LEVELS_DBFS) tones.push({ file: 'tone-' + Math.round(toneHz(m)) + 'hz' + level + 'db', m, hz: toneHz(m), levelDbfs: level })
  }
  const idle = { file: 'idle', tailSeconds, samples: idleSamples(tailSeconds).length }
  return { sampleRate: SAMPLE_RATE, fftSize: FFT_SIZE, warmup, tones, idle }
}

/** One channel of a tone render, normalised to +-1: the spectrum split into the fundamental, true harmonics, folded harmonics
 *  (aliasing) and everything else, plus DC and the samples on the store's limit. All levels are dBc to the fundamental unless noted. */
export function analyzeTone(channel, tone, warmup = WARMUP) {
  if (!Number.isSafeInteger(warmup) || warmup < 0) throw new Error('Tone warmup must be a nonnegative sample count')
  if (channel.length < warmup + FFT_SIZE) throw new Error('A tone render needs ' + (warmup + FFT_SIZE) + ' samples, got ' + channel.length)
  const frame = channel.subarray(warmup, warmup + FFT_SIZE)
  const re = new Float64Array(FFT_SIZE), im = new Float64Array(FFT_SIZE)
  let sum = 0, rails = 0, peak = 0
  for (let n = 0; n < FFT_SIZE; n++) {
    const x = frame[n]
    sum += x
    peak = Math.max(peak, Math.abs(x))
    if (Math.abs(x) >= RAIL) rails++
    re[n] = x * WINDOW[n]
  }
  fft(re, im)
  const power = new Float64Array(FFT_SIZE / 2 + 1)
  for (let k = 0; k < power.length; k++) power[k] = re[k] * re[k] + im[k] * im[k]

  const { real, folded } = harmonicBins(tone.m)
  const taken = new Set(lobe(0)), fundamental = lobe(real[0]), trueSet = new Set(), aliasSet = new Set()
  fundamental.forEach(b => taken.add(b))
  for (const bin of real.slice(1)) for (const b of lobe(bin)) { trueSet.add(b); taken.add(b) }
  for (const bin of folded) for (const b of lobe(bin)) if (!taken.has(b)) aliasSet.add(b)
  const rest = []
  for (let k = 0; k < power.length; k++) if (!taken.has(k) && !aliasSet.has(k)) rest.push(power[k])
  // A periodogram bin of noise is exponential, so its mean is the median over ln 2. Subtracting that stops the noise floor of the
  // folded-harmonic bins from reading as aliasing.
  const sorted = Float64Array.from(rest).sort(), floor = sorted[sorted.length >> 1] / Math.LN2
  const total = bins => { let s = 0; for (const b of bins) s += power[b]; return s }
  const fundamentalPower = total(fundamental)
  const aliasPower = Math.max(total(aliasSet) - floor * aliasSet.size, 0)
  return {
    levelDbfs: dbfs(2 * Math.sqrt(fundamentalPower / (FFT_SIZE * WINDOW_ENERGY))),
    harmonicsDbc: db(total(trueSet) / fundamentalPower),
    aliasDbc: db(aliasPower / fundamentalPower),
    residualDbc: db(rest.reduce((s, p) => s + p, 0) / fundamentalPower),   // noise, modulation sidebands and folds beyond harmonic MAX_HARMONIC
    dcDbfs: dbfs(sum / FFT_SIZE),
    peakDbfs: dbfs(peak),
    rails,
  }
}

/** One channel of the idle render: the last IDLE_WINDOW_SECONDS, after the burst and the tail the plan allowed. */
export function analyzeIdle(channel) {
  const window = channel.subarray(Math.max(channel.length - Math.round(IDLE_WINDOW_SECONDS * SAMPLE_RATE), Math.round(IDLE_BURST_SECONDS * SAMPLE_RATE)))
  let peak = 0, sum = 0
  const values = new Set()
  for (const x of window) {
    peak = Math.max(peak, Math.abs(x)); sum += x
    const word = Math.round(x * FULL_SCALE)
    if (word) values.add(word)
  }
  return { peakDbfs: peak ? dbfs(peak) : -Infinity, dcDbfs: sum ? dbfs(sum / window.length) : -Infinity, distinctValues: values.size, silent: peak === 0 }
}

/** Verdicts for one tone render, worst channel first. `fail` blocks, `note` is for the TESTING.md. */
export function judgeTone(result, limits = LIMITS) {
  const lines = []
  lines.push({ name: 'aliasing', state: result.aliasDbc > limits.alias ? 'fail' : 'ok', detail: result.aliasDbc.toFixed(1) + ' dBc (limit ' + limits.alias + ')' })
  lines.push({ name: 'DC', state: result.dcDbfs > limits.dc ? 'fail' : 'ok', detail: result.dcDbfs.toFixed(1) + ' dBFS (limit ' + limits.dc + ')' })
  if (result.rails) lines.push({ name: 'clipping', state: 'note', detail: result.rails + ' samples on the store limit: confirm this is the effect limiting, not a wrap' })
  return lines
}

export function judgeIdle(result, limits = LIMITS) {
  if (result.silent) return { state: 'ok', detail: 'digital silence' }
  if (result.peakDbfs > limits.idle) return { state: 'fail', detail: 'still ' + result.peakDbfs.toFixed(1) + ' dBFS after the tail (limit ' + limits.idle + '): not settled, a runaway or a limit cycle; render a longer tail if the effect legitimately rings' }
  if (result.distinctValues <= 4) return { state: 'note', detail: 'idle activity of ' + result.distinctValues + ' LSB value(s), peak ' + result.peakDbfs.toFixed(1) + ' dBFS: a limit cycle or truncation bias in a feedback loop' }
  return { state: 'note', detail: 'low-level tail ' + result.peakDbfs.toFixed(1) + ' dBFS, still decaying or noisy' }
}

// ---- writing and reading files -------------------------------------------------

/** The same words as a 24-bit PCM mono WAV at 44.1 kHz: what rig_render.py's --stem reads. */
export function wavFile(samples) {
  const data = Buffer.alloc(samples.length * 3), header = Buffer.alloc(44)
  samples.forEach((word, n) => data.writeIntLE(word, n * 3, 3))
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 3, 28); header.writeUInt16LE(3, 32); header.writeUInt16LE(24, 34)
  header.write('data', 36); header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}


/** A render as one Float64Array of +-1 per channel. Raw is what dsp_host writes: little-endian int32 words holding 24-bit values,
 *  interleaved L R (`channels: 1` for a mono file). WAV: 16/24/32-bit PCM or 32-bit float at 44.1 kHz. */
export function readAudio(path, { channels = 2 } = {}) {
  const bytes = readFileSync(path), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (!/\.wav$/i.test(path)) {
    const words = bytes.byteLength >> 2, frames = Math.floor(words / channels)
    return Array.from({ length: channels }, (_, c) => Float64Array.from({ length: frames }, (_, n) => ((view.getInt32(4 * (n * channels + c), true) << 8) >> 8) / FULL_SCALE))
  }
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw new Error(path + ' is not a WAV file')
  let format = null, data = null
  for (let at = 12; at + 8 <= bytes.byteLength;) {
    const id = bytes.toString('ascii', at, at + 4), size = view.getUint32(at + 4, true)
    if (id === 'fmt ') format = { tag: view.getUint16(at + 8, true), channels: view.getUint16(at + 10, true), rate: view.getUint32(at + 12, true), bits: view.getUint16(at + 22, true), extensible: view.getUint16(at + 8 + 24, true) }
    if (id === 'data') data = { start: at + 8, size: Math.min(size, bytes.byteLength - at - 8) }
    at += 8 + size + (size & 1)
  }
  if (!format || !data) throw new Error(path + ' has no fmt or data chunk')
  const tag = format.tag === 0xfffe ? format.extensible : format.tag, bytesPer = format.bits >> 3
  if (format.rate !== SAMPLE_RATE) throw new Error(path + ' is ' + format.rate + ' Hz; the plan is for ' + SAMPLE_RATE + ' Hz')
  if (!(tag === 1 && [2, 3, 4].includes(bytesPer)) && !(tag === 3 && bytesPer === 4)) throw new Error(path + ': only 16/24/32-bit PCM and 32-bit float WAV are read')
  const frames = Math.floor(data.size / (bytesPer * format.channels))
  const sample = at => tag === 3 ? view.getFloat32(at, true)
    : bytesPer === 2 ? view.getInt16(at, true) / 32768
      : bytesPer === 3 ? (((view.getUint8(at) | view.getUint8(at + 1) << 8 | view.getUint8(at + 2) << 16) << 8) >> 8) / 8388608
        : view.getInt32(at, true) / 2147483648
  return Array.from({ length: format.channels }, (_, c) => Float64Array.from({ length: frames }, (_, n) => sample(data.start + (n * format.channels + c) * bytesPer)))
}

// ---- proving the instrument ------------------------------------------------------

/** `shape` applied at `factor` times the sample rate and low-passed before the decimation: the aliasing-free reference for a nonlinearity. */
function oversampled(tone, levelDbfs, gain, shape, factor = 8) {
  const taps = 881, half = (taps - 1) / 2, cutoff = 0.45 / factor, length = WARMUP + FFT_SIZE
  const kernel = Float64Array.from({ length: taps }, (_, i) => {
    const j = i - half, x = 2 * Math.PI * i / (taps - 1)
    return (j ? Math.sin(2 * Math.PI * cutoff * j) / (Math.PI * j) : 2 * cutoff) * (0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x))
  })
  const unity = kernel.reduce((s, v) => s + v, 0), amplitude = 10 ** (levelDbfs / 20)
  const high = Float64Array.from({ length: length * factor + taps }, (_, i) => shape(gain * amplitude * Math.sin(2 * Math.PI * tone.m * (i - half) / (FFT_SIZE * factor))))
  return Float64Array.from({ length }, (_, n) => {
    let sum = 0
    for (let i = 0; i < taps; i++) sum += kernel[i] * high[n * factor + i]
    return sum / unity
  })
}

/** Known-good and known-bad effects, run through the same analysis, so a verdict can be trusted. Returns { name, ok, detail } rows. */
export function selfTest() {
  const rows = [], tone = { m: toneBin(5300) }, level = -1
  const input = Float64Array.from(toneSamples(tone.m, level), v => v / FULL_SCALE)
  const row = (name, ok, detail) => rows.push({ name, ok, detail })
  const shaper = x => Math.tanh(x)

  const clean = analyzeTone(input.map(v => v * 0.5), tone)
  row('a linear gain is not aliasing', clean.aliasDbc < -100 && Math.abs(clean.levelDbfs - (level - 6.02)) < 0.1, 'alias ' + clean.aliasDbc.toFixed(1) + ' dBc, level ' + clean.levelDbfs.toFixed(2) + ' dBFS')

  const naive = analyzeTone(input.map(v => shaper(6 * v)), tone)
  row('a tanh drive at the sample rate aliases', naive.aliasDbc > LIMITS.alias + 20 && naive.harmonicsDbc > -30, 'alias ' + naive.aliasDbc.toFixed(1) + ' dBc, harmonics ' + naive.harmonicsDbc.toFixed(1) + ' dBc')

  const clean8x = analyzeTone(oversampled(tone, level, 6, shaper), tone)
  row('the same drive, 8x oversampled, is within the limit', clean8x.aliasDbc < LIMITS.alias && clean8x.harmonicsDbc > -30, 'alias ' + clean8x.aliasDbc.toFixed(1) + ' dBc, harmonics ' + clean8x.harmonicsDbc.toFixed(1) + ' dBc')
  row('oversampling lowers the aliasing by at least 30 dB', naive.aliasDbc - clean8x.aliasDbc > 30, (naive.aliasDbc - clean8x.aliasDbc).toFixed(1) + ' dB')

  const offset = analyzeTone(input.map(v => v * 0.5 + 0.01), tone)
  row('a DC offset of -40 dBFS is flagged', judgeTone(offset).some(line => line.name === 'DC' && line.state === 'fail'), 'DC ' + offset.dcDbfs.toFixed(1) + ' dBFS')

  const hot = analyzeTone(input.map(v => Math.max(-1, Math.min(1, v * 3))), tone)
  row('clipping at the store limit is noted', judgeTone(hot).some(line => line.name === 'clipping' && line.state === 'note'), hot.rails + ' samples on the limit')

  const idle = idleSamples(3), burst = Math.round(IDLE_BURST_SECONDS * SAMPLE_RATE)
  const zero = Float64Array.from(idle, (v, n) => n < burst ? v / FULL_SCALE : 0)
  row('an effect that goes silent is ok', judgeIdle(analyzeIdle(zero)).state === 'ok', 'digital silence')
  const lsb = Float64Array.from(zero, (v, n) => n < burst ? v : (n % 2 ? 1 : -1) / FULL_SCALE)
  row('a one-LSB limit cycle is noted', judgeIdle(analyzeIdle(lsb)).state === 'note', 'idle activity of 2 values')
  const ringing = Float64Array.from(zero, (v, n) => n < burst ? v : 0.5 * Math.exp(-(n - burst) / SAMPLE_RATE) * Math.sin(2 * Math.PI * 300 * n / SAMPLE_RATE))
  row('an effect still ringing after the tail fails', judgeIdle(analyzeIdle(ringing)).state === 'fail', analyzeIdle(ringing).peakDbfs.toFixed(1) + ' dBFS')
  return rows
}
