#!/usr/bin/env python3
"""The 909 voice on the DSP: tables, the assembled engine and its reference.

fit909.json holds the private TR-909 reference candidate. The body, pulse
and short Tune endpoint use Skee Mask's supplied recordings; other controls
and the shared desk retain the approved model. From them this builds:

  tables()        the 128-entry knob tables and fixed coefficients, 24-bit
  source(layout)  bd909.asm with every placeholder filled
  assemble()      dsp_asm, then its listing checked for su/uu multiplies and
                  the max/rnd encodings AGENTS.md warns about
  Voice           a float reference with the engine's exact structure (the
                  tolerance gate compares the DSP against it)

No plugin state, recording or Elektron byte is used or written.
"""
from __future__ import annotations

import functools
import json
import math
import pathlib
import re
import subprocess
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
FIT = json.loads((HERE / 'fit909.json').read_text())
RATE = 44100
OUT = 0.4                     # output scale: Drumazon's init peak 0.98 -> 0.39
OUTPUT_GAIN = 4                # +12.04 dB after the desk, before stock AMP
VLAW = (128 / 100) ** 2        # body level (ACCNT/100)^2 = (ACCNT/128)^2 * VLAW
VAS = 1.92                    # T_VA = va/VAS
SHIFT = 16                    # the attack path's final x16 (four asl)
NODES = FIT['nodes']
B = FIT['body']
PU = FIT['pulse']
NZ = FIT['noise']
MK = FIT['mackie']

# The voice block: X words at r5+k. The loop walks its words in the order of
# bd909.asm's ;@ NAME tags (read x:(r5), written back x:(r5)+), so the order
# is read from the source; the words only the block control uses follow, the
# last three above the knob block. The 48-bit states are hi/lo pairs (MH/ML
# the VCA, THH/THL the thump, HPH/HPL the desk's coupling): X only, no Y.
_ACCESS = re.compile(r'x:\((?:r5|@D@)\)(\+|-|@DEND@|)(?=[,\s]).*?;@ (\w+)')
EXTRA = ['INCB', 'SINCA', 'SSAT', 'BC', 'T0', 'SEG', 'PP', 'GN16', 'E2N', 'E3N', 'SAVN5']
KNOBS_AT = 0x30


def walk(text):
    """The loop's words in walking order, and the desk stage's among them."""
    loop = text[text.index('do      a1,zq07'):text.index('\nzq07:')]
    order, pos, desk, in_desk, closed = [], 0, [], False, False
    for line in loop.splitlines():
        if line.startswith(';<desk>'):
            in_desk = True
        code = line.split(';')[0]
        m = _ACCESS.search(line)
        assert bool(m) == bool(re.search(r'x:\((r5|@D@)\)', code)), f'untagged walk access: {line}'
        if not m:
            continue
        mode, name = m.groups()
        assert not closed, f'access after the walk closed: {line}'
        if pos == len(order):
            assert name not in order, f'{name} is walked twice'
            order.append(name)
            if in_desk:
                desk.append(name)
        assert order[pos] == name, f'the walk stands on {order[pos]}, the source says {name}'
        if mode == '@DEND@':
            assert pos == len(order) - 1
            closed = True
        else:
            pos += {'+': 1, '-': -1, '': 0}[mode]
    assert closed and order[-len(desk):] == desk
    return order, desk


WALK, DESK = walk((HERE / 'bd909.asm').read_text())
OFF = {name: k for k, name in enumerate(WALK)}
_free = list(range(len(WALK), KNOBS_AT)) + [61, 62, 63]
assert len(EXTRA) <= len(_free), 'the voice block is full'
OFF.update(zip(EXTRA, _free))
# tools/build/ab_image.py's initial voice words, by the names it writes: C ($7fffff) is the block count, so a voice
# starts long past its last hit; KLPF ($7fffff) is the click table's position, which zq04 clamps to the silent rows.
OFF.update(C=OFF['BC'], KLPF=OFF['PP'])
SWORDS = KNOBS_AT


def u_of(i):
    """OT knob 0..127 -> Drumazon's 0..1 (64 is its 50 %)."""
    return i / 128 if i <= 64 else .5 + (i - 64) / 126


def _pchip(xs, ys):
    """Monotone cubic (Fritsch-Carlson), so no scipy is needed at build time."""
    n = len(xs)
    h = [xs[k + 1] - xs[k] for k in range(n - 1)]
    d = [(ys[k + 1] - ys[k]) / h[k] for k in range(n - 1)]
    m = [d[0]] + [0.0] * (n - 2) + [d[-1]]
    for k in range(1, n - 1):
        if d[k - 1] * d[k] > 0:
            w1, w2 = 2 * h[k] + h[k - 1], h[k] + 2 * h[k - 1]
            m[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k])

    def f(x):
        k = min(max(0, next((j for j in range(n - 1) if x <= xs[j + 1]), n - 2)), n - 2)
        t = (x - xs[k]) / h[k]
        h00, h10 = 2*t**3 - 3*t**2 + 1, t**3 - 2*t**2 + t
        h01, h11 = -2*t**3 + 3*t**2, t**3 - t**2
        return h00*ys[k] + h10*h[k]*m[k] + h01*ys[k+1] + h11*h[k]*m[k+1]
    return f


