#!/usr/bin/env python3
# SPDX-License-Identifier: Elastic-2.0
# Copyright (c) 2026 Jannik Aßfalg (repeat98)
"""An effect's real DSP cost on a unit, over `npm run device -- serve` (a development base with the status meters).

  scripts/octatrack-measure.py [--slot 2] [--pkg MODULE.mwrm] NAME ...   (NAME as the chooser shows it; NONE first)

For each effect, picked on T1 (core 1) and T5 (core 0) of the current Part, playing: one settled meter reading at
the settings it starts with, one with every main and SETUP knob at its minimum and one at its maximum, both tracks
alike. Cycles a sample above the NONE baseline: average (as it starts), dearest (the dearest of the three) and the
peak frame seen. About 25 s an effect. Run on a Part whose working copy equals its saved one, and RELOAD it after
(docs/OCTATRACK_DRIVING.md). Prints one JSON object a line; progress on stderr."""
import argparse, json, os, re, socket, sys

SOCKET = os.environ.get('MODWERK_DEV_SOCKET', '/tmp/modwerk-dev.sock')
FRAME, SAMPLES = 72520, 16
PASS = {0: 20.00, 1: 14.48}  # cycles an idle pass (status.c idle_cycles)
STAT = re.compile(r'stats cpu (\d+) T1-4 (\d+)/(\d+) T5-8 (\d+)/(\d+) passes ([\d.]+) ([\d.]+)')


def send(sequence, quiet=False):
    if not quiet: print('>', sequence[:100], file=sys.stderr, flush=True)
    s = socket.socket(socket.AF_UNIX); s.settimeout(120); s.connect(SOCKET)
    s.sendall((sequence + '\n').encode())
    reply = s.makefile().read()
    if 'error:' in reply: raise RuntimeError(sequence + ': ' + reply.strip())
    return reply


def reading():  # each core's meter window is read out in turn, about 2 s each: settle, then one from each
    rows = [list(map(float, m.groups())) for m in STAT.finditer(send('w2500 stats w2000 stats', quiet=True))]
    busy = lambda r, core: FRAME - r[5 + core] * PASS[core]  # passes: core 0, then core 1
    return dict(core0=sum(busy(r, 0) for r in rows) / len(rows), core1=sum(busy(r, 1) for r in rows) / len(rows),
                peak0=max(r[4] for r in rows) / 1000 * FRAME, peak1=max(r[2] for r in rows) / 1000 * FRAME)


def knobs(fx, turn):  # every main and SETUP knob of T1 and T5 to its minimum, then turned by `turn` (0 or 127)
    each = ' '.join('enc%s-127 enc%s-127' % (e, e) + (' enc%s+%d' % (e, turn) if turn else '') for e in 'ABCDEF')
    send(' '.join('T%d w200 %s w300 %s FUNC+%s w300 %s NO w200' % (t, fx, each, fx, each) for t in (1, 5)), quiet=True)


def measure(name, slot, base):
    # shortcut: three settings, not every value of every knob; a cost that peaks mid-range is missed (sweep it by hand)
    fx = 'FX%d' % slot
    send('pick:T1:%s:%s pick:T5:%s:%s' % (fx, name.replace(' ', '_'), fx, name.replace(' ', '_')))
    send('PLAY w500')
    start = reading()
    knobs(fx, 0); low = reading()
    knobs(fx, 127); high = reading()
    send('STOP w300 pick:T1:%s:NONE pick:T5:%s:NONE' % (fx, fx))
    per = lambda busy, core: round((busy - base['core%d' % core]) / SAMPLES, 1)
    dear = {k: max(r[k] for r in (start, low, high)) for k in start}
    return dict(name=name, slot=fx, average=dict(core1=per(start['core1'], 1), core0=per(start['core0'], 0)),
                dearest=dict(core1=per(dear['core1'], 1), core0=per(dear['core0'], 0)),
                peakFrame=dict(core1=per(dear['peak1'], 1), core0=per(dear['peak0'], 0)),
                lowHigh=dict(core1=[per(low['core1'], 1), per(high['core1'], 1)], core0=[per(low['core0'], 0), per(high['core0'], 0)]))


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--slot', type=int, default=2, choices=(1, 2))
    ap.add_argument('--pkg', action='append', default=[], help='install these first, remove them after')
    ap.add_argument('names', nargs='+')
    a = ap.parse_args()
    if 'stopped' not in send('state'): raise SystemExit('Stop the transport first.')
    for p in a.pkg: send('try ' + p)
    try:
        fx = 'FX%d' % a.slot
        send('pick:T1:%s:NONE pick:T5:%s:NONE PLAY w1500' % (fx, fx))
        base = reading()
        send('STOP w500')
        print(json.dumps(dict(name='NONE', slot=fx, baseline=dict(core1=round(base['core1'] / SAMPLES, 1), core0=round(base['core0'] / SAMPLES, 1)))), flush=True)
        for name in a.names:
            if name == 'NONE': continue
            try: print(json.dumps(measure(name, a.slot, base)), flush=True)
            except RuntimeError as e:
                print(json.dumps(dict(name=name, error=str(e)[:200])), flush=True)
                send('STOP w300 pick:T1:%s:NONE pick:T5:%s:NONE' % (fx, fx))
    finally:
        for p in a.pkg:
            try: send('remove ' + p)
            except RuntimeError as e: print('remove failed: %s' % e, file=sys.stderr)


main()
