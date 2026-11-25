// SPDX-License-Identifier: MIT
// Analog BD's tables, written as tables.h (generated: never edit it by hand).
//
//   node sdk/octatrack/modules/analog-bassdrum/tools/tables.ts            writes tables.h
//   node sdk/octatrack/modules/analog-bassdrum/tools/tables.ts --check    fails if tables.h differs
//   node sdk/octatrack/modules/analog-bassdrum/tools/tables.ts --json F   also writes the float model's values to F
//
// The 909 is 0.1.7's model, fitted to Skee Mask's TR-909 recordings (fit909.json), with the lead-in those
// recordings show before the body opens (leadin.json). The 808 is 0.1.7's, calibrated to the author's own
// recordings. Everything here is computed from the fitted parameters; nothing is copied from an instrument or a
// recording. The engine (engine.c) runs the same model in integers: the per-block decays as 32-bit fractions of one
// (Q16), samples and gains as the scales named beside each table.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..')
const FIT = JSON.parse(readFileSync(join(HERE, 'fit909.json'), 'utf8'))   // 0.1.7's fit of the 909
const LEAD = JSON.parse(readFileSync(join(HERE, 'leadin.json'), 'utf8'))   // 0.2.0's lead-in
const RATE = 44100
const BLOCK = 16
const OUT = 0.4                       // 0.1.7's output scale
const VLAW = (128 / 100) ** 2         // body level (ACNT/128)^2 * VLAW = (ACNT/100)^2
const VAS = 1.92
const SHIFT = 16
const BODY_BITS = 10                  // 1024 points a cycle, read with linear interpolation (error -105 dB)
const BODY_N = 1 << BODY_BITS
const NOISE_N = 2048
const CLICK_N = 128

const NODES: number[] = FIT.nodes
const B = FIT.body, PU = FIT.pulse, NZ = FIT.noise

const uOf = (i: number) => (i <= 64 ? i / 128 : 0.5 + (i - 64) / 126)
const kExp = (tau: number) => Math.exp(-1 / (tau * RATE))
const kPole = (fc: number) => Math.exp(-2 * Math.PI * fc / RATE)

/** Monotone cubic (Fritsch-Carlson), as 0.1.7's dsp909._pchip. */
function pchip(xs: number[], ys: number[]) {
  const n = xs.length
  const h = xs.slice(1).map((x, k) => x - xs[k])
  const d = h.map((hk, k) => (ys[k + 1] - ys[k]) / hk)
  const m = [d[0], ...new Array(n - 2).fill(0), d[n - 2]]
  for (let k = 1; k < n - 1; ++k)
    if (d[k - 1] * d[k] > 0) {
      const w1 = 2 * h[k] + h[k - 1], w2 = h[k] + 2 * h[k - 1]
      m[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k])
    }
  return (x: number) => {
    let k = 0
    while (k < n - 2 && x > xs[k + 1]) ++k
    const t = (x - xs[k]) / h[k]
    const h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t
    const h01 = -2 * t ** 3 + 3 * t ** 2, h11 = t ** 3 - t ** 2
    return h00 * ys[k] + h10 * h[k] * m[k] + h01 * ys[k + 1] + h11 * h[k] * m[k + 1]
  }
}
const logs = (v: number[]) => v.map(Math.log)
const FB = pchip(NODES, logs(FIT.pitch.fb_hz))
const AP = pchip(NODES, logs(FIT.pitch.A_hz))
const A_REF = FIT.pitch.A_hz[NODES.indexOf(0.5)]
const GT = pchip(NODES, logs(FIT.tune.A_hz.map((a: number) => a / A_REF)))
const TAUP = pchip(NODES, logs(FIT.tune.tau_s))
const GD0 = pchip(NODES, logs(FIT.depth.A_hz.map((a: number) => a / A_REF)))
const PK = FIT.pitch.knob, DK = FIT.decay.knob
const VA = pchip(FIT.velocity.attack_v, FIT.velocity.attack_gain)
const DCLK: number = PU.delay_samples
const KEJIT: number = FIT.pitch.sweep_jitter
const KEBASE = 1 - KEJIT - 2 ** -22