_LOG = lambda vals: [math.log(v) for v in vals]
FB = _pchip(NODES, _LOG(FIT['pitch']['fb_hz']))
AP = _pchip(NODES, _LOG(FIT['pitch']['A_hz']))
A_REF = FIT['pitch']['A_hz'][NODES.index(.5)]
GT = _pchip(NODES, _LOG([a / A_REF for a in FIT['tune']['A_hz']]))
TAUP = _pchip(NODES, _LOG(FIT['tune']['tau_s']))
_GD = _pchip(NODES, _LOG([a / A_REF for a in FIT['depth']['A_hz']]))
TAUD = _pchip(NODES, _LOG(FIT['decay']['tau_s']))
PK, DK = FIT['pitch']['knob'], FIT['decay']['knob']


def fb_hz(i):
    """PITCH i: one octave, exponential, 64 on the recorded 909."""
    lo, hi = (PK['min_hz'], i / 64) if i <= 64 else (PK['max_hz'], (127 - i) / 63)
    return lo * (PK['ref_hz'] / lo) ** hi


def a_hz(i):
    """PITCH i's sweep excursion: the nodes' A at the knob position with the same settled pitch."""
    target, lo, hi = math.log(fb_hz(i)), 0.0, 1.0
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if FB(mid) < target else (lo, mid)
    return math.exp(AP(lo))


def tau_decay(i):
    """DECAY i: log-linear through min_s, ref_s at ref_knob, max_s."""
    r = DK['ref_knob']
    lo, hi = (DK['min_s'], i / r) if i <= r else (DK['max_s'], (127 - i) / (127 - r))
    return lo * (DK['ref_s'] / lo) ** hi
VA = _pchip(FIT['velocity']['attack_v'], FIT['velocity']['attack_gain'])
# The click (pulse and noise gate) fires DCLK samples after the trig, so the
# opening body leads it as in the recordings; the sweep depth varies per hit.
DCLK = FIT['pulse']['delay_samples']
KEJIT = FIT['pitch']['sweep_jitter']
KEBASE = 1 - KEJIT - 2 ** -22


def GD(u):
    """TUNE DEPTH: the fitted nodes from 0.125, the power law below (A -> 0)."""
    if u >= .125:
        return math.exp(_GD(u))
    return math.exp(_GD(.125)) * (max(u, 1e-9) / .125) ** FIT['depth']['below_0.125_exponent']


def thump(A):
    t = FIT['thump_vs_A']
    s = lambda a: t['a'] + t['b'] * (1 - math.exp(-a / t['A0_hz']))
    return s(A) / s(t['A_ref_hz'])


def k_exp(tau):
    return math.exp(-1 / (tau * RATE))


def k_pole(fc):
    return math.exp(-2 * math.pi * fc / RATE)


def biquad_lp(f0, q):
    w = 2 * math.pi * f0 / RATE
    al = math.sin(w) / (2 * q)
    a0 = 1 + al
    b0 = (1 - math.cos(w)) / 2 / a0
    return b0, 2 * b0, b0, -2 * math.cos(w) / a0, (1 - al) / a0


# The 909 service notes' output network (R473/474 + R530/532, C511/512 into
# R531/533): the existing LPF knob. 0 = off, 64 = the drawn network.
_NOMINAL = 1 / (2 * math.pi * (3200 * 10000 / (3200 + 10000)) * 10e-9)
LPF_HZ = [0] + [500 * (_NOMINAL / 500) ** ((i - 1) / 63) if i <= 64 else
                _NOMINAL * (18000 / _NOMINAL) ** ((i - 64) / 63) for i in range(1, 128)]

LCG_M = 1664525                       # = 2K + 1, 1 mod 4: full period with an odd c
LCG_K = (LCG_M - 1) // 2
LCG_C = 1013904223 & 0xffffff
SEED = 0x5a5a5b
assert LCG_C & 1 and LCG_M % 4 == 1 and LCG_K < 1 << 23


def _white_rms_through_filters():
    """RMS of the LCG through the noise HP and two LPs (normalises NOISE g)."""
    s = SEED
    anh, kl1, kl2 = k_pole(NZ['f_hp']), 1 - k_pole(NZ['f_lp1']), 1 - k_pole(NZ['f_lp2'])
    nh = prev = n1 = n2 = acc = 0.0
    n = 0
    for i in range(300000):
        s = (s * LCG_M + LCG_C) & 0xffffff
        w = (s - (1 << 24) if s & 0x800000 else s) / 8388608
        nh = anh * nh + (1 + anh) / 2 * (w - prev); prev = w
        n1 += kl1 * (nh - n1); n2 += kl2 * (n1 - n2)
        if i > 10000:
            acc += n2 * n2; n += 1
    return math.sqrt(acc / n)


NOISE_RMS = _white_rms_through_filters()


PADMAX = 1 / (1 - MK['k_sat'])   # the curve tops out at 1 - k_sat: never a hard clip
_RISE = _pchip(MK['rise_knots'], MK['rise_db'])


def mk_drive(i):
    """SAT i: the stage's gain, 0 dB .. top_db over 1/PADMAX (so SAT 0 is transparent)."""
    return 10 ** (i / 127 * MK['top_db'] / 20) / PADMAX


def mk_pad(i):
    """SAT i: the make-up; the init patch's level rises target_rise_db over the knob."""
    return PADMAX * 10 ** (-max(0.0, _RISE(i) - MK['target_rise_db'] * i / 127) / 20)


def mk_sat(v):
    """The Mackie curve: clip at 1, then v - k_sat v^5."""
    v = max(-1.0, min(1 - 2 ** -23, v))
    return v - MK['k_sat'] * v ** 5


