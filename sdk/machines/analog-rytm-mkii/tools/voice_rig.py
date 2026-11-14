#!/usr/bin/env python3
"""A digital voice on the Analog Rytm MKII, played and measured on the unit.

    python3 tools/voice_rig.py --list
    python3 tools/voice_rig.py PLAN.json --midi NAME --audio NAME [--out DIR] [--sweeps a,b]
    python3 tools/voice_rig.py PLAN.json --analyse DIR          (again, from a run's recordings)

The computer plays track 1 over MIDI (USB or DIN) and records the Rytm's MAIN OUT through
an audio interface. A run, from the plan (JSON, the module's tools/rig_plan.json):

  setup    the track's machine (CC 15) and a neutral voice path: filter open, AMP held,
           no overdrive or sends (the plan's CCs)
  select   the machine chosen with nothing played: MAIN OUT stays silent
  passes   one per type (808, 909, ...): a type other than the first asks you to tap the
           machine's encoder and press Enter. Each sweep sets one knob through its values,
           the others at the plan's defaults, and plays one hit a value
  switch   a long hit, then another machine during its tail: no repeating block
  stress   the machine on the plan's tracks (one a voice), all hit together, fast:
           dropouts counted. It leaves those tracks on the machine: run it in a scratch
           project

Each hit is measured: peak level, time to fall 20 dB, its settled and early pitch,
its click against its body, its energy below 150 Hz, from 1 to 8 kHz and from 2 to 8 kHz, its
1 to 8 kHz energy in the first 20 ms, and its 2 to 8 kHz in the first 10 ms against its body's. The analog
path (filter, AMP, OVR, the outputs) colours absolute levels, so each sweep is judged on
its trend: the plan names the measure the knob must move, and the module's host
model, rendered for the same values (the plan's "host": a Python file with
render(type, knobs, velocity) -> 48 kHz floats), says which way and how much. A sweep
passes when the unit's measure follows the model's (Spearman rho >= 0.8) or, for the
settled pitch, lands within 3 % of it.

The unit needs RECEIVE NOTES and RECEIVE CC/NRPN on, and MIDI IN from the port used
(GLOBAL > MIDI CONFIG). Writes report.md, results.json and one WAV per pass to --out.
Needs mido, python-rtmidi, sounddevice, soundfile, numpy (a venv is fine).
"""
import argparse
import importlib.util
import json
import math
import sys
import time
from pathlib import Path

import numpy as np

RATE_HOST = 48000
GAP = 1.6               # seconds between hits
LEAD = 0.5              # seconds of silence before the first hit


# ---------------------------------------------------------------- measures

def envelope(x, rate, ms=1.0):
    n = max(1, int(rate * ms / 1000))
    m = len(x) // n
    return np.abs(x[:m * n]).reshape(m, n).max(axis=1), n


def onset(x, rate, floor_db=-60.0, below_db=30.0, quiet_ms=2.0):
    """Where the hit rises: back from the window's peak to the end of the last stretch of
    quiet_ms below below_db under it (the same for the unit and the model, whatever the
    path's gain, and blind to a blip before the hit), or None when the window peaks under
    floor_db."""
    a = np.abs(x)
    peak = float(a.max()) if len(a) else 0.0
    if peak < 10 ** (floor_db / 20):
        return None
    loud = a > peak * 10 ** (-below_db / 20)
    ipk, run, need = int(np.argmax(a)), 0, max(1, int(rate * quiet_ms / 1000))
    for i in range(ipk, -1, -1):
        run = 0 if loud[i] else run + 1
        if run >= need:
            return int(np.nonzero(loud[i:ipk + 1])[0][0]) + i
    return int(np.nonzero(loud)[0][0])


def pitch(x, rate, lo=20.0, hi=400.0):
    """Fundamental by autocorrelation, Hz (0 when unvoiced)."""
    if len(x) < rate * 0.02 or not np.any(x):
        return 0.0
    x = x - x.mean()
    c = np.correlate(x, x, 'full')[len(x) - 1:]
    a, b = int(rate / hi), min(len(c) - 1, int(rate / lo))
    if b <= a:
        return 0.0
    k = a + int(np.argmax(c[a:b]))
    if c[k] <= 0.2 * c[0] or k <= a or k >= b - 1:     # unvoiced, or the peak at the range's edge
        return 0.0
    y0, y1, y2 = c[k - 1], c[k], c[k + 1]              # parabolic peak, within a sample
    d = y0 - 2 * y1 + y2
    return rate / (k + (max(-1.0, min(1.0, 0.5 * (y0 - y2) / d)) if d else 0.0))


