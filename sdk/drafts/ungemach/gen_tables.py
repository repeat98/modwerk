"""UNGEMACH's laws, written once: tables.h. Run after a change: `python3 -B gen_tables.py`. SR is 44,100 Hz. Every
number the engine uses is here, with what it does."""
import math
import pathlib
import random

SR = 44100.0
HERE = pathlib.Path(__file__).parent

# PTCH (SRC A, stock PTCH's byte 4..124): the drone's root, two steps a semitone, A1 (55 Hz) at ROOT_AT: one octave
# down to 27.5 Hz, four up to 880 Hz
ROOT_HZ, ROOT_AT, STEPS_PER_SEMITONE = 55.0, 28, 2
# the voices: VOICES oscillators, half left and half right, in three groups (the root, DISS's second and third ratio),
# each SPREAD_CENTS apart in its group, each drifting on its own by up to VOICE_DRIFT_CENTS; and SUBS an octave under
# the root, SUB_CENTS apart, at SUB_LEVEL of a voice, one mip softer
VOICES = 16
SUB_CENTS = (-3, 2, 3, -2)
SUB_LEVEL = 0.7
# WAVE (SRC D): WAVES waveforms of our own, made once from random harmonics (WAVE_SEED), sorted dull to shrill and
# crossfaded; each kept band-limited at MIPS harmonic counts, so none aliases: a voice plays the richest whose top
# harmonic stays under MIP_TOP_HZ
# Then HARSH more, past the harshest of those: little fundamental, loud high harmonics, gaps and metallic clusters,
# their own seed, sorted the same way; then the choir: six vowels, UH OH AH AE EH IH, a glottal source through each
# vowel's three formants, laid out for a voice at VOWEL_HZ.
SOFT, HARSH, WAVE_LEN, WAVE_SEED = 16, 10, 256, 20261112
VOWEL_HZ = 110.0
VOWELS = [(300, 870, 2240), (450, 800, 2600), (730, 1090, 2440), (660, 1720, 2410), (530, 1840, 2480), (270, 2290, 3010)]
FORMANT_BW, FORMANT_GAIN = (90.0, 110.0, 170.0), (1.0, 0.6, 0.3)
WAVES = SOFT + HARSH + len(VOWELS)
MIPS = (64, 32, 16, 8, 4, 2)
# each mip kept at MIP_LEN samples (and its first again), four or more a harmonic; the engine draws it out to
# WAVE_LEN when it makes a voice's waveform. Room: a module's image and bss share 128 KiB.
MIP_LEN = (256, 256, 64, 64, 64, 64)
MIP_TOP_HZ = 16000.0
WAVE_RMS = 0.42
# each wave's trim to one loudness through the drone, measured by calib_waves.c (add its output to these), in the
# order the waves are made (soft, harsh, choir); each moves with its wave when they are sorted
WAVE_TRIM_DB = (-0.81, -0.86, -0.88, -0.82, -0.85, -0.88, -0.80, -0.80, -0.89, -0.83, 0.28, -1.11, 0.73, 1.77, 1.28, 5.49,
                5.18, 6.46, 8.6, 7.98, 6.89, 9.79, 8.28, 9.24, 6.97, 10.3,
                -1.23, -1.86, -0.08, -1.26, -1.49, -0.92)