def tables():
    """Every table and constant, as floats. q24() quantises for the DSP."""
    ap = [a_hz(i) for i in range(128)]
    # The body releases DCLK samples later while ep already decays: scale the
    # excursion by exp(DCLK/tau) so the released sweep is unchanged.
    gt = [math.exp(GT(u_of(i)) + DCLK / (math.exp(TAUP(u_of(i))) * RATE)) for i in range(128)]
    gd = [GD(u_of(i)) for i in range(128)]
    # a hair above each maximum: a 24-bit fraction cannot hold 1.0
    ap_max, gt_max, gd_max = (max(v) * (1 + 2 ** -20) for v in (ap, gt, gd))
    a_max = ap_max * gt_max * gd_max
    k_inc = 2 * a_max / RATE / KEBASE   # ep starts at KEBASE on average
    assert k_inc < 1
    t = dict(
        T_INCB=[2 * fb_hz(i) / RATE for i in range(128)],
        T_AP=[a / ap_max for a in ap],
        T_GT=[g / gt_max for g in gt],
        T_GD=[g / gd_max for g in gd],
        T_DKP=[1 - k_exp(math.exp(TAUP(u_of(i)))) for i in range(128)],
        T_DKD=[1 - k_exp(tau_decay(i)) for i in range(128)],
        # thump level by sweep size: index = floor(q*128), A = mid-bin
        # level tables carry (128/100)^2: the block's body level is (ACCNT/128)^2
        T_THS=[OUT * B['k_dc'] * thump((i + .5) / 128 * a_max) * VLAW for i in range(128)],
        T_VA=[VA(max(i, 1)) / VAS for i in range(128)],
        T_ATP=[OUT * (B['k0'] + u_of(i)) * VAS / PU['gain_scale'] for i in range(128)],
        T_LPF=[1 - k_pole(f) for f in LPF_HZ[1:]] + [1 - 2 ** -23],  # 0.1.6: 0..126 = 500 Hz..18 kHz, 127 = OFF
        # SAT: drive / stage / 32 (five asl) and the make-up / 2 (one asl)
        T_TIN=[mk_drive(i) / MK['stage'] / 32 for i in range(128)],
        T_PAD=[mk_pad(i) / 2 for i in range(128)],
        # LOW / HIGH: the band's weight 4u^2 * sqrt(2u) * stage/16, halved (the
        # decode doubles it; u = 1 clamps a hair under 1)
        T_GLH=[4 * u_of(i) ** 2 * math.sqrt(2 * u_of(i)) * MK['stage'] / 32 for i in range(128)],
    )
    # Noise gain follows Attack on the same line as T_ATP, so it is decoded as
    # KN0 + KN1 * T_ATP. The noise chain runs at half scale: its HP swings
    # (w - prev), up to 2.
    p0, p1 = OUT * B['k0'] * VAS / PU['gain_scale'], OUT * VAS / PU['gain_scale']
    n0, n1 = (2 * OUT * w * NZ['g'] / NOISE_RMS * VAS / SHIFT
              for w in (NZ['attack_floor'], 1 - NZ['attack_floor']))
    kn1 = n1 / p1
    kn0 = n0 - kn1 * p0
    assert all(0 < kn0 + kn1 * v < 1 for v in t['T_ATP'])
    tfb=2*FIT['tune']['base_delta_hz']/RATE/(t['T_GT'][-1]-t['T_GT'][0])
    b0, b1, b2, a1, a2 = biquad_lp(PU['f0'], PU['q'])
    ahp, anh = k_pole(PU['f_hp']), k_pole(NZ['f_hp'])
    c = dict(
        KTFB=tfb,KTFB0=-tfb*t['T_GT'][0],
        KA_INC=k_inc, K_BODY=4 * OUT * B['G'] * VLAW,
        NREL=math.ceil(B['t_r'] * RATE) + DCLK, DCLK=DCLK,
        # the click and the noise rest once below -90 dB, 100 ms after the trig
        NEND=round(0.1 * RATE), KEBASE=KEBASE, KEJIT=KEJIT, FRAC=B.get('release_fraction', 1 - (math.ceil(B['t_r'] * RATE) - B['t_r'] * RATE)),
        U0=B.get('phase_reset', -0.5 + B['x_r'] / 2), THETA=FIT['theta'], NHOLD=round(B['t_h'] * RATE),
        KA=1 - k_exp(B['tau_a']), DKDROOP=1 - k_exp(B['tau_droop']), KTH=1 - k_exp(B['tau_dc']),
        KPR=k_exp(PU['tau_decay']),
        KPBASE=PU['jitter_base'], KPJIT=PU['jitter_depth'],
        KFAST=k_exp(PU['fast_tau']), KGS=PU['fast_gain']*OUT*VAS/PU['gain_scale'], KFDR=PU['fast_depth']/4,
        AHP=ahp, BHP=(1 + ahp) / 2, KU=1 - k_pole(PU['f_u']),
        KW16=PU['k_w'] / 128, KU16=PU['k_u'] / 128,
        KN0=kn0, KN1=kn1, KN0X=SHIFT * kn0, KN1Q=SHIFT * kn1 / 4,
        NIDLE=NIDLE, NHOLDB=NHOLDB, WLAST=len(WALK) - 1, KHP8=8 * MK['k_hp'],
        K2B=k_exp(NZ['t2']) ** 16, K3B=(k_exp(NZ['t2']) * k_exp(NZ['t1'])) ** 16,
        # the shape scales, halved: lR/2 = KL0 + KLE*ep - KLM*m, (lF - lR)/2 = 1/2 + KKF*ep - lR/2
        KL0=SS['L0'] / 2, KLE=-SS['LE'] / 2, KLM=SS['LM'] / 2, KKF=SS['KF'] / 2,
        ANH=anh, BNH=(1 + anh) / 4, KL1=1 - k_pole(NZ['f_lp1']), KL2=1 - k_pole(NZ['f_lp2']),
        K2=k_exp(NZ['t2']), K3=k_exp(NZ['t2']) * k_exp(NZ['t1']),
        LCGK=LCG_K, LCGC=LCG_C, SEED=SEED,
        KSAT=MK['k_sat'], KB=MK['kb'], KM=MK['km'], KMS=2 * MK['stage'] / 16,
    )
    cbody, cfund = body_table(), body_fundamental()
    ctd = [w - f for w, f in zip(cbody, cfund)]
    cclk, c['KA1'], c['KB1'], c['KB2'] = click_table(c, biquad_lp(PU['f0'], PU['q']))
    for name, v in list(t.items()) + [('CTD', ctd), ('CF', cfund), ('CCLK', cclk)]:
        assert all(-1 <= x < 1 for x in v), name
    assert 0 < c['K_BODY'] < 1 and c['FRAC'] == 0 and 0.5 + abs(c['KKF']) < 1
    assert DCLK == 16 and c['NREL'] == 48, 'the click and the release are block events: 1 and 3 blocks after the trig'
    assert abs(c['NHOLD'] - 16 * NHOLDB) < 16
    va, atp = max(t['T_VA']), max(t['T_ATP'])
    assert 4 * va * atp < 1 and max(abs(4 * v * (c['KGS'] + 4 * a * c['KFDR']))
                                    for v in t['T_VA'] for a in t['T_ATP']) < 1
    assert 0 < c['KN0X'] + 4 * c['KN1Q'] * min(t['T_ATP']) and c['KN0X'] + 4 * c['KN1Q'] * atp < 1
    for ep in (0, 1):
        for m in (0, 1):
            lr = c['KL0'] + c['KLE'] * ep - c['KLM'] * m
            assert 0 < lr < 1, 'shape scale leaves the fraction range'
    return t, c, dict(CTD=ctd, CF=cfund, CCLK=cclk), dict(a_max=a_max, k_inc=k_inc)


