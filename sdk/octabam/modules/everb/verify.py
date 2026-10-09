#!/usr/bin/env python3
"""E-Verb's render gates, through the native builder and dsp_host. Not hardware.

    python3 modules/everb/verify.py            # from sdk/octabam; make check runs it as this module's gate

Needs your own OS 1.40C extraction at out/raw/section_3_MAIN_OS.bin and the patched DSP56300 tools
(vendor/dsp56300). It builds a private image in a temporary folder, as the site builds by default:
the stock code built in and E-Verb in the space of the two stock reverbs it gives up (SPRING REV and
DARK REV; PLATE REV stays). The image, the memory dumps and every render are deleted afterwards.

Gates:
  source       everb.asm is exactly what generate.py writes; init leaves r1/n1/m1 alone
               (verify_initregs.py's scan); cycle_count.py prices the per-sample loop, and four
               instances fit a core's 3120 usable cycles
  placement    E-Verb sits in the given-up reverbs' code on both payloads, ends before PLATE REV's
               helper (93 words at DARK REV+974, as src/engine/assets/stock-dsp-metadata.json records
               it), and the helper's words equal stock
  dry          MIX 0 is the input sample for sample, with every other knob moving and trig splits
  reverb       an impulse, fully wet: the onset follows PRE (7, 42 and 250 ms), the tail decays
               faster at lower DCY and smaller SIZE, and the two channels are decorrelated
  idle         after a noise burst at the defaults the output settles to within one LSB
  isolation    eight instances, four per core, each with its own knobs and input, under
               -guard 0x4000 -guard-shared -dirty 0x5a: no stray write, no clobber, and every
               instance's output is bit-identical to the same instance rendered alone
  garbage      from an instance block pre-filled with garbage (verify_dirtystate.py's four
               fills), silence in is silence out, and with a tone the first 256 blocks peak
               within 1 dB of a zeroed start (verify_knob_clicks.py's garbage start)
  zipper       every continuous knob jumped and turned under a steady tone: no block-rate step
               above -70 dBFS and 6 dB over the knob held still (verify_knob_clicks.py's measure);
               SPD again at cyclic, ergodic and shimmer depths, SIZE under grains, DPTH grains<->shimmer
  splits       a trig split in every block: no hang, and the output follows the unsplit render
  reverse      REV switched every 40 ms: no larger sample step than with REV held off or on
  depth locks  DPTH locked between +63 (shimmer) and -64 (cyclic) every 70 ms at SPD 0/64/127 and
               SIZE 0/64/127: no larger step than with DPTH held at either end (a gliding grain left
               gliding while the cyclic depth rises must never read ahead of its line)
  envelope     EDCY at +63 after a loud burst lengthens the decay but cannot hold the tail: it
               falls by more than 40 dB within 20 s
"""
import array
import contextlib
import importlib
import io
import math
import os
import pathlib
import random
import re
import shutil
import struct
import subprocess
import sys
import tempfile

FOLDER = pathlib.Path(__file__).resolve().parent
ROOT = FOLDER.parents[1]
STOCK = ROOT / 'out/raw/section_3_MAIN_OS.bin'
HOST = ROOT / 'vendor/dsp56300/build/source/dsp_host/dsp_host'
STOCK_META = ROOT.parents[1] / 'src/engine/assets/stock-dsp-metadata.json'
for need, how in ((STOCK, 'your own OS 1.40C MAIN OS: make os, then make recon'),
                  (HOST, 'the patched DSP56300 tools: make setup'),
                  (STOCK_META, "the app's stock DSP metadata: run from a Modwerk checkout's sdk/octabam")):
    if not need.is_file():
        sys.exit(f'[FAIL] everb: missing {need} ({how})')
sys.path[:0] = [str(ROOT / 'tools/build'), str(ROOT / 'tools/harness'), str(ROOT / 'tools/verify'), str(ROOT / 'tools')]
os.environ.update(XBUS='1', SPEC='1', DEV='0', NOROUNDTRIP='0', OCTABAM_STATIC_STOCK='1', OCTABAM_NO_CACHE='1')
os.environ.setdefault('BUILD', '79')
import toolpath  # noqa: E402,F401
import dsp_modmap  # noqa: E402
from remix import registry, stock  # noqa: E402
from remix.schema import Remix  # noqa: E402

dsp_modmap.IMG = STOCK
KNOWN = registry.modules()
MOD = KNOWN['EVERB']
NAMES = [p.name.decode() if p.name else '' for p in MOD.params]
DONORS = ('SPRING REV', 'DARK REV')         # the site's default for E-Verb alone: the fewest, Spring first
PLATE_HELPER = (974, 93)                    # PLATE REV calls these words of DARK REV's code (docs/VERIFICATION.md)
FR = 16
WARM = 256                                  # blocks of silence before a signal: the ring clears in 128 calls
FS = 8388607
STOCK_FX2 = [m.key for m in KNOWN.values() if m.is_stock and m.menu is not None]


