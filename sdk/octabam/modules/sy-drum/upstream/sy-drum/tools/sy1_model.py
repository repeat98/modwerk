#!/usr/bin/env python3
"""sy1_model.py -- float reference model of the SY DRUM machine, the design
implemented literally (numpy only). It is the oracle the emulator measurements
are compared against, so every constant below is the one the design study names (its
numbered facts, D = documented, I = inferred, are kept in the author's development tree).

    render(page, seconds, sr=44100) -> np.ndarray, float, +-1.0 = the engine's
    Q14 full scale (0x4000: -6 dBFS at the DSP), one hit at t = 0 unless
    page["trigs"] lists trigger times in seconds.

page = raw page bytes exactly as the Part stores them:
    PTCH 0..127 (64 = 0 semitones = C4), MODE 0..5 (A..F), WDTH 0..127,
    SWEP 0..127 (64 = off; below 64 = DOWN: the hit starts ABOVE PTCH and
    falls to it, above 64 = UP; one raw unit = one semitone of start offset),
    SPED 0..127 (0 = fastest), DEC 0..127.
Control runs at the engine's frame rate (16 samples): envelopes step once a
frame, the per-sample increments / gains / filter coefficients ramp linearly
across the frame, as poly.s does for the FM voice (BUILD 38's ramps).

CLI: python3 sy1_model.py [--mode A] [--ptch 0] [--wdth 64] [--swep 0]
     [--sped 64] [--dec 64] [--seconds 1.0] [--wav out.wav] [--quiet]
     --ptch / --swep are SIGNED (page value - 64); the others raw.
"""
import sys
import numpy as np

FRAME = 16
C4 = 261.6256
F_MAX_CYC = 0x73000000 / 2 ** 32      # D: the engine's INC_MAX, 0.449 cycle/sample (19.8 kHz)
# ---- the model's constants (D = documented, I = inferred; the design study's facts #) ----
OFF2_OCT = np.log2(450.0 / 440.0)    # I (#12): VCO2 sits 39 cents above VCO1 (MSW calibration)
C_OFF2_OCT = 1.0                     # I (#6/#7): VCO2 "set to a higher frequency" in C, D, E
E_VCF_OCT = 1.0                      # I (#8): the VCF "set to a higher cutoff" in E
FM_OCT = 1.5                         # I (#5): VCO1 -> VCO2 exponential FM, octaves at the triangle's peak
D_OCT = 2.0                          # I (#7): EG2 -> VCO2 pitch in D, octaves at the envelope's peak
D_EG2_BOTH = False                   # unknown U3: SY-4X says EG2 drives both VCOs in D; Bergfors says VCO2 only
N_RISE = 16                          # I (#8): mode E rise is N_RISE x faster than the fall (pseudo-saw)
C_MIX1 = 0.5                         # I (#6): VCO1 "at reduced level" in C: -6 dB
SWEEP_SEMI = 1.0                     # design: one SWEP unit = one semitone of start offset
SPEED_MIN, SPEED_MAX = 0.020, 1.1    # I (#14): EG1 time constant, SPED 0 .. 127
DEC_MIN, DEC_MAX = 0.006, 2.5        # D (#16): EG2 time constant at C4, DEC 0 .. 127
DECAY_TUNE_EXP = 0.5                 # I (#17): tau2 *= (f_bus / C4) ** -0.5: an octave up = 0.71 x
F1_0 = 400.0                         # I (#19): pole-1 C4 base before the WIDTH closing offset (1 Oct 2026)
POLE_RATIO = 4.0                     # D (#19): pole 2 / pole 1 at rest
CV_RATIO = 2.13                      # D (#19): pole 2 moves 2.13 x the octaves of pole 1
WIDTH_OCT = 6.0                      # I (#20): WDTH 127 lifts pole 1 by 6 octaves at EG2 = 1
CLOSE_OCT = 3.0                      # extension of 1 Oct 2026: WDTH 0 lowers both poles 3 octaves; 127 unchanged
MODES = "ABCDEF"


def tri(u):
    """The 4069 triangle core: u = phase in cycles [0, 1); -1 at 0, +1 at 1/2."""
    return 1.0 - 4.0 * abs((u % 1.0) - 0.5)


def pseudo_saw(u):
    """Mode E's VCO2: the rise squeezed into 1/(N_RISE+1) of the cycle (#8)."""
    u = u % 1.0
    r = 1.0 / (N_RISE + 1)
    return -1.0 + 2.0 * u / r if u < r else 1.0 - 2.0 * (u - r) / (1.0 - r)


def lcg_noise(n, seed=0x12345678):
    """Mode F: the firmware's 32-bit LCG, the top 15 bits as Q14 white (#10)."""
    out = np.empty(n)
    x = seed & 0xFFFFFFFF
    for i in range(n):
        x = (x * 1664525 + 1013904223) & 0xFFFFFFFF
        out[i] = ((x >> 17) - 16384) / 16384.0
    return out