NIDLE = 181                    # blocks after a trig before a closed voice may rest
NHOLDB = 180                   # blocks of hold (65.3 ms; the fit's t_h is 65.4)
CLK_N = 128                    # click table rows; then 16 silent ones, so a block
CLK_PAD = 16                   # that starts on any row before them ends inside them


def click_table(c, biq):
    """The click's filters as a table, and their two slow modes as gains.

    The trigger pulse is two discharges, KPR^n and KFAST^n, through HP, the
    resonant LP and the parallel LP. Per discharge the response h[n] is a
    table column; what outlasts the table is the discharge itself (KPR only:
    KFAST is gone within it) and the HP's own mode AHP^n, which the voice
    keeps as two decaying words E1, E2. Returns the interleaved columns
    D[n] = h1 - A1*KPR^n - B1*AHP^n and H[n] = h2 - B2*AHP^n, then A1, B1, B2.
    """
    b0, b1, b2, a1, a2 = biq

    def response(k, n_all=3200):
        e, lpu, hp, upp, bx1, bx2, by1, by2, out = 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, []
        for _ in range(n_all):
            up, e = e, e * k
            lpu += c['KU'] * (up - lpu)
            hp = c['AHP'] * hp + c['BHP'] * (up - upp)
            upp = up
            w = b0 * hp + b1 * bx1 + b2 * bx2 - a1 * by1 - a2 * by2
            bx2, bx1, by2, by1 = bx1, hp, by1, w
            out.append(c['KW16'] * w + c['KU16'] * lpu)   # y takes -4 * (gp*h1 + gs*h2)
        return out
    h1, h2 = response(c['KPR']), response(c['KFAST'])
    n0 = 3000
    ka1 = h1[n0] / c['KPR'] ** n0
    at = 220                    # the HP mode alone is left there
    kb1 = (h1[at] - ka1 * c['KPR'] ** at) / c['AHP'] ** at
    kb2 = h2[at] / c['AHP'] ** at
    rows = [(h1[n] - ka1 * c['KPR'] ** n - kb1 * c['AHP'] ** n, h2[n] - kb2 * c['AHP'] ** n) for n in range(CLK_N)]
    peak = max(abs(v) for r in rows for v in r)
    assert max(map(abs, rows[-1])) < peak * 10 ** (-55 / 20), 'the click table ends above -55 dB'
    rows += [(0.0, 0.0)] * CLK_PAD
    return [v for r in rows for v in r], ka1, kb1, kb2


BODY_N = FIT['body']['table_points']
SS = FIT['body']['shape_scale']
assert BODY_N == 128, 'bd909.asm indexes the body table as (u + 1) * 64'