function fbHz(i: number) {
  const [lo, x] = i <= 64 ? [PK.min_hz, i / 64] : [PK.max_hz, (127 - i) / 63]
  return lo * (PK.ref_hz / lo) ** x
}
function aHz(i: number) {
  const target = Math.log(fbHz(i))
  let lo = 0, hi = 1
  for (let k = 0; k < 60; ++k) {
    const mid = (lo + hi) / 2
    if (FB(mid) < target) lo = mid
    else hi = mid
  }
  return Math.exp(AP(lo))
}
function tauDecay(i: number) {
  const r = DK.ref_knob
  const [lo, x] = i <= r ? [DK.min_s, i / r] : [DK.max_s, (127 - i) / (127 - r)]
  return lo * (DK.ref_s / lo) ** x
}
function GD(u: number) {
  if (u >= 0.125) return Math.exp(GD0(u))
  return Math.exp(GD0(0.125)) * (Math.max(u, 1e-9) / 0.125) ** FIT.depth['below_0.125_exponent']
}
function thump(a: number) {
  const t = FIT.thump_vs_A
  const s = (x: number) => t.a + t.b * (1 - Math.exp(-x / t.A0_hz))
  return s(a) / s(t.A_ref_hz)
}
function biquadLp(f0: number, q: number) {
  const w = 2 * Math.PI * f0 / RATE, al = Math.sin(w) / (2 * q), a0 = 1 + al
  const b0 = (1 - Math.cos(w)) / 2 / a0
  return [b0, 2 * b0, b0, -2 * Math.cos(w) / a0, (1 - al) / a0]
}

// The noise: 0.1.7's LCG (24-bit, full period) through its HP and two LPs.
const LCG_M = 1664525, LCG_C = 1013904223 & 0xffffff, SEED = 0x5a5a5b
const lcg = (s: number) => Number((BigInt(s) * BigInt(LCG_M) + BigInt(LCG_C)) & 0xffffffn)
const signed24 = (w: number) => (w & 0x800000 ? w - (1 << 24) : w) / 8388608
function noiseRun(n: number, skip = 0) {
  const anh = kPole(NZ.f_hp), kl1 = 1 - kPole(NZ.f_lp1), kl2 = 1 - kPole(NZ.f_lp2)
  let s = SEED, nh = 0, prev = 0, n1 = 0, n2 = 0
  const out: number[] = []
  for (let i = 0; i < n + skip; ++i) {
    s = lcg(s)
    const w = signed24(s)
    nh = anh * nh + (1 + anh) / 4 * (w - prev)   // half scale, as 0.1.7's chain
    prev = w
    n1 += kl1 * (nh - n1)
    n2 += kl2 * (n1 - n2)
    if (i >= skip) out.push(n2)
  }
  return out
}
const NOISE_RMS = (() => {   // 0.1.7 normalised at full scale; the half-scale chain is folded into KN0/KN1
  const v = noiseRun(290000, 10000).map(x => 2 * x)
  return Math.sqrt(v.reduce((a, x) => a + x * x, 0) / v.length)
})()