# WAVE's order by ear (the user, 22 November 2026): the second harsh wave, a narrow band of harmonics 12 to 15 and
# no fundamental, whistles far shriller than its place at WAVE 70; it goes after wave 14, to WAVE 102
WAVE_BY_EAR = ((17, 14),)
# PNCH (SETUP F): the body's time constant, PUNCH_MS[0] at a low PNCH to PUNCH_MS[1] at its top, rising fast at first
# (1 - (1 - x)^2; the user, 22 November 2026: longer sooner, 25 ms was too short), as a fall a frame of 16 samples
PUNCH_MS = (35.0, 55.0)
# SPRD (SETUP E): the stereo width, MONO NARW WIDE FULL, as the side's share
WIDTHS = (0.0, 0.3, 0.6, 1.0)
SPREAD_CENTS = 9.0
VOICE_DRIFT_CENTS = 14.0
# DISS (SRC B): the second and third groups' ratios to the root, in cents. DISS 0 is unison, every group on the root
# (only the voices' spread between them), the clean start; from there a row of dissonant stations, each a plateau of several steps on which each ratio moves by
# PLATEAU_CENTS (the beating changing as it goes), joined by legs that glide at most about LEG_CENTS a step, so
# no step jumps and the consonances a leg passes slide by. The stations sit next to their neighbours, so no leg is long, and they end
# on the scream far above. Through the waypoints a monotone cubic a ratio, so nothing overshoots and nothing stands.
# The stations rise by where the chord's weight sits (the mean of its sixteen voices in cents: root 6, second 5, third
# 5), so the pitch one hears as the drone's own climbs with DISS (the user, 22 November 2026: it rose and fell).
DISS_START = (0, 0)
DISS_STATIONS = [('a quarter tone above and below', 50, -50),
                 ('a semitone above and below', 100, -100),
                 ('a semitone and a whole tone above', 100, 200),
                 ('a quarter-sharp tritone and a semitone under', 650, -100),
                 ('major seventh and minor second', 1100, 100),
                 ('minor ninth and a semitone under', 1300, -100),
                 ('two tritones a quarter tone apart', 650, 600),
                 ('major seventh and a quarter-sharp tritone', 1100, 650),
                 ('octave and fifth', 1200, 702),
                 ('minor ninth and a quarter-sharp tritone', 1300, 650),
                 ('minor ninth and major seventh', 1300, 1100),
                 ('a minor ninth and a major seventh an octave up', 2300, 1300),
                 ('a semitone either side of two octaves', 2500, 2300),
                 ('the scream', 2669, 3041)]
PLATEAU_CENTS, START_STEPS = 60.0, 3.0
LEG_MIN, LEG_CENTS = 2.0, 150.0       # a leg's steps: LEG_CENTS of its longer move a step, at least LEG_MIN


def _diss_way():
    """the waypoints (step, cents of the second, cents of the third): a plateau a station, short legs between"""
    # each ratio moves across its plateau the way the path goes on (from the station before to the one after), so it
    # rarely turns, and where it does the other ratio still moves
    half, at = PLATEAU_CENTS / 2, [DISS_START] + [s[1:] for s in DISS_STATIONS]
    pts = []
    for j in range(1, len(at)):
        after = at[j + 1] if j + 1 < len(at) else (2 * at[j][0] - at[j - 1][0], 2 * at[j][1] - at[j - 1][1])
        d = [1 if after[k] > at[j - 1][k] else -1 if after[k] < at[j - 1][k] else (1, -1)[k] for k in (0, 1)]
        pts.append((at[j][0] - d[0] * half, at[j][1] - d[1] * half, at[j][0] + d[0] * half, at[j][1] + d[1] * half))
    legs = [START_STEPS] + [max(LEG_MIN, max(abs(b[0] - a[2]), abs(b[1] - a[3])) / LEG_CENTS)
                            for a, b in zip(pts, pts[1:])]
    plateau = (127.0 - sum(legs)) / len(pts)
    way, at = [(0.0,) + DISS_START], 0.0
    for leg, p in zip(legs, pts):
        at += leg
        way.append((at, p[0], p[1]))
        at += plateau
        way.append((at, p[2], p[3]))
    return way


DISS_WAY = _diss_way()


def _pchip(xs, ys, x):
    """Fritsch-Carlson monotone cubic through (xs, ys) at x"""
    n = len(xs)
    d = [(ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) for i in range(n - 1)]
    m = [d[0]] + [0.0 if d[i - 1] * d[i] <= 0 else
                  3 * (xs[i + 1] - xs[i - 1]) / ((2 * xs[i + 1] - xs[i] - xs[i - 1]) / d[i - 1] +
                                                  (xs[i + 1] + xs[i] - 2 * xs[i - 1]) / d[i])
                  for i in range(1, n - 1)] + [d[-1]]
    i = 0
    while i < n - 2 and x > xs[i + 1]:
        i += 1
    h = xs[i + 1] - xs[i]
    t = min(1.0, max(0.0, (x - xs[i]) / h))
    return ((2 * t ** 3 - 3 * t * t + 1) * ys[i] + (t ** 3 - 2 * t * t + t) * h * m[i] +
            (-2 * t ** 3 + 3 * t * t) * ys[i + 1] + (t ** 3 - t * t) * h * m[i + 1])