def band_db(x, rate, lo, hi):
    spec = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    f = np.fft.rfftfreq(len(x), 1 / rate)
    e = spec[(f >= lo) & (f < hi)].sum()
    return 10 * math.log10(e + 1e-20)


def zero_runs(x, at_least=8):
    """Runs of at_least exact zeros: a dropout in the recording (the USB audio stream or the unit),
    which no hit has while it sounds."""
    z = np.concatenate(([0], (x == 0).astype(np.int8), [0]))
    runs = np.diff(np.nonzero(np.diff(z))[0])[::2]
    return int(np.sum(runs >= at_least))


def measure(x, rate, recorded=False):
    """One hit's measures; x starts at (or a little before) the hit. A recorded hit (never the
    model's, which decays to exact zeros) with a run of exact zeros is a dropout."""
    start = onset(x, rate)
    if start is None:
        return {'silent': True}
    x = x[start:]
    if recorded and zero_runs(x[:int(rate * 0.5)]):
        return {'silent': False, 'dropout': True}
    env, n = envelope(x, rate)
    peak = float(env.max()) if len(env) else 0.0
    ipk = int(np.argmax(env))
    below = np.nonzero(env[ipk:] < peak * 0.1)[0]
    rms = lambda a: float(np.sqrt(np.mean(a * a))) if len(a) else 0.0
    seg = lambda t0, t1: x[int(rate * t0):int(rate * t1)]
    click, body = rms(seg(0, 0.003)), rms(seg(0.02, 0.06))
    window = seg(0, 0.3)
    return {
        'silent': False,
        'peak_db': 20 * math.log10(peak + 1e-12),
        't20_ms': (below[0] if len(below) else len(env) - ipk) * n / rate * 1000,
        'f0_hz': pitch(seg(0.25, 0.45), rate),
        'f0_early_hz': crossings_hz(seg(0.005, 0.08), rate),
        'click_db': 20 * math.log10((click + 1e-12) / (body + 1e-12)),
        'low_db': band_db(window, rate, 20, 150) if len(window) else -200,
        'high_db': band_db(window, rate, 1000, 8000) if len(window) else -200,
        'attack_high_db': band_db(seg(0, 0.02), rate, 1000, 8000),
        'presence_db': band_db(window, rate, 2000, 8000) if len(window) else -200,
        'click_hf_db': band_db(seg(0, 0.01), rate, 2000, 8000) - band_db(seg(0.02, 0.06), rate, 2000, 8000),
    }


# The band measures' windows (seconds from the hit) and bands (Hz), for the noise floor.
BANDS = {'low_db': (0, 0.3, 20, 150), 'high_db': (0, 0.3, 1000, 8000), 'attack_high_db': (0, 0.02, 1000, 8000),
         'presence_db': (0, 0.3, 2000, 8000)}


def ranks(a):
    """Ranks with ties averaged."""
    a = np.asarray(a, float)
    order = np.argsort(a, kind='stable')
    r = np.empty(len(a))
    r[order] = np.arange(len(a))
    for v in np.unique(a):
        r[a == v] = r[a == v].mean()
    return r


def spearman(a, b):
    """Spearman's rho, or None when either side does not move."""
    ra, rb = ranks(a), ranks(b)
    if np.std(ra) == 0 or np.std(rb) == 0:
        return None
    return float(np.corrcoef(ra, rb)[0, 1])


def crossings_hz(x, rate):
    """Mean frequency from zero crossings (follows a sweep that autocorrelation cannot)."""
    if len(x) < 8 or not np.any(x):
        return 0.0
    s = np.signbit(x - x.mean())
    return float(np.count_nonzero(s[1:] != s[:-1])) * rate / (2 * len(x))


# ---------------------------------------------------------------- the plan