// ---- the 909 -------------------------------------------------------------------------------------------------------
const ap = [...Array(128).keys()].map(aHz)
const gt = [...Array(128).keys()].map(i => Math.exp(GT(uOf(i)) + DCLK / (Math.exp(TAUP(uOf(i))) * RATE)))
const gd = [...Array(128).keys()].map(i => GD(uOf(i)))
const apMax = Math.max(...ap) * (1 + 2 ** -20), gtMax = Math.max(...gt) * (1 + 2 ** -20), gdMax = Math.max(...gd) * (1 + 2 ** -20)
const aMax = apMax * gtMax * gdMax
const T_GT = gt.map(g => g / gtMax)
const T_THS = [...Array(128).keys()].map(i => OUT * B.k_dc * thump((i + 0.5) / 128 * aMax) * VLAW)
const T_VA = [...Array(128).keys()].map(i => VA(Math.max(i, 1)) / VAS)
const T_ATP = [...Array(128).keys()].map(i => OUT * (B.k0 + uOf(i)) * VAS / PU.gain_scale)
const p0 = OUT * B.k0 * VAS / PU.gain_scale, p1 = OUT * VAS / PU.gain_scale
const [n0, n1] = [NZ.attack_floor, 1 - NZ.attack_floor].map(w => 2 * OUT * w * NZ.g / NOISE_RMS * VAS / SHIFT)
const KN1 = n1 / p1, KN0 = n0 - KN1 * p0
const KN0X = SHIFT * KN0, KN1Q = SHIFT * KN1 / 4
const tfbHz = FIT.tune.base_delta_hz as number
const C909 = {
  K_BODY: 4 * OUT * B.G * VLAW,
  KA: 1 - kExp(B.tau_a), DKDROOP: 1 - kExp(B.tau_droop), KTH: 1 - kExp(B.tau_dc),
  KPR: kExp(PU.tau_decay), KPBASE: PU.jitter_base, KPJIT: PU.jitter_depth,
  KGS: PU.fast_gain * OUT * VAS / PU.gain_scale, KFDR: PU.fast_depth / 4,
  AHP: kPole(PU.f_hp), BHP: (1 + kPole(PU.f_hp)) / 2, KU: 1 - kPole(PU.f_u),
  KW16: PU.k_w / 128, KU16: PU.k_u / 128,
  K2B: kExp(NZ.t2) ** 16, K3B: (kExp(NZ.t2) * kExp(NZ.t1)) ** 16,
  KL0: B.shape_scale.L0 / 2, KLE: -B.shape_scale.LE / 2, KLM: B.shape_scale.LM / 2, KKF: B.shape_scale.KF / 2,
  U0: B.phase_reset as number,
  NHOLD: Math.round(B.t_h * RATE),
}

/** The click's filters as a table, and their two slow modes as gains (0.1.7's dsp909.click_table). */
function clickTable() {
  const [b0, b1, b2, a1, a2] = biquadLp(PU.f0, PU.q)
  const c = C909
  const response = (k: number, nAll = 3200) => {
    let e = 1, lpu = 0, hp = 0, upp = 0, bx1 = 0, bx2 = 0, by1 = 0, by2 = 0
    const out: number[] = []
    for (let i = 0; i < nAll; ++i) {
      const up = e
      e *= k
      lpu += c.KU * (up - lpu)
      hp = c.AHP * hp + c.BHP * (up - upp)
      upp = up
      const w = b0 * hp + b1 * bx1 + b2 * bx2 - a1 * by1 - a2 * by2
      bx2 = bx1, bx1 = hp, by2 = by1, by1 = w
      out.push(c.KW16 * w + c.KU16 * lpu)
    }
    return out
  }
  const h1 = response(c.KPR), h2 = response(kExp(PU.fast_tau))
  const nEnd = 3000, at = 220
  const ka1 = h1[nEnd] / c.KPR ** nEnd
  const kb1 = (h1[at] - ka1 * c.KPR ** at) / c.AHP ** at
  const kb2 = h2[at] / c.AHP ** at
  // 0.2.0: the HP's own mode stays in the rows while they play (the engine ramps its tails once a block, too coarse
  // for a mode that falls 30 % a block); only the slow discharge's tail is left out from the start.
  const rows = [...Array(CLICK_N).keys()].map(n => [h1[n] - ka1 * c.KPR ** n, h2[n]])
  return { rows, ka1, kb1, kb2 }
}

/** One cycle of the body, u = -1 + 2k/N: the polynomial wave with H1..H40 replaced by the recorded cycle's
 * (0.1.7's dsp909.body_table; at 1024 points linear interpolation's droop is under 0.002 dB at H40, so no pre-emphasis). Returns
 * S/4 and its fundamental alone. */