def diss(v, k):
    """DISS's ratio k (0 the second, 1 the third) at v"""
    return 2 ** (_pchip([w[0] for w in DISS_WAY], [w[1 + k] for w in DISS_WAY], float(v)) / 1200)


def diss_places():
    """where each station's plateau starts and ends on DISS"""
    return [('%s (to %d)' % (s[0], round(DISS_WAY[2 * i + 2][0])), round(DISS_WAY[2 * i + 1][0]))
            for i, s in enumerate(DISS_STATIONS)]


# TONE (SRC C): the low-pass's cutoff, 60 Hz to 6 kHz
TONE_LO, TONE_HI = 60.0, 6000.0
# DIRT (SRC D): FM depth (a sine at the third ratio, and the drone's own output, on every voice's phase), resonance
# (Q from Q_CLEAN to Q_DIRTY) and saturation
FM_MAX, FEEDBACK_MAX = 0.35, 0.25          # phase deviation in cycles at DIRT 127
Q_CLEAN, Q_DIRTY = 1.3, 0.16
SAT_CLEAN, SAT_DIRTY = 1.0, 7.0
# movement always at full (no MOVE control); RATE (SRC E): 0..63 free 0.02-2 Hz; 64..127 synced, steps a cycle
MOVE_CENTS, MOVE_OCTAVES, MOVE_LEVEL = 35.0, 2.0, 0.6
FREE_LO, FREE_HI = 0.02, 2.0
SYNC_STEPS = [16, 8, 6, 4, 3, 2]          # machine.c's RATE words; the six spread over 64..127
DRIFT_CENTS, DRIFT_OCTAVES = 6.0, 0.25
# each voice glides to its own drift at its own pace: 2^VGLIDE blocks, fast (about 0.02 s) to slow (0.4 s)
VGLIDE = (7, 11)
DRONE_GAIN, NOISE_LEVEL = 0.45, 0.06


def q12(x):
    return int(round(x * 4096.0))


def inc(hz):
    return int(round(hz / SR * 4294967296.0))


def svf_f(hz):
    return 2.0 * math.sin(math.pi * min(hz, 8000.0) / SR)


def waves():
    """WAVES spectra (each harmonic's level and phase), each with the place it was made at. The first is nearly a sine,
    the rest random in tilt, odd and even balance, gaps and peaks; each group sorted by spectral centroid, then all of
    them by brightness as heard, dull first."""
    rnd = random.Random(WAVE_SEED)
    # one phase per harmonic, shared by every wave, so a crossfade between two never cancels
    phases = [0.0] + [rnd.uniform(0, 2 * math.pi) for _ in range(MIPS[0] - 1)]
    spectra = [[(1.0, phases[0]), (0.18, phases[1]), (0.08, phases[2])] + [(0.0, 0.0)] * (MIPS[0] - 3)]
    for w in range(1, SOFT):
        tilt = 2.2 - 1.8 * w / (SOFT - 1) + rnd.uniform(-0.3, 0.3)
        odd = rnd.uniform(0.2, 1.0)
        peak, width = rnd.randint(3, 40), rnd.uniform(2.0, 10.0)
        lift = rnd.uniform(0.0, 1.5) * w / (SOFT - 1)
        sp = []
        for h in range(1, MIPS[0] + 1):
            a = h ** -tilt * (odd if h % 2 == 0 else 1.0)
            a *= 1.0 + lift * math.exp(-((h - peak) / width) ** 2)
            if h > 1 and rnd.random() < 0.15:
                a *= 0.1
            sp.append((a * rnd.uniform(0.6, 1.0), phases[h - 1]))
        spectra.append(sp)
    def centroid(sp):
        return sum(h * a * a for h, (a, _) in enumerate(sp, 1)) / sum(a * a for a, _ in sp)
    soft = [spectra[0]] + sorted(spectra[1:], key=centroid)
    # the harsh ones: a rising or flat tilt, a weak fundamental, one to three metallic clusters, many gaps
    hr = random.Random(WAVE_SEED + 1)
    harsh = []
    for w in range(HARSH):
        t = w / (HARSH - 1)
        tilt = 0.15 - 1.0 * t + hr.uniform(-0.1, 0.1)
        fund = 0.2 - 0.17 * t
        gaps = 0.2 + 0.35 * t * hr.uniform(0.5, 1.0)
        clusters = [(hr.randint(5, 40), hr.uniform(1.0, 4.0), hr.uniform(3.0, 8.0)) for _ in range(hr.randint(2, 3))]
        sp = []
        for h in range(1, MIPS[0] + 1):
            a = h ** -tilt * (fund if h == 1 else 1.0)
            for c, wd, lift in clusters:
                a *= 1.0 + lift * math.exp(-((h - c) / wd) ** 2)
            if h > 2 and hr.random() < gaps:
                a *= 0.03
            sp.append((a * hr.uniform(0.4, 1.0), phases[h - 1]))
        harsh.append(sp)
    harsh.sort(key=centroid)
    # the choir: a glottal source (falling 6 dB an octave) through three formants, each a resonance in Hz
    choir = []
    for formants in VOWELS:
        sp = []
        for h in range(1, MIPS[0] + 1):
            f = h * VOWEL_HZ
            env = 0.03 + sum(g / (1.0 + ((f - fc) / (bw / 2)) ** 2) for fc, bw, g in zip(formants, FORMANT_BW, FORMANT_GAIN))
            sp.append((env / h, phases[h - 1]))
        choir.append(sp)
    # then all of them in one row from dull to shrill, by brightness as heard: the centre of the energy on a log
    # frequency scale, A-weighted, for a voice at 55 and at 110 Hz; the sine stays first
    def heard(sp):
        def aw(f):
            f2 = f * f
            return (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2))
        c = 0.0
        for f0 in (55.0, 110.0):
            e = [(a * a * aw(h * f0) ** 2, h * f0) for h, (a, _) in enumerate(sp, 1)]
            c += sum(x * math.log2(f) for x, f in e) / sum(x for x, _ in e)
        return c
    made = list(enumerate(soft + harsh + choir))
    row = made[:1] + sorted(made[1:], key=lambda w: heard(w[1]))
    # by ear: a wave the measure places too low, moved to just after another (both by the place they were made at)
    for w, after in WAVE_BY_EAR:
        x = next(e for e in row if e[0] == w)
        row.remove(x)
        row.insert(row.index(next(e for e in row if e[0] == after)) + 1, x)
    print('wave order', [i for i, _ in row])
    return row