def lp_coef(f, sr):
    """One-pole coefficient as the ColdFire computes it: g = w / (1 + w) (#21);
    poles share the frequency helper's 0.5 Hz floor; a pole at or above F_MAX
    (the engine's 19.8 kHz clamp) bypasses the stage (g = 1)."""
    f = max(0.5, f)
    if f >= F_MAX_CYC * sr:
        return 1.0
    w = 2.0 * np.pi * f / sr
    return w / (1.0 + w)


def tau_sweep(sped):
    """SPED 0 = 20 ms, 127 = 1.1 s, exponential between (#14)."""
    return SPEED_MIN * (SPEED_MAX / SPEED_MIN) ** (sped / 127.0)


def tau_decay(dec, f_bus):
    """DEC 0 = 6 ms, 127 = 2.5 s at C4; shorter as the tune bus rises (#16, #17)."""
    t = DEC_MIN * (DEC_MAX / DEC_MIN) ** (dec / 127.0)
    return t * (f_bus / C4) ** (-DECAY_TUNE_EXP)


def clamp_f(f, sr):
    return float(min(max(f, 0.5), F_MAX_CYC * sr))


def render(page, seconds, sr=44100):
    ptch = int(page.get("PTCH", 64)); mode = min(max(int(page.get("MODE", 0)), 0), 5)
    wdth = int(page.get("WDTH", 64)); swep = int(page.get("SWEP", 64))
    sped = int(page.get("SPED", 64)); dec = int(page.get("DEC", 64))
    trigs = sorted(set(int(round(t * sr)) // FRAME for t in page.get("trigs", [0.0])))
    n = int(round(seconds * sr)); nfr = (n + FRAME - 1) // FRAME
    out = np.zeros(nfr * FRAME)
    noise = lcg_noise(nfr * FRAME) if mode == 5 else None
    semis = ptch - 64                                   # the pitch word: semitones from C4
    start_oct = -(swep - 64) * SWEEP_SEMI / 12.0        # the sweep's start offset, octaves
    tau1 = tau_sweep(sped)
    k1 = np.exp(-FRAME / (sr * tau1))
    e1 = e2 = 0.0                                       # EG1 (sweep), EG2 (decay): 0 before the first hit
    ph1 = ph2 = 0.0                                     # a cold start: both phases at 0
    y1 = y2 = 0.0                                       # the VCF's two integrators
    inc1 = inc2 = amp = g1 = g2 = 0.0                   # last frame's control values (ramped from)
    for fr in range(nfr):
        if fr in trigs:                                 # the trigger pulse: both EG capacitors recharged
            e1 = e2 = 1.0
        else:
            e1 *= k1
            e2 *= np.exp(-FRAME / (sr * tau_decay(dec, C4 * 2 ** cv_bus))) if fr else 1.0
        sweep_oct = start_oct * e1
        cv_bus = semis / 12.0 + sweep_oct               # the tune bus: TUNE (+LFO on PTCH) + sweep (#13)
        cv2 = semis / 12.0 + OFF2_OCT                   # VCO2: its trimmer offset ...
        if mode in (2, 3, 4):
            cv2 += C_OFF2_OCT                           # ... raised in C, D, E
        if mode != 3:
            cv2 += sweep_oct                            # the bus sweep (not in D: Bergfors, #7)
        cv1 = cv_bus
        if mode == 3:
            cv2 += D_OCT * e2                           # D: EG2 bends VCO2
            if D_EG2_BOTH:
                cv1 += D_OCT * e2
        f1 = clamp_f(C4 * 2 ** cv1, sr)
        f2 = clamp_f(C4 * 2 ** cv2, sr)
        if mode == 4:
            f2 = clamp_f(f2 * 2.0 * N_RISE / (N_RISE + 1), sr)   # E: the pseudo-saw cycles ~2x (#8)
        cv_vcf = cv_bus + WIDTH_OCT * (wdth / 127.0) * e2 + (E_VCF_OCT if mode == 4 else 0.0)
        close = CLOSE_OCT * (1.0 - wdth / 127.0)
        p1 = F1_0 * 2 ** (cv_vcf - close)
        p2 = POLE_RATIO * F1_0 * 2 ** (CV_RATIO * cv_vcf - close)
        t_inc1, t_inc2, t_amp = f1 / sr, f2 / sr, e2
        t_g1, t_g2 = lp_coef(p1, sr), lp_coef(p2, sr)
        if fr == 0:
            inc1, inc2, amp, g1, g2 = t_inc1, t_inc2, t_amp, t_g1, t_g2
        for i in range(FRAME):                          # the ramps: linear across the frame
            a = (i + 1) / FRAME
            ci1 = inc1 + (t_inc1 - inc1) * a; ci2 = inc2 + (t_inc2 - inc2) * a
            ca = amp + (t_amp - amp) * a
            cg1 = g1 + (t_g1 - g1) * a; cg2 = g2 + (t_g2 - g2) * a
            ph1 = (ph1 + ci1) % 1.0
            w1 = tri(ph1)
            if mode in (1, 4):                          # B, E: VCO1 FMs VCO2 through its exp converter (#5)
                ci2 = min(ci2 * 2 ** (FM_OCT * w1), F_MAX_CYC)
            ph2 = (ph2 + ci2) % 1.0
            idx = fr * FRAME + i
            if mode == 0:
                x = w1
            elif mode == 1:
                x = tri(ph2)
            elif mode == 2:
                x = (C_MIX1 * w1 + tri(ph2)) / (1.0 + C_MIX1)   # the sums are normalised to +-1
            elif mode == 3:
                x = 0.5 * (w1 + tri(ph2))                      # (one voice never exceeds Q14 full scale)
            elif mode == 4:
                x = pseudo_saw(ph2)
            else:
                x = noise[idx]
            y1 += cg1 * (x - y1)                        # the two spread real poles (#19, #21)
            y2 += cg2 * (y1 - y2)
            out[idx] = y2 * ca                          # EG2 -> the VCA, linear (#18)
        inc1, inc2, amp, g1, g2 = t_inc1, t_inc2, t_amp, t_g1, t_g2
    return out[:n]


# ---- measurements the acceptance tests reuse ---------------------------------------
def fundamental(x, sr, lo=20.0, hi=20000.0):
    """The strongest spectral line between lo and hi, parabolic-interpolated, Hz."""
    n = len(x); w = np.hanning(n)
    s = np.abs(np.fft.rfft(x * w)); f = np.fft.rfftfreq(n, 1.0 / sr)
    m = (f >= lo) & (f <= hi); s = np.where(m, s, 0.0)
    k = int(np.argmax(s))
    if 0 < k < len(s) - 1 and s[k] > 0:
        a, b, c = np.log(s[k - 1] + 1e-20), np.log(s[k] + 1e-20), np.log(s[k + 1] + 1e-20)
        k = k + 0.5 * (a - c) / (a - 2 * b + c)
    return k * sr / n


def env_db(x, sr, win=0.005):
    """RMS envelope in dB (re 1.0) over win-second windows."""
    w = max(1, int(win * sr)); n = len(x) // w
    r = np.sqrt(np.mean(x[: n * w].reshape(n, w) ** 2, axis=1) + 1e-20)
    return 20 * np.log10(r), (np.arange(n) + 0.5) * w / sr


def band_db(x, sr, lo=100.0, hi=10000.0):
    """Third-octave band levels, dB, between lo and hi (for the mode F / VCF tests)."""
    n = len(x); s = np.abs(np.fft.rfft(x * np.hanning(n))) ** 2; f = np.fft.rfftfreq(n, 1.0 / sr)
    edges = lo * 2 ** (np.arange(0, np.log2(hi / lo) + 1e-9, 1 / 3))
    lv = []
    for e in edges:
        m = (f >= e / 2 ** (1 / 6)) & (f < e * 2 ** (1 / 6))
        lv.append(10 * np.log10(np.mean(s[m]) + 1e-30) if m.any() else np.nan)
    return np.array(edges), np.array(lv)


def write_wav(path, x, sr):
    import wave
    y = np.clip(x, -1, 1) * 32767
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(y.astype("<i2").tobytes())


def main(argv):
    args = {"mode": "A", "ptch": 0, "wdth": 64, "swep": 0, "sped": 64, "dec": 64,
            "seconds": 1.0, "wav": None, "quiet": False, "sr": 44100}
    it = iter(argv)
    for a in it:
        k = a.lstrip("-")
        if k == "quiet":
            args[k] = True
        elif k in args:
            args[k] = next(it)
    sr = int(args["sr"])
    page = {"PTCH": 64 + int(args["ptch"]), "MODE": MODES.index(args["mode"].upper()),
            "WDTH": int(args["wdth"]), "SWEP": 64 + int(args["swep"]),
            "SPED": int(args["sped"]), "DEC": int(args["dec"])}
    x = render(page, float(args["seconds"]), sr)
    if args["wav"]:
        write_wav(args["wav"], x, sr)
    if not args["quiet"]:
        semis = page["PTCH"] - 64
        print("mode %s PTCH %+d WDTH %d SWEP %+d SPED %d DEC %d: %d samples, peak %.3f"
              % (args["mode"].upper(), semis, page["WDTH"], page["SWEP"] - 64, page["SPED"],
                 page["DEC"], len(x), np.abs(x).max()))
        seg = x[int(0.05 * sr): int(0.05 * sr) + 2 ** 15]
        f0 = fundamental(seg, sr)
        print("  strongest line 50 ms on: %.2f Hz (C4 * 2^(PTCH/12) = %.2f Hz, %+.1f cents)"
              % (f0, C4 * 2 ** (semis / 12), 1200 * np.log2(f0 / (C4 * 2 ** (semis / 12)))))
        db, t = env_db(x, sr)
        i20 = np.argmax(db < db.max() - 20) if (db < db.max() - 20).any() else -1
        print("  envelope: peak %.1f dB, -20 dB at %.0f ms (tau2 at C4 = %.1f ms)"
              % (db.max(), t[i20] * 1000 if i20 >= 0 else -1, tau_decay(page["DEC"], C4) * 1000))
    return x


if __name__ == "__main__":
    main(sys.argv[1:])