@functools.lru_cache(maxsize=None)
def body_table():
    """S/4 over one cycle, u = -1 + 2k/BODY_N, and k = 0 again for interpolation.

    The polynomial wave (c0, c, quadrature) keeps its own harmonics above the
    measured ones; its H1..len(cycle) are replaced by the recorded cycle's
    (relative to H1, H1 a pure cosine), so the DC and fundamental, and with
    them the fitted body gain and thump, are unchanged. Each harmonic is
    raised against linear interpolation's sinc^2 droop; none above BODY_N/2."""
    m, n, cyc = 2048, BODY_N, B['cycle']
    us = [2 * j / m - 1 for j in range(m)]

    def wave(u):
        x = 1 - 2 * abs(u)
        return (sum(cf * x ** k for k, cf in enumerate([B['c0']] + B['c'])) +
                u * (1 + x) * sum(cf * x ** k for k, cf in enumerate(B['quadrature'])))
    ys = [wave(u) for u in us]
    harm = [(sum(ys) / m, 0.0)]
    for h in range(1, n // 2):
        harm.append((2 / m * sum(y * math.cos(h * math.pi * u) for y, u in zip(ys, us)),
                     2 / m * sum(y * math.sin(h * math.pi * u) for y, u in zip(ys, us))))
    fund = harm[1][0]
    for h, (sym, asym) in enumerate(zip(cyc['sym'], cyc['asym']), 1):
        harm[h] = (fund * sym, fund * asym)
    table = []
    for k in range(n):
        ph = math.pi * (2 * k / n - 1)
        table.append((harm[0][0] + sum((a * math.cos(h * ph) + b * math.sin(h * ph)) /
                                       (math.sin(math.pi * h / n) / (math.pi * h / n)) ** 2
                                       for h, (a, b) in enumerate(harm[1:], 1))) / 4)
    return tuple(table + table[:1])


@functools.lru_cache(maxsize=None)
def body_fundamental():
    """The body table's own H1 alone, at the same points: the part the sweep scales separately."""
    table, n = body_table(), BODY_N
    phases = [math.pi * (2 * k / n - 1) for k in range(n)]
    a = 2 / n * sum(v * math.cos(p) for v, p in zip(table, phases))
    b = 2 / n * sum(v * math.sin(p) for v, p in zip(table, phases))
    out = [a * math.cos(p) + b * math.sin(p) for p in phases]
    return tuple(out + out[:1])


def q24(x):
    """A fraction as a 24-bit word (clamped, rounded)."""
    v = max(-1 << 23, min((1 << 23) - 1, round(x * (1 << 23))))
    return v & 0xffffff


INTS = ('NREL', 'NHOLD', 'DCLK', 'NEND', 'NIDLE', 'NHOLDB', 'WLAST')
WORDS = ('LCGK', 'LCGC', 'SEED')


def addresses(layout):
    """The table addresses bd909.asm names: the body tables from their middle cell, the click table's ends."""
    return dict(TD=layout['CTD'] + BODY_N // 2, TD1=layout['CTD'] + BODY_N // 2 + 1,
                CF=layout['CF'] + BODY_N // 2, CF1=layout['CF'] + BODY_N // 2 + 1,
                CSTART=layout['CCLK'], CEND=layout['CCLK'] + 2 * CLK_N)


def fill(text, layout, off):
    tab, con, lists, _ = tables()
    subs = {name: f'${k:x}' for name, k in off.items()}
    for name in list(tab) + list(lists):
        subs[name] = f"${layout[name]:x}"
    subs.update({name: f'${k:x}' for name, k in addresses(layout).items()})
    for name, v in con.items():
        if name in INTS:
            subs[name] = f'${int(v):x}'
        elif name in WORDS:
            subs[name] = f'${int(v) & 0xffffff:06x}'
        else:
            subs[name] = f'${q24(v):06x}'
    out = re.sub(r'@([A-Z0-9_]+)@', lambda m: subs[m.group(1)], text)
    labels = re.findall(r'^(\w+):', out, re.M)
    for a in labels:
        for b in labels:
            assert a == b or not b.startswith(a), f'label {a} prefixes {b}'
    return out


def desk_text(tag, walker, end):
    """One of the two desk passages of bd909.asm, for the pointer `walker`."""
    text = (HERE / 'bd909.asm').read_text()
    body = text[text.index(';<' + tag + '>'):text.index(';</' + tag + '>')]
    return body.replace('@D@', walker).replace('@DEND@', end)


DESK_TAIL = '        asl     a                               ; (the make-up is stored halved)\n'


def desk_call(before='', after=''):
    """The loop's desk passage as a call to the shared copy (zd0s), which walks with r5 and leaves it on the last word."""
    passage = desk_text('desk', 'r5', '')
    return before + '        bsr     >zd0s\n' + after + passage[passage.index(DESK_TAIL):]


def source(layout, *, output_gain=True, shared_desk=False, include_desk=True):
    """bd909.asm with its placeholders filled. layout: table and list bases.
    shared_desk: both engines call one copy of the desk's two passages
    (shared_desk_source), which costs three instructions a sample and saves
    the second copy's P words; otherwise the passages stay in the loop."""
    text = (HERE / 'bd909.asm').read_text()
    if shared_desk:
        for tag, call in (('desk-decode', '        bsr     >zd0d\n'),
                          ('desk', desk_call(after='        move    (r5)-n5\n'))):
            start, end = text.index(';<' + tag + '>'), text.index(';</' + tag + '>')
            text = text[:start] + call + text[end:]
    text = text.replace('@D@', 'r5').replace('@DEND@', '-n5')
    if output_gain:
        assert OUTPUT_GAIN > 0 and OUTPUT_GAIN & (OUTPUT_GAIN - 1) == 0
        # The stores limit overloads at full scale, as the 24-bit sample
        # limited before the gain did.
        store = DESK_TAIL + '        move    a,x:(r0)+\n'
        assert text.count(store) == 1
        shift = OUTPUT_GAIN.bit_length()
        text = text.replace(store, f'        asl     #${shift:x},a,a                       ; the make-up, halved, and the output gain\n'
                                   '        move    a,x:(r0)+\n')
    assert CLK_PAD >= 16, 'a segment of up to 16 samples starting before CEND must end in the silent rows'
    return fill(text, layout, OFF)


def shared_desk_source(layout):
    """The desk's two passages once, for both engines: zd0d decodes (r5 the
    voice block, r6 its knobs), zd0s is the loop's stage (r5 on the desk's
    first word, left on its last; the sample in and out in a)."""
    stage = desk_text('desk', 'r5', '')
    text = ('zd0d:\n' + desk_text('desk-decode', '', '') + '        rts\n'
            'zd0s:\n' + stage[:stage.index(DESK_TAIL)] + '        rts\n')
    return fill(text, layout, OFF)


def desk_source(layout):
    """The desk stage alone, for the stage gate: zt01 decodes SAT/LOW/HIGH
    from r6 like zq01, then runs step 9 on each input sample at x:(r0),
    writing it back as L,R. The text is bd909.asm's own, between markers."""
    first = OFF[DESK[0]]
    text = ('zt01:\n        move    #>$ffffff,m0\n        move    #>$ffffff,m1\n'
            '        move    #>$ffffff,m4\n' + desk_text('desk-decode', '', '') +
            '        do      n7,zt02\n' + f'        lua     (r5+${first:x}),r4\n' + '        move    x:(r0),a\n' +
            desk_text('desk', 'r4', '+') + 'zt02:\n        rts\n')
    return fill(text, layout, OFF)


def data_lines(layout):
    """Tables and coefficient lists as X data for bd909_host: 'X addr w w ...'."""
    tab, _, lists, _ = tables()
    lines = []
    for name, vals in list(tab.items()) + list(lists.items()):
        lines.append('X %x ' % layout[name] + ' '.join('%06x' % q24(v) for v in vals))
    return '\n'.join(lines) + '\n'


def default_layout(base=0x1000):
    # The first word stays unused: on a Modwerk USB base core 1's load meter counts its wait for core 0 at X:$2840
    # (tools/build/ab_image.py's TABLES; sdk/machines/octatrack/elekloader/dsp_loader.py CORE1_METER), which turned
    # PITCH 0's 909 step into that count.
    tab, _, lists, _ = tables()
    lay, a = {}, base + 1
    for name, vals in list(tab.items()) + list(lists.items()):
        lay[name] = a
        a += len(vals)
    return lay


DSP_ASM = ROOT / 'vendor/dsp56300/build/source/dsp_host/dsp_asm'
DISASM = ROOT / 'vendor/dsp56300/build/source/disassemble/dsp56kDisassemble'
BAD = re.compile(r'\b(mpysu|macsu|mpyuu|macuu|max|maxm|rnd)\b')
LINE = re.compile(r'^([0-9a-f]{6}): (\S+)(?:\s+(.*?))?\s*; [0-9a-f]{6}(?: [0-9a-f]{6})?$')


def _decoded(text):
    return {int(m.group(1), 16): (m.group(2), (m.group(3) or '').strip())
            for m in map(LINE.match, text.splitlines()) if m}


def assemble(org, layout, out_bin, src=None):
    """Assemble at org; return ({label: address}, listing).

    Disassembles what it assembled (AGENTS.md): every address's decoded
    mnemonic AND operands must equal the typed ones, and no su/uu/max/rnd
    form may appear in the decode. A listing echoes the SOURCE text, so it
    cannot see `mac -y0,y1,b` written as `macsu -y0,y1,b` (28 Sep 2026: an
    operand order outside the multiplier's pair table, found by the gate).
    Branch and loop operands render differently in the two tools and are
    compared by mnemonic only."""
    src = src or source(layout)
    with tempfile.TemporaryDirectory() as tmp:
        asm = pathlib.Path(tmp) / 'bd909.asm'
        asm.write_text(src)
        sym = pathlib.Path(tmp) / 'bd909.sym'
        r = subprocess.run([str(DSP_ASM), '-in', str(asm), '-org', f'{org:x}', '-out', str(out_bin),
                            '-list', '-sym', str(sym)], capture_output=True, text=True)
        if r.returncode:
            raise RuntimeError(r.stdout[-3000:] + r.stderr[-2000:])
        listing = r.stdout
        symbols = {n: int(a, 16) for n, a in (l.split() for l in sym.read_text().splitlines())}
        pathlib.Path(out_bin).with_suffix('.lst').write_text(listing)
        d = subprocess.run([str(DISASM), '-in', str(out_bin), '-pc', f'{org:x}', '-le'],
                           capture_output=True, text=True)
    typed, dec = _decoded(listing), _decoded(d.stdout)
    assert typed and len(dec) >= len(typed) * 0.9, 'no decode to compare'
    norm = lambda op: re.sub(r'\s+', '', op.split(';')[0]).replace('#>', '#').replace('#<', '#').lower()
    bad = []
    for a, (m, op) in typed.items():
        dm, dop = dec.get(a, ('?', ''))
        if BAD.search(dm) or dm != m:
            bad.append((a, m, op, dm, dop))
        elif m not in ('bsr', 'bra', 'beq', 'bne', 'blt', 'bge', 'jsr', 'jmp', 'do', 'rep') \
                and norm(op) != norm(dop) and not re.search(r'#|\$', op):
            bad.append((a, m, op, dm, dop))
    if bad:
        raise RuntimeError('disassemble-what-you-assemble:\n' + '\n'.join(
            f'  P:{a:06x} typed {m} {op}  decodes {dm} {dop}' for a, m, op, dm, dop in bad))
    return symbols, listing


def rnd24(x):
    """mpyr: the product rounded to 24 bits (ties away from zero is close
    enough here: the DSP's convergent rounding differs only on exact ties)."""
    return math.floor(x * 8388608 + 0.5) / 8388608


def fl24(x):
    """An accumulator stored to 24 bits: two's-complement truncation."""
    return math.floor(x * 8388608) / 8388608


def slew(current, target, shift):
    """The native signed 24-bit slew by 2^-shift; downward steps use arithmetic shift."""
    value, dest = math.floor(current * 8388608), math.floor(target * 8388608)
    return (value + ((dest - value) >> shift)) / 8388608


def _signed(word):
    return (word - (1 << 24) if word & 0x800000 else word) / 8388608


class Voice:
    """Float reference with the engine's structure, block by block. Words the
    DSP stores as 24 bits are truncated here where that matters (the phase
    path, the envelopes); the rest is left in floats."""

    TOP = 1 - 2 ** -23

    def __init__(self, quantized=True, *, output_gain=True):
        self.output_gain = OUTPUT_GAIN if output_gain else 1
        self.t, self.c, self.lists, self.meta = tables()
        if quantized:   # the words the DSP receives, back as fractions
            f = lambda v: ((q24(v) ^ 0x800000) - 0x800000) / 8388608
            self.t = {k: [f(v) for v in vals] for k, vals in self.t.items()}
            self.lists = {k: [f(v) for v in vals] for k, vals in self.lists.items()}
            self.c = {k: (v if k in INTS + WORDS else f(v)) for k, v in self.c.items()}
        self.ep = self.u = self.o = self.m = self.th = 0.0
        self.bc, self.t0 = (1 << 23) - 1, 0
        self.incb = self.sinca = self.sgdch = self.aincb = self.asinca = 0.0
        self.dkp = self.dkm = self.lr = self.gbody = 0.0
        self.g1 = self.g2 = self.g3 = self.g4 = self.e1 = self.e2 = 0.0
        self.pp = None                    # the click table's row; None: past it
        self.lcg = SEED
        self.nprev = self.nh = self.n1 = self.n2 = 0.0
        self.e2n = self.e3n = self.gn16 = self.env = self.denv = 0.0
        self.klpf = self.yl = 0.0
        self.ssat = 0
        self.tin = self.pad = self.dtin = self.dpad = self.khp = 0.0
        self.gl = self.gh = self.hps = self.lb = self.m2 = 0.0

    # ---- once a block ------------------------------------------------------
    def block(self, k, trig=None, frames=16):
        t, c = self.t, self.c
        if trig is None and self.bc >= c['NIDLE'] and self.m < 2 ** -16:
            self.pad = 0.0                # at rest; the next hit starts from its own knobs
            return [0.0] * frames
        self.incb = fl24(t['T_INCB'][k[0]] + c['KTFB0'] + c['KTFB'] * t['T_GT'][k[2]])
        q = rnd24(rnd24(t['T_AP'][k[0]] * t['T_GT'][k[2]]) * t['T_GD'][k[4]])
        inc_a = rnd24(q * c['KA_INC'])
        vb = fl24((k[8] / 128) ** 2)
        gdc_half = fl24(rnd24(vb * t['T_THS'][min(127, int(q * 128))]) / 2)
        self.gbody = rnd24(vb * c['K_BODY'])
        if self.pad == 0:
            self.sinca, self.sgdch = inc_a, gdc_half
        self.sinca, self.sgdch = slew(self.sinca, inc_a, 2), slew(self.sgdch, gdc_half, 2)
        self.dkp, self.klpf = t['T_DKP'][k[2]], t['T_LPF'][k[11]]
        self.lr = fl24(c['KL0'] + c['KLE'] * self.ep - c['KLM'] * fl24(self.m))
        if self.bc >= 4:
            self.aincb, self.asinca = self.incb, self.sinca
        if self.bc >= c['NHOLDB']:
            self.dkm = t['T_DKD'][k[1]]
        self.noise_ramp()
        self.desk_knobs(k)
        event = self.t0 if self.bc in (1, 3) and (trig is None or self.t0 < trig) else None
        out = []
        for i in range(frames):
            if i == event:
                self.click(k) if self.bc == 1 else self.release()
            if i == trig:
                self.trig(k, i)
            out.append(self.sample())
        self.bc = min(self.bc + 1, (1 << 23) - 1)
        return out

    def trig(self, k, at):
        c = self.c
        if k[7]:                          # FIXD: every hit opens the same way
            self.lcg = SEED
            self.ep = fl24(c['KEBASE'])
        else:
            self.ep = fl24(c['KEBASE'] + c['KEJIT'] * _signed(self.lcg))
        self.bc, self.t0 = 0, at
        self.o, self.m, self.u = 0.0, 1.0, c['U0']
        self.aincb = self.asinca = 0.0    # the crest is held until the release
        self.dkm = c['DKDROOP']

    def release(self):
        self.aincb, self.asinca = self.incb, self.sinca

    def click(self, k):
        t, c = self.t, self.c
        j = fl24(c['KPBASE'] + (0.0 if k[7] else c['KPJIT'] * _signed(self.lcg)))
        va, atp = t['T_VA'][k[8]], t['T_ATP'][k[3]]
        self.gn16 = fl24(va * fl24(c['KN0X'] + 4 * c['KN1Q'] * atp))
        gp = rnd24(va * atp)
        gs = fl24(va * c['KGS'] + 4 * gp * c['KFDR'])
        self.g1, self.g2 = fl24(-4 * j * gp), fl24(-4 * j * gs)
        self.g3 = fl24(self.g1 * c['KA1'])
        self.g4 = fl24(self.g1 * c['KB1'] + self.g2 * c['KB2'])
        self.e1 = self.e2 = self.e2n = self.e3n = self.TOP
        self.pp = 0
        self.noise_ramp()

    def noise_ramp(self):
        """ENV2 = e2 - e3 a block on, with its gain, and the ramp that reaches it."""
        c = self.c
        self.e2n, self.e3n = fl24(self.e2n * c['K2B']), fl24(self.e3n * c['K3B'])
        target = fl24(self.gn16 * (self.e2n - self.e3n))
        self.denv = math.floor((target - self.env) * 8388608 / 16) / 8388608

    # ---- every sample ------------------------------------------------------
    def sample(self):
        c, cl = self.c, self.lists
        inc = self.aincb + self.asinca * self.ep
        self.ep = fl24(self.ep - self.ep * self.dkp)
        word = (math.floor(self.u * 8388608) + math.floor(inc * 8388608)) & 0xffffff
        self.u = _signed(word)
        cell, frac = (word ^ 0x800000) >> 17, (word & 0x1ffff) / 131072   # cell 0..127 from u = -1
        lfp = fl24(0.5 + c['KKF'] * self.ep)
        td = cl['CTD'][cell] + frac * (cl['CTD'][cell + 1] - cl['CTD'][cell])
        fu = cl['CF'][cell] + frac * (cl['CF'][cell + 1] - cl['CF'][cell])
        s8 = fl24(td) * self.lr + lfp * fl24(fu)
        self.o = fl24(self.o + c['KA'] - c['KA'] * self.o)
        self.m -= fl24(self.m) * self.dkm
        g = fl24(self.o * fl24(self.m))
        y = self.gbody * fl24(g * fl24(s8))
        self.th = fl24(self.th + c['KTH'] * (g - self.th))
        y = 2 * (y - self.sgdch * self.th)
        if self.pp is not None:
            y += self.g1 * cl['CCLK'][2 * self.pp] + self.g2 * cl['CCLK'][2 * self.pp + 1]
            self.pp += 1
        y += self.g3 * self.e1 + self.g4 * self.e2
        self.e1, self.e2 = fl24(self.e1 * c['KPR']), fl24(self.e2 * c['AHP'])
        self.lcg = (self.lcg * LCG_M + LCG_C) & 0xffffff
        white = _signed(self.lcg)
        self.nh = fl24(c['ANH'] * self.nh + c['BNH'] * (white - self.nprev))
        self.nprev = white
        self.n1 = fl24(self.n1 + c['KL1'] * (self.nh - self.n1))
        self.n2 = fl24(self.n2 + c['KL2'] * (self.n1 - self.n2))
        self.env += self.denv
        y += self.env * self.n2
        y = max(-1.0, min(self.TOP, y))
        self.yl += self.klpf * (fl24(y) - fl24(self.yl))
        return self.desk(self.yl)

    def segment_end(self):
        """After a run of samples: a click table past its rows rests on its last, silent one."""
        if self.pp is not None and self.pp >= CLK_N:
            self.pp = None

    # ---- the desk ----------------------------------------------------------
    def desk_knobs(self, k):
        t, c = self.t, self.c
        self.segment_end()
        pos = k[5] << 16
        moving = True
        if self.pad != 0:
            step = (pos - self.ssat) >> 2
            moving = step != 0
            pos = self.ssat + step
        if not moving:
            self.dtin = self.dpad = 0.0
        else:
            first = self.pad == 0
            self.ssat = pos
            index, fraction = pos >> 16, (pos & 65535) / 65536
            at = lambda name: fl24(t[name][index] + fraction * (t[name][min(127, index + 1)] - t[name][index]))
            tin, pad = at('T_TIN'), at('T_PAD')
            if first:
                self.tin, self.pad, self.dtin, self.dpad = tin, pad, 0.0, 0.0
            else:
                self.dtin = math.floor((tin - self.tin) * 8388608 / 16) / 8388608
                self.dpad = math.floor((pad - self.pad) * 8388608 / 16) / 8388608
            self.khp = fl24(min(pos / 8388608, 0.125) * c['KHP8'])
        self.gl = min(2 * t['T_GLH'][k[9]], self.TOP)
        self.gh = min(2 * t['T_GLH'][k[10]], self.TOP)

    def desk(self, y):
        """The desk stage, one sample; the scalings are bd909.asm step 9's."""
        c = self.c
        clip = lambda v: max(-1.0, min(self.TOP, v))
        sat = lambda v: clip(v) - c['KSAT'] * clip(v) ** 5
        self.hps += self.khp * (fl24(y) - fl24(self.hps))
        self.tin += self.dtin
        x = sat(32 * self.tin * fl24(clip(y - fl24(self.hps))))
        self.lb = fl24(self.lb + c['KB'] * (fl24(x) - self.lb))
        rest2 = (x - self.lb) / 2
        self.m2 = fl24(self.m2 + c['KM'] * (fl24(rest2) - self.m2))
        high2 = fl24(rest2 - self.m2)
        acc = c['KMS'] * self.m2 + self.gl * self.lb + 2 * self.gh * high2
        self.pad += self.dpad
        y = clip(2 * self.pad * fl24(sat(16 * acc)))
        return clip(self.output_gain * fl24(y)) if self.output_gain != 1 else y


if __name__ == '__main__':
    t, c, lists, meta = tables()
    print(f"A max {meta['a_max']:.1f} Hz, K_A {meta['k_inc']:.4f}, noise rms {NOISE_RMS:.4f}, "
          f"walk {len(WALK)} words, block {max(OFF.values()) + 1}")
    for k in ('K_BODY', 'NREL', 'FRAC', 'U0', 'NHOLD', 'KW16', 'KU16'):
        print(k, c[k])