function bodyTables(n: number, top = 63) {
  const m = 2048, cyc = B.cycle
  const wave = (u: number) => {
    const x = 1 - 2 * Math.abs(u)
    let even = 0, odd = 0
    ;[B.c0, ...B.c].forEach((cf: number, k: number) => (even += cf * x ** k))
    B.quadrature.forEach((cf: number, k: number) => (odd += cf * x ** k))
    return even + u * (1 + x) * odd
  }
  const us = [...Array(m).keys()].map(j => 2 * j / m - 1)
  const ys = us.map(wave)
  const harm: [number, number][] = [[ys.reduce((a, y) => a + y, 0) / m, 0]]
  for (let h = 1; h < 64; ++h) {
    let a = 0, b = 0
    for (let j = 0; j < m; ++j) a += ys[j] * Math.cos(h * Math.PI * us[j]), b += ys[j] * Math.sin(h * Math.PI * us[j])
    harm.push([2 / m * a, 2 / m * b])
  }
  const fund = harm[1][0]
  cyc.sym.forEach((sym: number, h: number) => (harm[h + 1] = [fund * sym, fund * cyc.asym[h]]))
  const full: number[] = [], f1: number[] = []
  for (let k = 0; k < n; ++k) {
    const ph = Math.PI * (2 * k / n - 1)
    let v = harm[0][0]
    for (let h = 1; h < harm.length && h <= top; ++h) v += harm[h][0] * Math.cos(h * ph) + harm[h][1] * Math.sin(h * ph)
    full.push(v / 4), f1.push((harm[1][0] * Math.cos(ph) + harm[1][1] * Math.sin(ph)) / 4)
  }
  return { ctd: full.map((v, k) => v - f1[k]), cf: f1 }
}

// ---- the 808 (0.1.7's dsp808.tables) ---------------------------------------------------------------------------------
const interp5 = (i: number, v: number[]) => {
  const x = i / 127 * 5, j = Math.min(4, Math.floor(x))
  return v[j] + (v[j + 1] - v[j]) * (x - j)
}
const tau808 = [...Array(128).keys()].map(i => interp5(i, [0.0164, 0.0409, 0.0979, 0.1617, 0.2622, 0.3401]))
const pt808 = [...Array(128).keys()].map(i => interp5(i, [0.03, 0.0357, 0.0656, 0.1087, 0.204, 0.3109]))
const C808 = {
  PK: 2 * Math.sin(Math.PI * 129.10747 / RATE), PD: -Math.expm1(-1 / (RATE * 0.00203264)), DD: -Math.expm1(-1 / (RATE * 0.00301295)),
  PC0: 3.27303983 / 4, PS0: -1.57554231 / 4, DC0: -1.0927047 / 4, U0: (-1.3892912 - Math.PI / 2) / Math.PI,
  TRIM: 0.215 * 4, KVJ: 0.04,
}
/** The 808's body over one cycle: the sine (0.1.7's degree-9 polynomial) plus its second-harmonic term. */
function body808(n: number) {
  const cs = [Math.PI / 4, -((Math.PI / 2) ** 3) / 12, (Math.PI / 2) ** 5 / 240, -((Math.PI / 2) ** 7) / 10080, (Math.PI / 2) ** 9 / 725760]
  return [...Array(n).keys()].map(k => {
    const u = 2 * k / n - 1, x = Math.min(1 - 2 ** -23, 1 - 2 * Math.abs(u)), xx = x * x
    let h = cs[4]
    for (let j = 3; j >= 0; --j) h = cs[j] + h * xx
    const sn = h * x
    return sn + 0.03076 - 0.246062 * sn * sn
  })
}
/** The 808's trigger transient, 2 (pc + dc), the damped resonator and the DC step (unscaled by ATK). */
function transient808(n: number) {
  let pc = C808.PC0, ps = C808.PS0, dc = C808.DC0
  const out: number[] = []
  for (let i = 0; i < n; ++i) {
    const c = pc - C808.PK * ps, s = ps + C808.PK * c
    ps = s - C808.PD * s, pc = c - C808.PD * c, dc -= C808.DD * dc
    out.push(2 * (pc + dc))
  }
  return out
}