def remix_for(donors):
    ids = {m.menu.fx2_id: m.key for m in KNOWN.values() if m.is_stock and m.menu is not None}
    fx1 = [ids[i] for i in stock.fx1_order() if i]
    fx2 = [ids[i] for i in stock._chooser_order(stock.FX2_CHOOSER) if i]
    return registry.with_platform(Remix(name='everb-verify', doc='Private gate image; never flashed.',
                                        modules=tuple(k for k in fx2 if k not in donors) + ('EVERB',),
                                        fx1=tuple(fx1), fallback='NONE'), KNOWN)


def build_image(work, donors=DONORS):
    """The native build in a scratch tree, the composition exporter's way. Returns (image, log)."""
    remix = remix_for(donors)
    registry.remix = lambda _: remix
    tree = work / 'tree'
    tree.mkdir()
    for name in ('modules', 'platform', 'dsp', 'vendor'):
        os.symlink(ROOT / name, tree / name, target_is_directory=True)
    (tree / 'out').mkdir()
    cwd = os.getcwd()
    os.chdir(tree)
    log = io.StringIO()
    try:
        sys.modules.pop('build_bus', None)
        build = importlib.import_module('build_bus')
        build.IMG = STOCK
        build.OUT = work / 'everb.bin'
        with contextlib.redirect_stdout(log):
            build.main()
    finally:
        if 'build' in locals() and build._SCRATCH is not None:
            shutil.rmtree(build._SCRATCH, ignore_errors=True)
        os.chdir(cwd)
    return work / 'everb.bin', log.getvalue()


class Gates:
    def __init__(self):
        self.failed = []

    def check(self, name, ok, detail=''):
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}{': ' + detail if detail else ''}", flush=True)
        if not ok:
            self.failed.append(name)


def knobs(**kw):
    vals = [p.default or 0 for p in MOD.params] + [0] * (12 - len(MOD.params))
    for k, v in kw.items():
        vals[NAMES.index(k)] = v
    return vals


def write_raw(path, frames):
    """frames: list of (L, R) floats -> interleaved int32 (dsp_host -stereo)"""
    a = array.array('i', [0] * (2 * len(frames)))
    for i, (l, r) in enumerate(frames):
        a[2 * i] = max(-FS - 1, min(FS, int(round(l * FS))))
        a[2 * i + 1] = max(-FS - 1, min(FS, int(round(r * FS))))
    path.write_bytes(a.tobytes())
    return path


def read_raw(path):
    a = array.array('i')
    a.frombytes(path.read_bytes())
    return a


class Host:
    """dsp_host on the image's two payloads; E-Verb on FX2 at positions 0..3 of each core."""

    def __init__(self, mems, work):
        import send_probe
        self.mems, self.work, self.n = mems, work, 0
        self.ep = {c: send_probe.entry_points(mems[c], MOD.menu.fx2_id) for c in (0, 1)}

    def run(self, insts, blocks, inputs, extra=(), mems=None):
        """insts: dicts with core, pos, and knobs or paramfile; inputs: one raw per instance.
        Returns (stdout, [interleaved int32 output per instance])."""
        mems = mems or self.mems
        self.n += 1
        out = self.work / f'r{self.n}.raw'
        cmd = [str(HOST), '-mem', str(mems[0]), '-memB', str(mems[1]),
               '-init', ','.join('%x' % self.ep[i['core']][0] for i in insts),
               '-proc', ','.join('%x' % self.ep[i['core']][1] for i in insts),
               '-inst', str(len(insts)), '-core', ','.join(str(i['core']) for i in insts),
               '-alloc', ','.join(str(1 + 2 * i['pos']) for i in insts),
               '-r7', ','.join(str(2 + 3 * i['pos']) for i in insts),
               '-audioidx', ','.join(str(k) for k in range(len(insts))), '-audio', '9000',
               '-in', ','.join(str(p) for p in inputs), '-stereo',
               '-frames', str(FR), '-blocks', str(blocks), '-out', str(out)]
        for i in insts:
            cmd += ['-params', ','.join(map(str, i.get('knobs', knobs())))]
        for i in insts:
            if 'paramfile' in i:
                cmd += ['-paramfile', str(i['paramfile'])]
        cmd += list(extra)
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        if r.returncode or 'HANG' in r.stdout:
            raise RuntimeError(f'dsp_host failed ({r.returncode}):\n{r.stdout[-3000:]}{r.stderr[-1000:]}')
        outs = [read_raw(out if k == 0 else pathlib.Path(f'{out}.i{k}')) for k in range(len(insts))]
        for p in [out] + [pathlib.Path(f'{out}.i{k}') for k in range(1, len(insts))]:
            p.unlink(missing_ok=True)
        return r.stdout, outs