def load_plan(path):
    plan = json.loads(Path(path).read_text())
    host = None
    if plan.get('host'):
        spec = importlib.util.spec_from_file_location('voice_host', Path(path).parent / plan['host'])
        host = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(host)
    return plan, host


def cases(plan, only):
    """(type, sweep, value, knobs, velocity) for every hit of every pass, in play order."""
    out = []
    for t, tname in enumerate(plan['types']):
        for sweep in plan['sweeps']:
            if only and sweep['name'] not in only:
                continue
            if 'types' in sweep and tname not in sweep['types']:
                continue
            for v in sweep['values']:
                knobs = dict(plan['defaults'])
                velocity = plan.get('velocity', 100)
                if sweep['knob'] == 'velocity':
                    velocity = v
                else:
                    knobs[sweep['knob']] = v
                out.append((t, sweep['name'], v, knobs, velocity))
    return out


# ---------------------------------------------------------------- the unit

class Unit:
    def __init__(self, midi, audio, channel, rate):
        import mido
        import sounddevice as sd
        self.mido, self.sd = mido, sd
        self.out = mido.open_output(midi)
        self.audio, self.channel, self.rate = audio, channel - 1, rate
        self.chunks, self.stream = [], None
        self.offs = []                  # (time, channel, note): note-offs still to send

    def cc(self, cc, value, channel=None):
        self.out.send(self.mido.Message('control_change', channel=self.channel if channel is None else channel,
                                        control=cc, value=int(value)))

    def hit(self, velocity, note=0, channel=None, length=1.0):
        """A note held for length seconds: the Rytm plays nothing for a note-off right after its note-on."""
        ch = self.channel if channel is None else channel
        self.out.send(self.mido.Message('note_on', channel=ch, note=note, velocity=int(velocity)))
        self.offs.append((time.perf_counter() + length, ch, note))

    def record(self):
        self.chunks = []
        self.overflows = 0

        def take(data, frames, t, status):
            self.overflows += bool(status.input_overflow)
            self.chunks.append(data.copy())
        self.stream = self.sd.InputStream(device=self.audio, samplerate=self.rate, channels=2, dtype='float32',
                                          latency='high', callback=take)
        self.stream.start()
        self.t0 = time.perf_counter()

    def release(self, until=None):
        """Send the note-offs due by until (all, without it)."""
        keep = []
        for t, ch, note in self.offs:
            if until is None or t <= until:
                self.out.send(self.mido.Message('note_off', channel=ch, note=note, velocity=0))
            else:
                keep.append((t, ch, note))
        self.offs = keep

    def stop(self):
        self.release()
        self.stream.stop()
        self.stream.close()
        return np.concatenate(self.chunks)[:, 0] if self.chunks else np.zeros(0)

    def at(self, t):
        """Wait until t seconds after record()."""
        while time.perf_counter() - self.t0 < t:
            self.release(time.perf_counter())
            time.sleep(0.001)


def write_wav(path, x, rate):
    import soundfile
    soundfile.write(str(path), x, rate)