// ---- integers ------------------------------------------------------------------------------------------------------
const q = (x: number, bits: number) => {
  const v = Math.round(x * 2 ** bits)
  if (v > 2 ** 31 - 1 || v < -(2 ** 31)) throw new Error(`${x} overflows Q${bits}`)
  return v
}
const q16 = (x: number, bits = 15) => {
  const v = Math.round(x * 2 ** bits)
  if (v > 32768 || v < -32768) throw new Error(`${x} overflows a Q${bits} halfword`)
  return Math.min(v, 32767)          // a fraction of one rounds to its largest halfword
}
const u16 = (x: number) => {        // a fraction of one, Q16
  if (!(x >= 0 && x < 1)) throw new Error(`${x} is not a fraction`)
  return Math.min(0xffff, Math.round(x * 2 ** 16))
}
const turns = (hz: number) => Math.round(hz / RATE * 2 ** 32)
const peak = (v: number[]) => v.reduce((a, x) => Math.max(a, Math.abs(x)), 0)
/** The largest power of two that keeps v's peak under 1. */
const scaleFor = (v: number[]) => 2 ** Math.floor(-Math.log2(peak(v)) - 1e-9)

const body = bodyTables(BODY_N)
// The sweep can start above 1 kHz (TDEP and PTCH high): the body's upper harmonics then fold back under 22 kHz. Two
// copies keep only the harmonics that stay above 18 kHz when they fold (k f under 26 kHz): H1-H24 and H1-H10. The
// engine picks the copy a block starts in by its increment; the settled pitch (65 Hz at most) always reads the full one.
const LEVELS = [63, 24, 10]
const bodies = LEVELS.map(top => bodyTables(BODY_N, top))
const levelLimit = (top: number) => turns(26000 / top)
const CTD_SCALE = scaleFor(body.ctd), CF_SCALE = scaleFor(body.cf)
// The loudest accent whose body, thump included, stays under full scale at the output's x4 (the engine clamps
// only past it): 4 vb (2 KBODY (max|CTD| lR + max|CF| lF) + max THS) < 1, with lR and lF at their largest.
const bodyPeak = peak(body.ctd) * C909.KL0 + peak(body.cf) * (0.5 + C909.KKF)
const LOUD_VB = 0.98 / (4 * (2 * C909.K_BODY * bodyPeak + Math.max(...T_THS)))
const click = clickTable()
const CLICK_SCALE = scaleFor(click.rows.flat())
const noise = noiseRun(NOISE_N, 64)
const NOISE_SCALE = scaleFor(noise)
const lead: number[] = LEAD.shape
const LEAD_SCALE = scaleFor(lead)
const b808 = body808(BODY_N)
const t808 = transient808(1536)
const T808_SCALE = scaleFor(t808)

const T = {
  incb: [...Array(128).keys()].map(i => turns(fbHz(i))),
  tfb: T_GT.map(g => turns(tfbHz * (g - T_GT[0]) / (T_GT[127] - T_GT[0]))),
  // the excursion at ep = 1, in turns a sample: ap * gt * gd / KEBASE; ap carries gt's and gd's maxima
  apx: ap.map(a => turns(a * gtMax * gdMax / KEBASE)),
  gt: T_GT.map(g => q16(g, 15)),
  gd: gd.map(g => q16(g / gdMax, 15)),
  kp16: [...Array(128).keys()].map(i => u16(kExp(Math.exp(TAUP(uOf(i)))) ** BLOCK)),
  kd16: [...Array(128).keys()].map(i => u16(kExp(tauDecay(i)) ** BLOCK)),
  ths: T_THS.map(v => q16(v, 15)),
  va: T_VA.map(v => q16(v, 15)),
  atp: T_ATP.map(v => q16(v, 15)),
  // the 808
  inc8: [...Array(128).keys()].map(i => turns(48.85 * 2 ** ((i - 64) / 48))),
  de8: tau808.map(t => u16(Math.exp(-BLOCK / (RATE * t)))),
  dp8: pt808.map(t => u16(Math.exp(-BLOCK / (RATE * t)))),
  bend8: [...Array(128).keys()].map(i => turns(interp5(i, [12, 11.44, 8.56, 7.09, 6.094, 5.866]) * 2)),
  gain8: [...Array(128).keys()].map(i => q16(interp5(i, [0.9, 0.812, 0.759, 0.744, 0.741, 0.738]) / 2, 15)),
  tone8: [...Array(128).keys()].map(i => q16(-Math.expm1(-2 * Math.PI * 350 * (2300 / 350) ** (i / 127) / RATE), 15)),
}