def mem_words(mem, space, lo, hi):
    """The words a .mem dump writes to [lo, hi) of a space, last writer wins."""
    blob, pos, words = mem.read_bytes(), 0, {}
    while pos + 9 <= len(blob):
        sp, addr, cnt = struct.unpack_from('<BII', blob, pos)
        pos += 9
        if sp == 0xff:
            break
        if sp == space and addr < hi and lo < addr + cnt:
            for a in range(max(lo, addr), min(hi, addr + cnt)):
                words[a] = struct.unpack_from('<I', blob, pos + 4 * (a - addr))[0]
        pos += 4 * cnt
    return [words.get(a) for a in range(lo, hi)]


def dbfs(v):
    return 20 * math.log10(max(abs(v), 1) / (FS + 1))


def gate_source(g):
    r = subprocess.run([sys.executable, str(FOLDER / 'generate.py'), '--check'], capture_output=True, text=True)
    g.check('source: everb.asm is generate.py\'s output', r.returncode == 0, (r.stdout + r.stderr).strip())
    import verify_initregs
    src = (FOLDER / 'everb.asm').read_text()
    block = verify_initregs.init_block(src)
    g.check('source: init leaves r1/n1/m1 alone', bool(block) and not verify_initregs.WRITE.search(block))
    remix = Remix(name='everb-verify', doc='cycle count', modules=('EVERB',), fallback='NONE')
    registry.remix = lambda _: remix
    import cycle_count
    row = cycle_count.measure('everb')
    same = cycle_count.verify('everb', row)
    per = row['cycles']
    g.check('source: static cycles', same and 4 * per <= cycle_count.USABLE,
            f'{per} cycles/sample per instance (worst arm), 4 per core = {4 * per} of {cycle_count.USABLE}; marker no-op {same}')
    return per


def gate_placement(g, log, mems, stock_mems):
    import json
    meta = json.loads(STOCK_META.read_text())
    for tag, core in (('A', 0), ('B', 1)):
        sec = log.split(f'-- payload {tag} --')[1].split('-- payload')[0]
        m = re.search(r'EVERB\s+P:0x([0-9a-f]+)\.\.0x([0-9a-f]+) \((\d+) words\)', sec)
        reg = re.search(r'region P:0x([0-9a-f]+)\.\.0x([0-9a-f]+) \((\d+) words\)', sec)
        if not m or not reg:
            g.check(f'placement: payload {tag}', False, 'no EVERB or region line in the build log')
            continue
        lo, end, words = int(m[1], 16), int(m[2], 16), int(m[3])    # build_bus prints both ends exclusive
        r_lo, r_end = int(reg[1], 16), int(reg[2], 16)
        dark_lo = r_end - 1067                                     # DARK REV is the last given-up reverb in the region
        h_lo, h_end = dark_lo + PLATE_HELPER[0], dark_lo + PLATE_HELPER[0] + PLATE_HELPER[1]
        payload = next(p for p in meta['payloads'] if p['tag'] == tag)
        helper = next(r for r in payload['shared'] if r['owner'] == 'DARK REV')
        known = (helper['sourceAddress'], helper['sourceAddress'] + helper['words']) == (h_lo, h_end)
        same = mem_words(mems[core], 0, h_lo, h_end) == mem_words(stock_mems[core], 0, h_lo, h_end)
        g.check(f'placement: payload {tag}', end - lo == words and r_lo <= lo and end <= h_lo and known and same,
                f'E-Verb P:0x{lo:05x}..0x{end - 1:05x} ({words} words) in P:0x{r_lo:05x}..0x{r_end - 1:05x}; '
                f'PLATE REV helper P:0x{h_lo:05x}..0x{h_end - 1:05x} {"as the stock metadata records it" if known else "NOT where the metadata puts it"}, '
                f'{"identical to stock" if same else "CHANGED"}; {h_lo - end} words free before it')


def noise(n, level, seed, stereo=True):
    rnd = random.Random(seed)
    return [((rnd.random() * 2 - 1) * level, (rnd.random() * 2 - 1) * level if stereo else 0.0) for _ in range(n)]


def moving_file(path, blocks, seed, fixed=None, step=37):
    rnd = random.Random(seed)
    kn = knobs()
    rows = []
    for b in range(0, blocks, step):
        for k, p in enumerate(MOD.params):
            if p.name and rnd.random() < 0.5:
                kn[k] = rnd.randrange(p.count or 128)
        for name, v in (fixed or {}).items():
            kn[NAMES.index(name)] = v
        rows.append(','.join(map(str, [b, *kn])))
    path.write_text('\n'.join(rows) + '\n')
    return path