def run(plan, unit, out, only, types=None, skip=()):
    knobs_cc = plan['ccs']
    rate = unit.rate
    for cc, v in plan.get('setup', {}).items():
        unit.cc(int(cc), v)
    unit.cc(15, plan['machine'])                    # Track Machine Type
    time.sleep(0.5)
    log = {'select': None, 'passes': [], 'switch': None, 'stress': None}

    # select: nothing plays after the machine is chosen (also the noise floor for the band measures)
    unit.record()
    unit.at(1.5)
    x = unit.stop()
    write_wav(out / 'select.wav', x, rate)
    log['select'] = {'peak_db': 20 * math.log10(float(np.abs(x).max()) + 1e-12) if len(x) else -240,
                     'judged': 'select' not in skip}

    plays = cases(plan, only)
    for t, tname in enumerate(plan['types']):
        mine = [c for c in plays if c[0] == t]
        if not mine or (types and tname not in types):
            continue
        if t and not types:
            input('Tap the machine\'s %s encoder until it shows %s, then press Enter: ' % (plan['tap'], tname))
        unit.record()
        times = []
        for i, (_, sweep, v, knobs, velocity) in enumerate(mine):
            at = LEAD + i * GAP
            unit.at(at - 0.25)                  # the knobs are live: not before the last hit has rung
            for k, kv in knobs.items():
                unit.cc(knobs_cc[k], kv)
            unit.at(at)
            unit.hit(velocity)
            times.append(at)
        unit.at(LEAD + len(mine) * GAP + 0.5)
        x = unit.stop()
        write_wav(out / ('pass-%s.wav' % tname), x, rate)
        log['passes'].append({'type': tname, 'hits': [
            {'sweep': s, 'value': v, 'knobs': k, 'velocity': vel, 'at': a}
            for (_, s, v, k, vel), a in zip(mine, times)]})

    if 'switch' in skip and 'stress' in skip:
        (out / 'run.json').write_text(json.dumps({'rate': rate, 'log': log}, indent=1))
        return
    # switch: another machine during a long tail
    for k, kv in plan['defaults'].items():
        unit.cc(knobs_cc[k], kv)
    for k, kv in plan.get('long', {}).items():
        unit.cc(knobs_cc[k], kv)
    if 'switch' not in skip:
        unit.record()
        unit.at(LEAD)
        unit.hit(100)
        unit.at(LEAD + 0.15)
        unit.cc(15, plan.get('other_machine', 0))
        unit.at(LEAD + 2.0)
        x = unit.stop()
        write_wav(out / 'switch.wav', x, rate)
        log['switch'] = {'switch_at': LEAD + 0.15}
        unit.cc(15, plan['machine'])
    if 'stress' in skip:
        (out / 'run.json').write_text(json.dumps({'rate': rate, 'log': log}, indent=1))
        return

    # stress: the machine on the plan's tracks (track t on channel t + 1, note t), hit together; the
    # same 4 s with track 1 alone first, so dropouts of the USB audio stream are not taken for the unit's
    tracks = plan.get('stress_tracks', [0, 1, 4, 5])[:plan.get('stress_count') or None]
    auto = plan.get('stress_auto')        # tracks set up beforehand, hit on the auto channel by note
    for tr in tracks if not auto else []:
        unit.cc(15, plan['machine'], channel=tr)
        for cc, v in plan.get('setup', {}).items():   # the same voice path, its sample layer off
            unit.cc(int(cc), v, channel=tr)
    time.sleep(0.5)
    overflows = []
    for name, play in (('stress-one', tracks[:1]), ('stress', tracks)):
        unit.record()
        for i in range(int(4 / 0.125)):
            unit.at(LEAD + i * 0.125)
            for tr in play:
                unit.hit(110, note=tr, channel=auto - 1 if auto else tr, length=0.1)
        unit.at(LEAD + 4.5)
        x = unit.stop()
        overflows.append(unit.overflows)
        write_wav(out / (name + '.wav'), x, rate)
    log['stress'] = {'tracks': len(tracks), 'overflows': overflows}
    (out / 'run.json').write_text(json.dumps({'rate': rate, 'log': log}, indent=1))


# ---------------------------------------------------------------- the judgement