function cArray(type: string, name: string, v: number[], per = 12) {
  const rows: string[] = []
  for (let i = 0; i < v.length; i += per) rows.push('    ' + v.slice(i, i + per).join(', ') + ',')
  return `static const ${type} ${name}[${v.length}] = {\n${rows.join('\n')}\n};\n`
}
const u32s = (v: number[]) => v.map(x => `${x >>> 0}u`)

const consts: [string, number | string, string][] = [
  ['AB_BODY_BITS', BODY_BITS, 'body tables: 2^bits points a cycle, then the first again (interpolation)'],
  ['AB9_BODY_STRIDE', BODY_N + 1, 'one band-limited copy of the body to the next (H1-63, H1-24, H1-10)'],
  ['AB9_LEVEL1', `${levelLimit(LEVELS[0])}u`, 'increments (turns) past this read the H1-24 copy'],
  ['AB9_LEVEL2', `${levelLimit(LEVELS[1])}u`, '... past this the H1-10 copy'],
  ['AB_NOISE_N', NOISE_N, 'filtered-noise table length (a power of two)'],
  ['AB_CLICK_N', CLICK_N, "the click table's rows"],
  ['AB_LEAD_N', lead.length, 'lead-in samples before the 909 body opens'],
  ['AB_T808_N', t808.length, "the 808's trigger transient, samples"],
  // the 909's model, fractions of one in Q16 (per block) or Q15
  ['AB9_KA16', `${u16((1 - C909.KA) ** BLOCK)}u`, 'attack rise: (1 - o) per block'],
  ['AB9_DROOP16', `${u16((1 - C909.DKDROOP) ** BLOCK)}u`, 'the hold: m per block'],
  ['AB9_KTH16', `${u16((1 - C909.KTH) ** BLOCK)}u`, 'thump follower: (th - g) per block'],
  ['AB9_KPR16', `${u16(C909.KPR ** BLOCK)}u`, "the click's slow discharge per block"],
  ['AB9_AHP16', `${u16(C909.AHP ** BLOCK)}u`, "the click HP's own mode per block"],
  ['AB9_E2END', `${q(C909.AHP ** CLICK_N, 31)}`, "the HP mode's tail where the click rows end, Q31"],
  ['AB9_K2B', `${u16(C909.K2B)}u`, 'noise envelope, decaying term per block'],
  ['AB9_K3B', `${u16(C909.K3B)}u`, 'noise envelope, rising term per block'],
  ['AB9_QK', `${Math.round(2 ** 32 * 128 * KEBASE / (aMax / RATE * 2 ** 32))}u`, "the excursion (turns) to the thump table's row: mulhi"],
  ['AB9_LOUD', q16(Math.min(LOUD_VB, 0.999)), 'accents (ACNT/128)^2 (Q15) above this may reach full scale'],
  ['AB9_NHOLDB', Math.round(C909.NHOLD / BLOCK), 'blocks of hold before the decay'],
  ['AB9_U0', `${(Math.round((C909.U0 + 1) / 2 * 2 ** 32) >>> 0)}u`, 'the held crest, turns'],
  ['AB9_KEBASE', `${q(KEBASE, 31)}`, 'sweep depth at a hit, Q31'],
  ['AB9_KEJIT', `${q(KEJIT, 31)}`, 'its variation with FIXD OFF, Q31'],
  ['AB9_KPBASE', `${q(C909.KPBASE, 31)}`, 'click strength at a hit, Q31'],
  ['AB9_KPJIT', `${q(C909.KPJIT, 31)}`, 'its variation with FIXD OFF, Q31'],
  ['AB9_LJIT', `${q(LEAD.jitter, 31)}`, 'lead-in level variation with FIXD OFF, Q31'],
  ['AB9_KL0', q16(C909.KL0), 'the body shape: lR/2 = KL0 + KLE ep - KLM m, Q15'],
  ['AB9_KLE', q16(C909.KLE), ''],
  ['AB9_KLM', q16(C909.KLM), ''],
  ['AB9_KKF', q16(C909.KKF), 'H1: 1/2 + KKF ep, Q15'],
  ['AB9_KBODY', q16(C909.K_BODY), 'body gain, Q15'],
  ['AB9_KGS', q16(C909.KGS / 4, 15), "the click's fast discharge gain / 4, Q15"],
  ['AB9_KFDR', q16(C909.KFDR, 15), "its depth, Q15"],
  ['AB9_KA1', q16(click.ka1 * 8, 15), "the slow discharge's share * 8, Q15"],
  ['AB9_KB1', q16(click.kb1, 15), "the HP mode's share of the slow discharge, Q15"],
  ['AB9_KB2', q16(click.kb2, 15), "... of the fast one, Q15"],
  ['AB9_KN0X', q16(KN0X / 2, 15), 'noise gain floor / 2, Q15'],
  ['AB9_KN1Q', q16(KN1Q / 2, 15), 'noise gain by Attack / 2, Q15'],
  ['AB9_LEAD0', q16(LEAD.gain[0] / 2, 15), 'lead-in level at ATK 0 / 2, Q15'],
  ['AB9_LEAD1', q16(LEAD.gain[1] / 2, 15), '... at ATK 127 / 2, Q15'],
  ['AB9_CTD_SHIFT', Math.log2(CTD_SCALE), 'the body tables are stored times 2^shift'],
  ['AB9_CF_SHIFT', Math.log2(CF_SCALE), ''],
  ['AB9_CLICK_SHIFT', Math.log2(CLICK_SCALE), ''],
  ['AB9_NOISE_SHIFT', Math.log2(NOISE_SCALE), ''],
  ['AB9_LEAD_SHIFT', Math.log2(LEAD_SCALE), ''],
  // the 808
  ['AB8_U0', `${(Math.round((C808.U0 + 1) / 2 * 2 ** 32) >>> 0)}u`, "the 808's phase at a hit, turns"],
  ['AB8_TRIM', q16(C808.TRIM, 15), 'output trim, Q15'],
  ['AB8_KVJ', q16(C808.KVJ, 15), 'transient variation with FIXD OFF, Q15'],
  ['AB8_T808_SHIFT', Math.log2(T808_SCALE), ''],
]