def gate_dry(g, host, work):
    blocks = 1500
    sig = [(0.5 * math.sin(2 * math.pi * 211 * i / 44100) + 0.3 * l, 0.4 * math.sin(2 * math.pi * 3001 * i / 44100) + 0.3 * r)
           for i, (l, r) in enumerate(noise(blocks * FR, 1.0, 7))]
    inp = write_raw(work / 'dry_in.raw', sig)
    want = read_raw(inp)
    pf = moving_file(work / 'dry_auto.csv', blocks, 3, fixed={'MIX': 0})
    for label, extra in (('static', ()), ('moving knobs', ()), ('moving knobs, split 5', ('-split', '5'))):
        inst = dict(core=0, pos=1, knobs=knobs(MIX=0))
        if label != 'static':
            inst['paramfile'] = pf
        _, (out,) = host.run([inst], blocks, [inp], extra)
        g.check(f'dry: MIX 0 is the input sample for sample ({label})', out == want,
                f'{sum(1 for a, b in zip(out, want) if a != b)} of {len(want)} words differ')


def impulse_render(host, work, **kw):
    blocks = WARM + int(3.0 * 44100 / FR)
    sig = [(0.0, 0.0)] * (blocks * FR)
    sig[WARM * FR] = (0.5, 0.5)
    inp = write_raw(work / 'imp.raw', sig)
    _, (out,) = host.run([dict(core=0, pos=0, knobs=knobs(**{'MIX': 127, **kw}))], blocks, [inp])
    L, R = out[0::2][WARM * FR:], out[1::2][WARM * FR:]
    return L, R


def energy(x, t0, t1):
    a, b = int(t0 * 44100), int(t1 * 44100)
    return sum(v * v for v in x[a:b]) / max(1, b - a) / FS ** 2


def gate_reverb(g, host, work):
    lags = []
    for pre in (0, 64, 127):
        want_ms = 154 * 2 ** (5.16 * pre / 127) / 22.05          # the PRE law, at the tank rate
        L, R = impulse_render(host, work, PRE=pre, ABSB=38)
        onset = next((i for i, (l, r) in enumerate(zip(L, R)) if max(abs(l), abs(r)) > FS * 1e-3), None)
        lags.append((pre, want_ms, onset / 44.1 if onset is not None else float('nan')))
    path = [ms - want for _, want, ms in lags]
    g.check('reverb: the onset follows PRE', all(0 <= d < 1.5 for d in path) and max(path) - min(path) < 0.25,
            ', '.join(f'PRE {pre} {ms:.2f} ms (pre-delay {want:.2f})' for pre, want, ms in lags)
            + f'; the same {min(path):.2f}-{max(path):.2f} ms path after each')
    L, R = impulse_render(host, work)
    early, late = energy(L, 0.2, 0.7) + energy(R, 0.2, 0.7), energy(L, 1.5, 2.0) + energy(R, 1.5, 2.0)
    g.check('reverb: the default tail decays', early > 0 and 10 * math.log10(max(late, 1e-30) / early) < -20,
            f'{10 * math.log10(max(late, 1e-30) / early):.1f} dB from 0.2-0.7 s to 1.5-2.0 s')
    num = sum(l * r for l, r in zip(L[4410:44100], R[4410:44100]))
    den = math.sqrt(sum(l * l for l in L[4410:44100]) * sum(r * r for r in R[4410:44100])) or 1
    g.check('reverb: the channels are decorrelated', abs(num / den) < 0.5, f'correlation {num / den:+.3f} over 0.1-1.0 s')

    def t20(**kw):
        """Schroeder backward integration: seconds from the onset to 20 dB down"""
        L, R = impulse_render(host, work, **kw)
        e = [l * l + r * r for l, r in zip(L, R)]
        start = next(i for i, v in enumerate(e) if v > 0)
        edc, acc = [0.0] * len(e), 0.0
        for i in range(len(e) - 1, -1, -1):
            acc += e[i]
            edc[i] = acc
        return next(i for i in range(start, len(e)) if edc[i] < edc[start] / 100) / 44100 - start / 44100
    d = {k: t20(**kw) for k, kw in (('DCY 40', dict(DCY=40)), ('DCY 90', dict(DCY=90)),
                                     ('SIZE 30', dict(SIZE=30, DCY=80)), ('SIZE 100', dict(SIZE=100, DCY=80)))}
    g.check('reverb: a higher DCY decays slower', d['DCY 90'] > 2 * d['DCY 40'], f"T20 {d['DCY 40']:.3f} s at DCY 40, {d['DCY 90']:.3f} s at DCY 90")
    g.check('reverb: a larger SIZE decays slower', d['SIZE 100'] > 2 * d['SIZE 30'], f"T20 {d['SIZE 30']:.3f} s at SIZE 30, {d['SIZE 100']:.3f} s at SIZE 100 (DCY 80)")