def render(sp, top, length=WAVE_LEN):
    out = []
    for n in range(length):
        x = 2 * math.pi * n / length
        out.append(sum(a * math.sin(h * x + ph) for h, (a, ph) in enumerate(sp[:top], 1)))
    return out


def write():
    r = ['/* Generated by gen_tables.py: do not edit. UNGEMACH\'s laws in fixed point. */',
         '#ifndef UNGEMACH_TABLES_H\n#define UNGEMACH_TABLES_H\n#include <stdint.h>']
    r.append('static const int16_t ug_sine[1025] = {' + ', '.join(str(int(round(32767 * math.sin(2 * math.pi * i / 1024)))) for i in range(1025)) + '};')
    r.append('static const uint32_t ug_root_inc[121] = {' + ', '.join(str(inc(ROOT_HZ * 2 ** ((p - ROOT_AT) / (12.0 * STEPS_PER_SEMITONE)))) for p in range(4, 125)) + '};')
    # the voices in runs of one group a side, so a run reads one waveform: left root 3, second 3, third 2; right root 3,
    # second 2, third 3. In a run they sit SPREAD_CENTS apart (0, -1, +1),
    # the right side a third of that higher
    runs = [(0, 3), (1, 3), (2, 2), (0, 3), (1, 2), (2, 3)]
    spread, group = [], []
    for ri, (gi, n) in enumerate(runs):
        offs = (0.0, -1.0, 1.0) if n == 3 else (-0.5, 0.5)
        for j in range(n):
            spread.append(int(round((offs[j] + (0.33 if ri >= 3 else 0.0)) * SPREAD_CENTS)))
            group.append(gi)
    r.append('static const int8_t ug_spread[%d] = {' % VOICES + ', '.join(str(x) for x in spread) + '};   /* cents; voices 0..7 left */')
    r.append('static const uint8_t ug_vgroup[%d] = {' % VOICES + ', '.join(str(x) for x in group) + '};')
    gl = random.Random(WAVE_SEED + 2)
    paces = [VGLIDE[0] + (VGLIDE[1] - VGLIDE[0]) * i // (VOICES - 1) for i in range(VOICES)]
    gl.shuffle(paces)
    r.append('static const uint8_t ug_vglide[%d] = {' % VOICES + ', '.join(map(str, paces)) + '};   /* each voice\'s drift glide, a shift */')
    r.append('#define UG_VOICE_DRIFT %d   /* cents */' % int(VOICE_DRIFT_CENTS))
    r.append('static const int8_t ug_sub_cents[4] = {' + ', '.join(str(x) for x in SUB_CENTS) + '};   /* 0, 1 left */')
    r.append('#define UG_SUB_LEVEL %d   /* Q12 */' % q12(SUB_LEVEL))
    # the waves: [wave][mip][sample], each wave scaled once to WAVE_RMS at its richest, no mip past full scale
    rows, made = [], []
    for wi, sp in waves():
        made.append(wi)
        full = render(sp, MIPS[0])
        # loudness as heard through the drone's filter: the low harmonics count, the top ones barely
        rms = math.sqrt(sum((amp / (1.0 + (h / 12.0) ** 2)) ** 2 / 2 for h, (amp, _) in enumerate(sp, 1)))
        scale = WAVE_RMS / rms * 10 ** (WAVE_TRIM_DB[wi] / 20.0)
        for top, length in zip(MIPS, MIP_LEN):
            m = render(sp, top, length)
            k = min(scale, 0.98 / max(abs(v) for v in render(sp, top)))
            m = [int(round(32767 * k * v)) for v in m]
            rows.append(', '.join(str(v) for v in m + m[:1]))
    r.append('#define UG_WAVES %d' % WAVES)
    r.append('static const uint8_t ug_wave_made[%d] = {' % WAVES + ', '.join(map(str, made)) + '};   /* the wave at each place, as made: the order of WAVE_TRIM_DB (calib_waves.c) */')
    r.append('#define UG_MIPS %d' % len(MIPS))
    r.append('#define UG_WAVE_LEN %d' % WAVE_LEN)
    stride = sum(n + 1 for n in MIP_LEN)
    offs = [sum(n + 1 for n in MIP_LEN[:m]) for m in range(len(MIPS))]
    r.append('#define UG_WAVE_STRIDE %d' % stride)
    r.append('static const uint16_t ug_mip_off[%d] = {' % len(MIPS) + ', '.join(map(str, offs)) + '};')
    r.append('static const uint8_t ug_mip_shift[%d] = {' % len(MIPS) + ', '.join(str(int(math.log2(WAVE_LEN // n))) for n in MIP_LEN) + '};')
    r.append('static const int16_t ug_waves[%d] = {   /* wave * UG_WAVE_STRIDE + ug_mip_off[mip] + sample */' % (WAVES * stride) + ', '.join(rows) + '};')
    # a voice's increment at most for each mip: its top harmonic under MIP_TOP_HZ
    r.append('static const uint32_t ug_mip_inc[%d] = {' % len(MIPS) + ', '.join(str(inc(MIP_TOP_HZ / h)) for h in MIPS) + '};')
    r.append('static const int16_t ug_width[4] = {' + ', '.join(str(q12(w)) for w in WIDTHS) + '};   /* Q12 */')
    r.append('static const uint32_t ug_ratio2[128] = {' + ', '.join(str(int(round(diss(v, 0) * 65536))) for v in range(128)) + '};   /* Q16 */')
    r.append('static const uint32_t ug_ratio3[128] = {' + ', '.join(str(int(round(diss(v, 1) * 65536))) for v in range(128)) + '};   /* Q16 */')
    # a short mip drawn out to the full length: Catmull-Rom weights for the sample a quarter, a half and three
    # quarters of the way between two (Q12; y0 before, y1, y2, y3 after)
    herm = []
    for q in range(4):
        t = q / 4.0
        herm.append([(-t ** 3 + 2 * t * t - t) / 2, (3 * t ** 3 - 5 * t * t + 2) / 2, (-3 * t ** 3 + 4 * t * t + t) / 2, (t ** 3 - t * t) / 2])
    r.append('static const int16_t ug_herm[4][4] = {' + ', '.join('{' + ', '.join(str(q12(w)) for w in row) + '}' for row in herm) + '};   /* Q12 */')
    span = math.log2(TONE_HI / TONE_LO)
    r.append('static const int16_t ug_tone16[128] = {' + ', '.join(str(int(round(16 * span * v / 127))) for v in range(128)) + '};')
    steps = 16 * 9
    r.append('#define UG_CUT_STEPS %d' % steps)
    r.append('static const int16_t ug_svf_f[%d] = {' % steps + ', '.join(str(q12(svf_f(TONE_LO * 2 ** (i / 16.0)))) for i in range(steps)) + '};   /* Q12 */')
    # the low-pass is trapezoidal (TPT) at the oscillators' half rate, once a step: g = tan(pi fc / 22,050) for the same
    # corners, taken from svf_f's coefficient (f = 2 sin(pi fc / 44,100)) so TONE's law stays as it was
    r.append('static const int16_t ug_punch_fall[128] = {' + ', '.join(str(int(round(32768 * math.exp(-16000.0 / SR / (PUNCH_MS[0] + (PUNCH_MS[1] - PUNCH_MS[0]) * (1 - (1 - p / 127.0) ** 2)))))) for p in range(128)) + '};   /* Q15 */')
    r.append('static const int16_t ug_tpt_g[%d] = {' % steps + ', '.join(str(q12(math.tan(2 * math.asin(q12(svf_f(TONE_LO * 2 ** (i / 16.0))) / 4096 / 2)))) for i in range(steps)) + '};   /* Q12 */')
    r.append('static const uint16_t ug_fm[128] = {' + ', '.join(str(int(round(65535 * FM_MAX * (v / 127) ** 1.5))) for v in range(128)) + '};')
    r.append('static const uint16_t ug_fb[128] = {' + ', '.join(str(int(round(65535 * FEEDBACK_MAX * (v / 127) ** 2))) for v in range(128)) + '};')
    r.append('static const int16_t ug_q[128] = {' + ', '.join(str(q12(Q_CLEAN + (Q_DIRTY - Q_CLEAN) * v / 127)) for v in range(128)) + '};   /* Q12 */')
    r.append('static const int16_t ug_sat[128] = {' + ', '.join(str(int(round(16 * (SAT_CLEAN + (SAT_DIRTY - SAT_CLEAN) * v / 127)))) for v in range(128)) + '};   /* Q4 */')
    r.append('static const int16_t ug_sat_gain[128] = {' + ', '.join(str(q12((SAT_CLEAN / (SAT_CLEAN + (SAT_DIRTY - SAT_CLEAN) * v / 127)) ** 0.35)) for v in range(128)) + '};   /* Q12 */')
    r.append('static const uint32_t ug_free_inc[64] = {' + ', '.join(str(inc(FREE_LO * (FREE_HI / FREE_LO) ** (v / 63.0))) for v in range(64)) + '};')
    r.append('static const uint16_t ug_sync_q8[64] = {' + ', '.join(str(int(round(256 * SYNC_STEPS[v * len(SYNC_STEPS) // 64]))) for v in range(64)) + '};   /* steps a cycle, Q8 */')
    r.append('#define UG_MOVE_CENTS %d' % int(MOVE_CENTS))
    r.append('#define UG_MOVE_CUT16 %d' % int(round(16 * MOVE_OCTAVES)))
    r.append('#define UG_MOVE_LEVEL %d    /* Q12 */' % q12(MOVE_LEVEL))
    r.append('#define UG_DRIFT_CENTS %d' % int(DRIFT_CENTS))
    r.append('#define UG_DRIFT_CUT16 %d' % int(round(16 * DRIFT_OCTAVES)))
    r.append('#define UG_CENT %d       /* Q24: ln 2 / 1200 */' % int(round(math.log(2) / 1200 * 16777216)))
    # the output's soft limit above 0.75 of full scale: soft + over * room / (over + room), a step every 128 over
    soft, room = 24575, 32767 - 24575
    r.append('static const int16_t ug_bend[1025] = {' + ', '.join(str(soft + (j * 128 * room) // (j * 128 + room)) for j in range(1025)) + '};')
    r.append('#define UG_DRONE_GAIN %d  /* Q12 */' % q12(DRONE_GAIN))
    r.append('#define UG_NOISE %d       /* Q12 */' % q12(NOISE_LEVEL))
    r.append('#endif')
    (HERE / 'tables.h').write_text('\n'.join(r) + '\n', newline='\n')


if __name__ == '__main__':
    write()
    print('wrote tables.h')
    for name, v in diss_places():
        print('DISS %3d: %s' % (v, name))