def analyse(plan, host, out):
    import soundfile
    run_log = json.loads((out / 'run.json').read_text())
    log = run_log['log']
    res = {'checks': [], 'sweeps': []}

    if log['select'].get('judged', True):
        res['checks'].append({'name': 'select', 'pass': log['select']['peak_db'] < -60,
                              'note': 'MAIN OUT peak %.1f dBFS after choosing the machine' % log['select']['peak_db']})
    quiet, qrate = soundfile.read(str(out / 'select.wav'), always_2d=True)
    floor = {k: band_db(quiet[:int(qrate * (t1 - t0)), 0], qrate, lo, hi) for k, (t0, t1, lo, hi) in BANDS.items()}

    for p in log['passes']:
        x, rate = soundfile.read(str(out / ('pass-%s.wav' % p['type'])), always_2d=True)
        x = x[:, 0]
        hits = p['hits']
        unit_m = []
        for h in hits:      # a window from 50 ms before the scheduled hit (MIDI and audio latency)
            a = int(rate * max(0.0, h['at'] - 0.05))
            unit_m.append(measure(x[a:a + int(rate * (GAP - 0.1))], rate, recorded=True))
        tindex = plan['types'].index(p['type'])
        for sweep in plan['sweeps']:
            if 'types' in sweep and p['type'] not in sweep['types']:
                continue
            idx = [i for i, h in enumerate(hits) if h['sweep'] == sweep['name']]
            if not idx:
                continue
            key = sweep['measure']
            u = [unit_m[i].get(key, float('nan')) for i in idx]
            vals = [hits[i]['value'] for i in idx]
            row = {'type': p['type'], 'sweep': sweep['name'], 'measure': key, 'values': vals, 'unit': u}
            if p['type'] in sweep.get('observe', []):
                row.update({'pass': None, 'note': 'observed, not judged (the plan)'})
                if host:
                    row['model'] = [measure(np.asarray(host.render(tindex, hits[i]['knobs'], hits[i]['velocity'])),
                                            RATE_HOST).get(key, float('nan')) for i in idx]
            elif any(unit_m[i].get('silent') for i in idx):
                row.update({'pass': False, 'note': 'a hit was silent'})
            elif len([i for i in idx if not unit_m[i].get('dropout')]) < 3:
                row.update({'pass': None, 'note': 'not judged: dropouts in the recording; run it again'})
            elif host:
                lost = [i for i in idx if unit_m[i].get('dropout')]
                idx = [i for i in idx if i not in lost]
                u = [unit_m[i].get(key, float('nan')) for i in idx]
                row['values'], row['unit'] = [hits[i]['value'] for i in idx], u
                hm = [measure(np.asarray(host.render(tindex, hits[i]['knobs'], hits[i]['velocity'])),
                              RATE_HOST).get(key, float('nan')) for i in idx]
                row['model'] = hm
                spread = max(hm) - min(hm) if all(np.isfinite(hm)) else 0
                if key in BANDS and (spread < 3 or min(u) < floor[key] + 6):
                    row.update({'pass': None, 'note': 'not judged: the model moves it %.1f dB, the unit is %.1f dB '
                                                      'over the noise floor' % (spread, min(u) - floor[key])})
                elif key == 'f0_hz':
                    err = max(abs(a / b - 1) for a, b in zip(u, hm) if a and b) if any(hm) else 1
                    row.update({'pass': err <= 0.03, 'note': 'pitch within %.1f %% of the model' % (err * 100)})
                else:
                    rho = spearman(u, hm)
                    row.update({'pass': None, 'note': 'not judged: a side does not move'} if rho is None else
                               {'pass': rho >= 0.8, 'note': 'rho %.2f against the model' % rho})
                if lost:
                    row['note'] += ' (%d hit%s left out: a dropout in the recording)' % (len(lost), 's' * (len(lost) > 1))
            else:
                rho = spearman(u, vals)
                row.update({'pass': None, 'note': 'not judged: the measure does not move'} if rho is None else
                           {'pass': rho * (1 if sweep.get('rises', True) else -1) >= 0.8,
                            'note': 'rho %.2f against the knob' % rho})
            res['sweeps'].append(row)

    if log.get('switch'):
        res['checks'].append(switch_check(out, log))
    if log.get('stress'):
        res['checks'].append(stress_check(out))
    return report(plan, res, out)


def switch_check(out, log):
    import soundfile
    x, rate = soundfile.read(str(out / 'switch.wav'), always_2d=True)
    tail = x[int(rate * (log['switch']['switch_at'] + 0.3)):, 0]
    # a stale 32-sample block repeated by the mixer is a 1.5 kHz line and its harmonics
    spec = np.abs(np.fft.rfft(tail * np.hanning(len(tail)))) if len(tail) else np.zeros(1)
    f = np.fft.rfftfreq(len(tail), 1 / rate) if len(tail) else np.zeros(1)
    line = spec[(f > 1450) & (f < 1550)].max(initial=0) / (np.median(spec[(f > 1000) & (f < 2000)]) + 1e-12)
    return {'name': 'switch', 'pass': line < 30, 'note': '1.5 kHz line %.0fx the floor after the machine change' % line}