def gate_idle(g, host, work):
    blocks = WARM + int(12.0 * 44100 / FR)
    sig = [(0.0, 0.0)] * (blocks * FR)
    for i, f in enumerate(noise(int(0.5 * 44100), 0.5, 11)):
        sig[WARM * FR + i] = f
    inp = write_raw(work / 'idle.raw', sig)
    _, (out,) = host.run([dict(core=0, pos=0, knobs=knobs())], blocks, [inp])
    last = out[-2 * int(0.5 * 44100):]
    L, R = set(last[0::2]), set(last[1::2])
    peak = max(abs(v) for v in last)
    g.check('idle: the defaults settle after the input stops', len(L) == 1 and len(R) == 1 and peak <= 8,
            f'last 0.5 s of 11.5 s silence: L {sorted(L)[:4]}, R {sorted(R)[:4]} LSB; a constant truncation '
            f'residue (fixed point of the tank and tilt), no oscillation')


def instance_set():
    rnd = random.Random(5)
    out = []
    for core in (0, 1):
        for pos in range(4):
            kw = {n: rnd.randrange(p.count or 128) for n, p in zip(NAMES, MOD.params) if p.name}
            kw['DCY'] = min(kw['DCY'], 100)
            out.append(dict(core=core, pos=pos, knobs=knobs(**kw)))
    return out


def gate_isolation(g, host, work):
    blocks = 1600
    insts = instance_set()
    inputs = [write_raw(work / f'iso_{k}.raw', noise(blocks * FR, 0.4, 100 + k)) for k in range(len(insts))]
    extra = ('-guard', '0x4000', '-guard-shared', '-dirty', '0x5a')
    text, outs = host.run(insts, blocks, inputs, extra)
    rows = re.findall(r'instance (\d+): \d+ non-zero output samples, (\d+) stray write regions, (\d+) CLOBBERING', text)
    strays, clob = sum(int(s) for _, s, _ in rows), sum(int(c) for _, _, c in rows)
    g.check('isolation: eight instances under -guard 0x4000 -guard-shared -dirty 0x5a', len(rows) == 8 and strays == 0 and clob == 0,
            f'{len(rows)} instances guarded, {strays} stray regions, {clob} clobbers')
    same = 0
    for k, inst in enumerate(insts):
        _, (alone,) = host.run([dict(inst, pos=inst['pos'])], blocks, [inputs[k]], extra)
        same += alone == outs[k]
    g.check('isolation: each instance alone renders bit-identically', same == 8, f'{same} of 8 identical')
    silent = [write_raw(work / 'iso_silent.raw', [(0.0, 0.0)] * (blocks * FR))]
    _, outs = host.run(insts, blocks, inputs[:1] + silent * 7, extra)
    g.check('isolation: only the fed instance makes sound', any(outs[0]) and not any(any(o) for o in outs[1:]),
            'instances 1-7 silent while instance 0 plays')


def gate_garbage(g, host, work):
    import verify_dirtystate as vd
    blocks = 600
    silent = write_raw(work / 'g_silent.raw', [(0.0, 0.0)] * (blocks * FR))
    tone = write_raw(work / 'g_tone.raw', [(0.3 * math.sin(2 * math.pi * 438.75 * i / 44100),) * 2 for i in range(blocks * FR)])
    sets = [knobs(), knobs(SIZE=127, DCY=100, DPTH=110, TILT=20, MIX=127, REV=1, EDCY=100, ESIZ=30)]
    zero = {}
    for k, kn in enumerate(sets):
        _, (z,) = host.run([dict(core=0, pos=0, knobs=kn)], blocks, [tone])
        zero[k] = max(abs(v) for v in z[:2 * 256 * FR])
    quiet, within = True, True
    for fill in vd.FILLS:
        mems = {c: vd.mem_with_fill(host.mems[c], fill, work / f'fill_{fill:06x}_{c}.mem', 2) for c in (0, 1)}
        for k, kn in enumerate(sets):
            _, (o,) = host.run([dict(core=0, pos=0, knobs=kn)], blocks, [silent], ('-dirty', '0x5a'), mems=mems)
            quiet &= not any(o)
            _, (t,) = host.run([dict(core=0, pos=0, knobs=kn)], blocks, [tone], mems=mems)
            first = max(abs(v) for v in t[:2 * 256 * FR])
            within &= abs(20 * math.log10(max(first, 1) / max(zero[k], 1))) <= 1.0
    g.check('garbage: from a garbage block, silence in is silence out', quiet, f'{len(vd.FILLS)} fills x {len(sets)} knob sets, 600 blocks, Y dirty too')
    g.check('garbage: a tone from a garbage block starts like a zeroed one', within, 'first 256 blocks peak within 1 dB')


# verify_knob_clicks.py's census, copied: importing it selects the rig fixture, which this
# module's private image does not carry. Same tone, windows, metric and limits.
KC_J1, KC_J2, KC_S0, KC_END = 1500, 2000, 2500, 3000
KC_LO, KC_HI = 20, 110
KC_STEP_LIMIT, KC_MARGIN = -70.0, 6.0
KC_WINDOWS = (('up', KC_J1, KC_J2), ('down', KC_J2, KC_S0), ('turn', KC_S0, KC_END))