const packed = (b: { ctd: number[], cf: number[] }) =>
  [...b.ctd, b.ctd[0]].map((v, k) => ((q16(v * CTD_SCALE) << 16) | (q16(b.cf[k % BODY_N] * CF_SCALE) & 0xffff)) | 0)
const pack = bodies.flatMap(packed)
const header = `/* SPDX-License-Identifier: MIT
 * GENERATED by tools/tables.ts from fit909.json and leadin.json: never edit by hand (npm run check compares them). */
#ifndef AB_TABLES_H
#define AB_TABLES_H
#include <stdint.h>

${consts.map(([n, v, c]) => `#define ${n.padEnd(16)} ${String(v).padEnd(12)}${c ? ` /* ${c} */` : ''}`).join('\n')}

/* 909, by PITCH: settled pitch and the sweep's excursion at ep = 1 (turns a sample, 2^32 a cycle) */
${cArray('uint32_t', 'ab9_incb', u32s(T.incb) as unknown as number[], 8)}${cArray('uint32_t', 'ab9_apx', u32s(T.apx) as unknown as number[], 8)}
/* 909, by TUNE: the settled pitch's small shift (turns), the excursion's scale (Q15), the sweep's decay a block (Q16) */
${cArray('int32_t', 'ab9_tfb', T.tfb)}${cArray('int16_t', 'ab9_gt', T.gt)}${cArray('uint16_t', 'ab9_kp16', T.kp16)}
/* 909: TDEP's excursion scale (Q15), DCAY's decay a block (Q16), thump by sweep size, Attack by accent, pulse by ATK (Q15) */
${cArray('int16_t', 'ab9_gd', T.gd)}${cArray('uint16_t', 'ab9_kd16', T.kd16)}${cArray('int16_t', 'ab9_ths', T.ths)}${cArray('int16_t', 'ab9_va', T.va)}${cArray('int16_t', 'ab9_atp', T.atp)}
/* 909 body: CTD (the cycle above H1) in the high halfword, CF (H1) in the low, each Q15 times 2^shift; three copies,
 * band-limited to H63, H24 and H10, each a cycle and its first point again */
