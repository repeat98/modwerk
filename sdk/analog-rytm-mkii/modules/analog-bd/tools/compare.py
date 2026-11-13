#!/usr/bin/env python3
"""Compare the Rytm's fixed-point voices (src/ab_dsp.c, built for the host)
with repeat98's float references (dsp808.Voice, dsp909.Voice) at 48 kHz.

    python3 -B tools/compare.py [--wav DIR] [--p24]

For each scenario prints the residual (reference minus C) in dB below the
reference's peak. --wav writes both renders as 48 kHz WAVs for listening.
The 909's reference runs 16 samples a call, as the engine steps its control, with
its phase at 32 bits (phase32; --p24 for the model's own 24). Known residuals:
the 808 at velocity 127 and LOW 90 in its first three samples (-23 dB, as before
0.1.7), the 909 after a retrig while its noise filters settle (the engine rests
them between hits, the model runs them: -49 dB at defaults, -35 dB at ATK and
ACNT 127, for about 1 ms), and the model's
other 24-bit words late in long hits (-41 dB at DECAY 127)."""
import array
import inspect
import math
import pathlib
import subprocess
import sys
import tempfile
import textwrap
import wave

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import gen_tables  # noqa: E402

gen_tables.set_rate()
dsp808, dsp909 = gen_tables.dsp808, gen_tables.dsp909


def phase32():
    """dsp909.Voice with its phase and sweep kept to 32 bits, as the engine keeps them.

    The model truncates both to the Octatrack DSP's 24 bits each sample, which lowers its
    pitch by up to 1.4e-4 (0.24 cent): over a long hit the waves drift apart by a few
    samples and the residual measures the drift, not the engine. With this the residual
    is the engine's own (and the model's other 24-bit words). --p24 keeps the model as it is."""
    src = inspect.getsource(dsp909.Voice.sample)
    for a, b in (('word = (math.floor(self.u * 8388608) + math.floor(inc * 8388608)) & 0xffffff',
                  'word = (math.floor(self.u * 2 ** 31) + math.floor(inc * 2 ** 31)) & 0xffffffff'),
                 ('self.u = _signed(word)', 'self.u = (word - 2 ** 32 if word >> 31 else word) / 2 ** 31'),
                 ('cell, frac = (word ^ 0x800000) >> 17, (word & 0x1ffff) / 131072',
                  'cell, frac = (word ^ 0x80000000) >> 25, (word & 0x1ffffff) / 2 ** 25'),
                 ('self.ep = fl24(self.ep - self.ep * self.dkp)', 'self.ep = self.ep - self.ep * self.dkp')):
        assert src.count(a) == 1, f'dsp909.Voice.sample changed: {a}'
        src = src.replace(a, b)
    ns = {}
    exec(textwrap.dedent(src), vars(dsp909), ns)
    return type('Voice32', (dsp909.Voice,), {'sample': ns['sample']})


VOICE909 = dsp909.Voice if '--p24' in sys.argv else phase32()

# model, PTCH DCAY TONE ATK SWEP ACNT LOW HIGH, blocks, retrig block
SCENARIOS = [
    ('808 default', 0, (64, 80, 80, 64, 64, 100, 64, 64), 1500, -1),
    ('808 long low', 0, (20, 127, 30, 127, 127, 127, 90, 40), 3000, -1),
    ('808 short high', 0, (110, 10, 127, 0, 0, 40, 30, 100), 600, -1),
    ('808 retrig', 0, (64, 80, 80, 64, 64, 100, 64, 64), 1200, 300),
    ('909 default', 1, (64, 80, 80, 64, 64, 100, 64, 64), 1500, -1),
    ('909 TUNE 0 ATK 127', 1, (49, 80, 0, 127, 64, 127, 64, 64), 1500, -1),
    ('909 TUNE 127 soft', 1, (49, 60, 127, 0, 127, 20, 64, 64), 1500, -1),
    ('909 long LOW HIGH', 1, (30, 127, 64, 64, 30, 100, 110, 110), 3000, -1),
    ('909 retrig', 1, (64, 80, 80, 64, 64, 100, 64, 64), 1200, 200),
    ('909 high short LOW 0', 1, (127, 0, 127, 127, 127, 127, 0, 127), 600, 100),
    ('909 low long soft', 1, (0, 127, 0, 0, 0, 20, 127, 0), 3000, -1),
]


def render_c(exe, model, kn, blocks, retrig):
    raw = subprocess.run([exe, str(model), *map(str, kn), str(blocks), str(retrig)],
                         check=True, capture_output=True).stdout
    return [v / 2 ** 31 for v in array.array('i', raw)]


def render_py(model, kn, blocks, retrig):
    p, d, t, a, s, acc, lo, hi = kn
    k = [p, d, t, a, s, 0, model, 1, acc, lo, hi, 127]   # SAT 0, FIXD on, LPF off
    v = VOICE909(quantized=False) if model else dsp808.Voice()
    out = []
    for b in range(blocks):
        trig = 0 if b in (0, retrig) else None
        if model:   # the 909 steps its control every 16 samples, as on the Octatrack
            out += v.block(k, trig=trig, frames=16) + v.block(k, frames=16)
        else:
            out += v.block(k, trig=trig, frames=32)
    return out


def write_wav(path, xs):
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(48000)
        w.writeframes(array.array('h', (max(-32768, min(32767, round(x * 32767))) for x in xs)).tobytes())


def main():
    wav_dir = pathlib.Path(sys.argv[sys.argv.index('--wav') + 1]) if '--wav' in sys.argv else None
    with tempfile.TemporaryDirectory() as tmp:
        exe = pathlib.Path(tmp) / 'host_render'
        subprocess.run(['cc', '-O2', '-DMW_DSP_HOST', '-I', str(HERE.parents[3] / 'machines' / 'analog-rytm-mkii' / 'include'), '-Wall', '-Wextra', '-fsanitize=undefined',
                        '-fno-sanitize-recover=undefined', '-o', str(exe),
                        str(HERE / 'host_render.c'), str(HERE.parent / 'src' / 'ab_dsp.c')], check=True)
        worst = -999.0
        for name, model, kn, blocks, retrig in SCENARIOS:
            c = render_c(str(exe), model, kn, blocks, retrig)
            r = render_py(model, kn, blocks, retrig)
            peak = max(abs(x) for x in r) or 1
            err = max(abs(a - b) for a, b in zip(c, r))
            rms = math.sqrt(sum((a - b) ** 2 for a, b in zip(c, r)) / len(r))
            db, rdb = 20 * math.log10(err / peak + 1e-12), 20 * math.log10(rms / peak + 1e-12)
            # The reference truncates its phase to 24 bits, this code keeps 32: the waves drift
            # apart slowly, so also compare the level, block by block (32 samples, RMS).
            env = lambda xs: [math.sqrt(sum(v * v for v in xs[i:i + 32]) / 32) for i in range(0, len(xs), 32)]
            lvl = max(abs(a - b) for a, b in zip(env(c), env(r)))
            ldb = 20 * math.log10(lvl / peak + 1e-12)
            worst = max(worst, db)
            print(f'{name:22s} peak {peak:6.3f}  max err {db:7.1f} dB  rms err {rdb:7.1f} dB  level err {ldb:7.1f} dB')
            if wav_dir:
                wav_dir.mkdir(parents=True, exist_ok=True)
                slug = name.replace(' ', '-')
                write_wav(wav_dir / f'{slug}-c.wav', c)
                write_wav(wav_dir / f'{slug}-ref.wav', r)
        print(f'worst max error {worst:.1f} dB below peak')
        return worst


if __name__ == '__main__':
    main()