def kc_phase_energy(x, b0, b1):
    e = [0.0] * FR
    for n in range(b0 * FR, b1 * FR):
        a, b, c, d = x[n - 2], x[n - 1], x[n], x[n + 1]
        if max(abs(a), abs(b), abs(c), abs(d)) >= 0.9999:
            continue
        v = d - 3 * c + 3 * b - a
        e[n % FR] += v * v
    return e


def kc_step_db(x, b0, b1):
    import statistics
    e = kc_phase_energy(x, b0, b1)
    med = statistics.median(e)
    spread = 1.4826 * statistics.median(abs(v - med) for v in e)
    excess = max(e) - med - 3 * spread
    return max(-140.0, 10 * math.log10(max(excess, 1e-30) / (6 * (b1 - b0))))


def kc_measure(move, lo, hi):
    return {name: (max(kc_step_db(v, b0, b1) for v in move), max(kc_step_db(v, b0, b1) for v in lo + hi))
            for name, b0, b1 in KC_WINDOWS}


def kc_flagged(res):
    return any(m > KC_STEP_LIMIT and m > s + KC_MARGIN for m, s in res.values())


# Knobs whose effect only shows with the modulation on, measured again where they act: SPD at a
# cyclic, an ergodic and a shimmer depth; SIZE under ergodic grains; DPTH between ergodic and full
# shimmer. Not at DPTH 0 (full cyclic depth): there the doppler moves the heads by up to ~6 ticks a
# tick, the windows are not steady, and the census's flags fall on random phases that move with the
# tone, not on a block step.
ZIPPER_MODULATED = (('SPD', dict(DPTH=32), KC_LO, KC_HI), ('SPD', dict(DPTH=100), KC_LO, KC_HI),
                    ('SPD', dict(DPTH=120), KC_LO, KC_HI), ('SIZE', dict(DPTH=100), KC_LO, KC_HI),
                    ('DPTH', dict(), 100, 127))


def gate_zipper(g, host, work):
    blocks = KC_END + 2 + WARM
    tone = write_raw(work / 'z_tone.raw', [((0.3 * math.sin(2 * math.pi * 438.75 * (i - WARM * FR) / 44100),) * 2
                                           if i >= WARM * FR else (0.0, 0.0)) for i in range(blocks * FR)])
    cases = [(n, {}, KC_LO, KC_HI) for n, p in zip(NAMES, MOD.params) if p.name and (p.count or 128) >= 128]
    flagged, rows = [], []
    for name, extra, lo, hi in cases + list(ZIPPER_MODULATED):
        k = NAMES.index(name)
        base = dict(MIX=100, **extra)

        def render(at, sched=None):
            kw = dict(base, **{name: at})
            _, (o,) = host.run([dict(core=0, pos=0, knobs=knobs(**kw))], blocks, [tone], ('-sched', sched) if sched else ())
            return [[v / FS for v in o[0::2][WARM * FR:]], [v / FS for v in o[1::2][WARM * FR:]]]
        ev = [(KC_J1, hi), (KC_J2, lo)] + [(KC_S0 + 2 * j, v) for j, v in enumerate(range(lo + 1, hi + 1))]
        sched = ','.join(f'{b + WARM}:0:{k}={v}' for b, v in ev)
        res = kc_measure(render(lo, sched), render(lo), render(hi))
        label = f"{name} {lo}<->{hi}" + ''.join(f' at {n} {v}' for n, v in extra.items())
        rows.append(f"{label}: " + ' '.join(f'{w} {m:.0f}/{s:.0f}' for w, (m, s) in res.items()))
        if kc_flagged(res):
            flagged.append(label)
    for r in rows:
        print('        ' + r)
    g.check('zipper: no block-rate step on any continuous knob', not flagged,
            f'{len(cases)} knobs with the modulation off, then SPD at three modulation depths, SIZE under grains and '
            f'DPTH between grains and shimmer; jump up / jump down / turn, move/static dBFS above; flagged {flagged or "none"}')


def rms(x, lo, hi):
    return math.sqrt(sum(x[i] * x[i] for i in range(lo, hi)) / max(1, hi - lo))