${cArray('int32_t', 'ab9_body', pack, 8)}
/* 909 click: the trigger pulse's response to its slow and its fast discharge, interleaved, Q15 times 2^shift; then
 * 16 silent rows, so a run that starts on the last row ends inside them */
${cArray('int16_t', 'ab9_click', [...click.rows.flat().map(v => q16(v * CLICK_SCALE)), ...new Array(2 * BLOCK).fill(0)])}
/* 909 noise: the LCG through the HP and two LPs, Q15 times 2^shift */
${cArray('int16_t', 'ab9_noise', noise.map(v => q16(v * NOISE_SCALE)))}
/* 909 lead-in: the recordings' rise before the body opens, Q15 times 2^shift */
${cArray('int16_t', 'ab9_lead', lead.map(v => q16(v * LEAD_SCALE)))}
/* 808, by PITCH and DCAY: pitch, its bend (turns), the body's decay and the bend's decay a block (Q16), level (Q15) */
${cArray('uint32_t', 'ab8_inc', u32s(T.inc8) as unknown as number[], 8)}${cArray('uint32_t', 'ab8_bend', u32s(T.bend8) as unknown as number[], 8)}${cArray('uint16_t', 'ab8_de16', T.de8)}${cArray('uint16_t', 'ab8_dp16', T.dp8)}${cArray('int16_t', 'ab8_gain', T.gain8)}
/* 808, by TONE: its one-pole, Q15 */
${cArray('int16_t', 'ab8_tone', T.tone8)}
/* 808 body over one cycle and its trigger transient, Q15 (the transient times 2^shift) */
${cArray('int16_t', 'ab8_body', [...b808, b808[0]].map(v => q16(v * 0.5, 15)))}${cArray('int16_t', 'ab8_t808', t808.map(v => q16(v * T808_SCALE)))}
#endif
`

const args = process.argv.slice(2)
const out = join(HERE, 'tables.h')
if (args[0] === '--check') {
  if (readFileSync(out, 'utf8') !== header) {
    console.error('tables.h is not what tools/tables.ts writes: run it and commit the result')
    process.exit(1)
  }
} else {
  writeFileSync(out, header)
  const j = args.indexOf('--json')
  if (j >= 0)
    writeFileSync(args[j + 1], JSON.stringify({
      KEBASE, KEJIT, aMax, apMax, gtMax, gdMax, NOISE_RMS, KN0, KN1, C909, C808, click, body, noise, lead,
      CTD_SCALE, CF_SCALE, CLICK_SCALE, NOISE_SCALE, LEAD_SCALE, T808_SCALE, T_GT, T_THS, T_VA, T_ATP, ap, gd, b808, t808,
    }))
}