def repeats(x, block=32, floor=1e-3):
    """Blocks that repeat the block before them exactly while the signal sounds: an audio
    interrupt that missed its block and left the last one playing."""
    n = 0
    for i in range(block, len(x) - block, block // 2):
        a, b = x[i:i + block], x[i - block:i]
        if np.abs(a).max() > floor and np.array_equal(a, b):
            n += 1
    return n


def stress_check(out):
    import soundfile
    log = json.loads((out / 'run.json').read_text())['log']
    count = {}
    for name in ('stress-one', 'stress'):
        x, rate = soundfile.read(str(out / (name + '.wav')), always_2d=True)
        x = x[int(rate * LEAD):int(rate * (LEAD + 4)), 0]
        count[name] = (repeats(x), zero_runs(x, 32), int(np.sum(np.abs(np.diff(x)) > 0.5)))
    (r1, g1, j1), (rn, gn, jn) = count['stress-one'], count['stress']
    return {'name': 'stress', 'pass': rn <= r1 and gn <= g1,
            'note': '%d tracks: %d repeated blocks, %d silent gaps (%d jumps); one track: %d, %d (%d); host overflows %s'
                    % (log['stress']['tracks'], rn, gn, jn, r1, g1, j1, log['stress'].get('overflows'))}


def report(plan, res, out):
    lines = ['# %s on the unit' % plan['name'], '', '| check | result | note |', '|---|---|---|']
    lines += ['| %s | %s | %s |' % (c['name'], 'PASS' if c['pass'] else 'FAIL', c['note']) for c in res['checks']]
    lines += ['', '| type | sweep | measure | result | note |', '|---|---|---|---|---|']
    word = lambda ok: 'PASS' if ok else '-' if ok is None else 'FAIL'
    lines += ['| %s | %s | %s | %s | %s |' % (r['type'], r['sweep'], r['measure'], word(r['pass']), r['note'])
              for r in res['sweeps']]
    (out / 'report.md').write_text('\n'.join(lines) + '\n')
    (out / 'results.json').write_text(json.dumps(res, indent=1, default=float))
    print('\n'.join(lines))
    return all(c['pass'] for c in res['checks']) and all(r['pass'] is not False for r in res['sweeps'])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('plan', nargs='?')
    ap.add_argument('--list', action='store_true', help='MIDI outputs and audio inputs')
    ap.add_argument('--midi', help='MIDI output name (as --list shows it)')
    ap.add_argument('--audio', help='audio input name or index carrying MAIN OUT (left channel)')
    ap.add_argument('--rate', type=int, default=48000)
    ap.add_argument('--channel', type=int, default=1, help="track 1's MIDI channel")
    ap.add_argument('--out', default='voice-rig-run')
    ap.add_argument('--sweeps', help='only these sweeps, comma separated')
    ap.add_argument('--analyse', help='judge an earlier run in this folder')
    ap.add_argument('--types', help='only these types\' passes (comma separated), with no prompt: tap first')
    ap.add_argument('--stress', type=int, help="the first N of the plan's stress tracks")
    ap.add_argument('--stress-auto', type=int, metavar='CH',
                    help="hit the stress tracks on this auto channel (note = track), set up beforehand "
                         "(machine, type, SYN on, voice path); no per-track CCs")
    ap.add_argument('--skip', default='', help='steps to leave out: select, switch, stress (comma separated)')
    a = ap.parse_args()
    if a.list:
        import mido
        import sounddevice as sd
        print('MIDI outputs:', *mido.get_output_names(), sep='\n  ')
        print('Audio inputs:', *['%d %s' % (i, d['name']) for i, d in enumerate(sd.query_devices())
                                  if d['max_input_channels'] >= 2], sep='\n  ')
        return
    plan, host = load_plan(a.plan)
    plan['stress_count'] = a.stress
    plan['stress_auto'] = a.stress_auto
    if a.analyse:
        sys.exit(0 if analyse(plan, host, Path(a.analyse)) else 1)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=False)
    run(plan, Unit(a.midi, a.audio, a.channel, a.rate), out, set(a.sweeps.split(',')) if a.sweeps else None,
        set(a.types.split(',')) if a.types else None, set(filter(None, a.skip.split(','))))
    sys.exit(0 if analyse(plan, host, out) else 1)


if __name__ == '__main__':
    main()