def envelope_db(x, start, window=2205):
    """per 50 ms window, both channels: dBFS RMS"""
    out = []
    for w in range(start, len(x) // 2 - window, window):
        seg = x[2 * w:2 * (w + window)]
        out.append(20 * math.log10(max(math.sqrt(sum(v * v for v in seg) / len(seg)), 1) / FS))
    return out


def gate_splits(g, host, work):
    """The dispatcher calls twice in a block with a trig in it: a=0 for the frames before the trig,
    then a=1, which alone reads a knob group. Every smoothed value glides across both calls, so a
    split renders the same reverb. Not the same samples: the glides settle a few LSB apart, and a
    tail that recirculates for seconds turns a few LSB of delay into a different phase."""
    blocks = WARM + int(2.5 * 44100 / FR)
    sig = [(0.0, 0.0)] * (blocks * FR)
    for i, f in enumerate(noise(int(1.0 * 44100), 0.3, 21)):
        sig[WARM * FR + i] = f
    inp = write_raw(work / 's_in.raw', sig)
    def fit(env):
        """the tail's level (mean dBFS over the decay) and its slope (dB per second)"""
        pts = [(k * 0.05, v) for k, v in enumerate(env) if k * 0.05 >= 1.05 and v > -70]
        n, sx, sy = len(pts), sum(t for t, _ in pts), sum(v for _, v in pts)
        sxx, sxy = sum(t * t for t, _ in pts), sum(t * v for t, v in pts)
        return sy / n, (n * sxy - sx * sy) / (n * sxx - sx * sx)
    off, grains = knobs(MIX=127, DCY=80), knobs(MIX=127, DCY=80, DPTH=100)
    _, (ref,) = host.run([dict(core=0, pos=0, knobs=off)], blocks, [inp])
    want, worst = envelope_db(ref, WARM * FR), 0.0
    for split in (1, 7, 15):
        _, (o,) = host.run([dict(core=0, pos=0, knobs=off)], blocks, [inp], ('-split', str(split)))
        worst = max([worst] + [abs(x - y) for x, y in zip(envelope_db(o, WARM * FR), want) if y > -70])
    g.check('splits: a split in every block renders the same reverb (modulation off)', worst < 0.5,
            f'50 ms envelope within {worst:.2f} dB of the unsplit render at splits 1, 7 and 15')
    # With the grains on, the reference is the grains' own spread: the same unsplit render with
    # the burst 0-3 blocks later, which lands the random grains elsewhere just as a split does.
    shifted = []
    for shift in range(4):
        sig2 = [(0.0, 0.0)] * (blocks * FR)
        for i, f in enumerate(noise(int(1.0 * 44100), 0.3, 21)):
            sig2[WARM * FR + 16 * shift + i] = f
        _, (o,) = host.run([dict(core=0, pos=0, knobs=grains)], blocks, [write_raw(work / f's_sh{shift}.raw', sig2)])
        shifted.append(fit(envelope_db(o, WARM * FR + 16 * shift)))
    lo_l, hi_l = min(l for l, _ in shifted), max(l for l, _ in shifted)
    lo_s, hi_s = min(v for _, v in shifted), max(v for _, v in shifted)
    out = []
    for split in (1, 7, 15):
        _, (o,) = host.run([dict(core=0, pos=0, knobs=grains)], blocks, [inp], ('-split', str(split)))
        out.append(fit(envelope_db(o, WARM * FR)))
    inside = all(lo_l - 0.5 <= l <= hi_l + 0.5 and lo_s * 1.02 <= v <= hi_s * 0.98 for l, v in out)
    g.check('splits: a split in every block renders the same reverb (ergodic grains)', inside,
            f'tail level {min(l for l, _ in out):.2f}..{max(l for l, _ in out):.2f} dBFS and decay '
            f'{min(v for _, v in out):.1f}..{max(v for _, v in out):.1f} dB/s split, against the grains\' own '
            f'{lo_l:.2f}..{hi_l:.2f} dBFS and {lo_s:.1f}..{hi_s:.1f} dB/s unsplit')
    pf = moving_file(work / 's_auto.csv', blocks, 9)
    text, _ = host.run([dict(core=0, pos=0, knobs=knobs(DPTH=100), paramfile=pf)], blocks, [inp],
                       ('-split', '9', '-guard', '0x4000', '-guard-shared'))
    m = re.search(r'(\d+) stray write regions, (\d+) CLOBBERING', text)
    g.check('splits: knobs moving with a split in every block, guarded', bool(m) and m[1] == '0' and m[2] == '0',
            'no hang, no stray write' if m else 'no guard report')


def gate_reverse(g, host, work):
    """REV ducks the pre-delay output, switches at silence and reopens: a switch must not click.
    The largest sample-to-sample step while REV toggles every 40 ms is compared with the largest
    of the same render with REV held off and held on (PRE moving the same way in all three)."""
    blocks = 2400
    sig = [(0.25 * math.sin(2 * math.pi * 211 * i / 44100), 0.25 * math.sin(2 * math.pi * 97 * i / 44100)) for i in range(blocks * FR)]
    inp = write_raw(work / 'rv_in.raw', sig)

    def render(rev):
        rows, kn = [], knobs(MIX=64, DCY=80)
        for b in range(0, blocks, 110):
            kn[NAMES.index('REV')] = (b // 110) % 2 if rev is None else rev
            kn[NAMES.index('PRE')] = (b * 7) % 128
            rows.append(','.join(map(str, [b, *kn])))
        pf = work / f'rv_auto_{rev}.csv'
        pf.write_text('\n'.join(rows) + '\n')
        _, (o,) = host.run([dict(core=0, pos=0, knobs=kn, paramfile=pf)], blocks, [inp])
        o = o[2 * WARM * FR:]
        return o, largest_step(o)
    o, step = render(None)
    still = max(render(0)[1], render(1)[1])
    rails = sum(1 for v in o if abs(v) >= FS)
    g.check('reverse: REV switching every 40 ms does not click', rails == 0 and step <= 1.25 * still,
            f'largest step {dbfs(step):.1f} dBFS switching, {dbfs(still):.1f} dBFS held; {rails} samples on the rail')


def largest_step(o):
    return max(max(abs(o[i] - o[i - 2]) for i in range(2 + c, len(o), 2)) for c in (0, 1))


def gate_depth_locks(g, host, work):
    """A gliding (shimmer) grain keeps gliding until its line latches again, up to a grain-clock cycle
    later. If DPTH moves left meanwhile, the cyclic offset rises under the glide; without the floor the
    head read ahead of its line, into the next line's buffer (rail-to-rail steps at SPD 0)."""
    blocks = WARM + int(3.0 * 44100 / FR)
    inp = write_raw(work / 'dl_in.raw', noise(blocks * FR, 0.3, 31))
    rows = []
    for spd in (0, 64, 127):
        for size in (0, 64, 127):
            base = knobs(MIX=127, DCY=90, SPD=spd, SIZE=size)

            def render(held):
                lines, kn = [], list(base)
                for b in range(0, blocks, 193):
                    kn[NAMES.index('DPTH')] = held if held is not None else (127 if (b // 193) % 2 == 0 else 0)
                    lines.append(','.join(map(str, [b, *kn])))
                pf = work / f'dl_{spd}_{size}_{held}.csv'
                pf.write_text('\n'.join(lines) + '\n')
                _, (o,) = host.run([dict(core=0, pos=0, knobs=kn, paramfile=pf)], blocks, [inp])
                return largest_step(o[2 * WARM * FR:])
            rows.append((spd, size, render(None), max(render(127), render(0))))
    bad = [r for r in rows if r[2] > 1.25 * r[3]]
    g.check('depth locks: DPTH +63/-64 every 70 ms steps no more than with DPTH held', not bad,
            '; '.join(f'SPD {a} SIZE {b}: {dbfs(c):.1f}/{dbfs(d):.1f}' for a, b, c, d in rows) + ' dBFS, locking/held')


def gate_envelope(g, host, work):
    blocks = WARM + int(20.5 * 44100 / FR)
    sig = [(0.0, 0.0)] * (blocks * FR)
    for i, f in enumerate(noise(int(0.5 * 44100), 0.8, 41)):
        sig[WARM * FR + i] = f
    inp = write_raw(work / 'env_in.raw', sig)
    _, (o,) = host.run([dict(core=0, pos=0, knobs=knobs(MIX=127, DCY=80, EDCY=127))], blocks, [inp])
    o = o[2 * WARM * FR:]

    def level(t0, t1):
        seg = o[2 * int(t0 * 44100):2 * int(t1 * 44100)]
        return 20 * math.log10(max(math.sqrt(sum(v * v for v in seg) / len(seg)), 1e-3) / FS)
    early, late = level(0.5, 1.5), level(19.0, 20.0)
    g.check('envelope: EDCY +63 lengthens the decay but cannot hold the tail', late < early - 40,
            f'{early:.1f} dBFS RMS at 0.5-1.5 s, {late:.1f} dBFS at 19-20 s (DCY 80, MIX 127, 0.5 s burst at 0.8 FS)')


def main():
    import send_probe
    g = Gates()
    print('== everb: render gates (dsp_host, private image; not hardware)')
    gate_source(g)
    with tempfile.TemporaryDirectory(prefix='everb-verify.') as tmp:
        work = pathlib.Path(tmp)
        try:
            image, log = build_image(work)
        except (SystemExit, AssertionError) as error:
            g.check('placement: the image builds', False, str(error))
            return 1
        mems = {c: send_probe.dump_mem(image, work / f'mem_{t}.mem', t) for c, t in ((0, 'A'), (1, 'B'))}
        stock_mems = {c: send_probe.dump_mem(STOCK, work / f'stock_{t}.mem', t) for c, t in ((0, 'A'), (1, 'B'))}
        gate_placement(g, log, mems, stock_mems)
        host = Host(mems, work)
        for gate in (gate_dry, gate_reverb, gate_idle, gate_isolation, gate_garbage, gate_zipper, gate_splits, gate_reverse,
                     gate_depth_locks, gate_envelope):
            gate(g, host, work)
    print(f"== everb: {'all gates pass' if not g.failed else str(len(g.failed)) + ' failed: ' + ', '.join(g.failed)}")
    return 1 if g.failed else 0


if __name__ == '__main__':
    sys.exit(main())
