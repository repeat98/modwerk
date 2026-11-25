"""Measure stock MAIN and instrumented sequencer spans in an MKII emulator."""
import argparse
import json
from pathlib import Path
import shutil
import tempfile

from mkii_panel import panel, peek

parser = argparse.ArgumentParser(description=__doc__)
for name in ('emulator', 'main', 'symbols', 'synthetic_card', 'output'):
    parser.add_argument(name, type=Path)

parser.add_argument('--performance-overlay', action='store_true', help='Select dense sources through Clip View')
args = parser.parse_args()
if not __debug__:
    parser.error('Assertions are required')
symbols = json.loads(args.symbols.read_text())
TICK, WRAP, AUDIO, MIDI = 0x400a3fdc, 0x400a43a0, 0x4009d1e8, 0x4009cf4c
bank, stride, lane_bytes = 0x400e21e0, 0x8ed8, 0x91a
module = 0x34e1e379
with tempfile.TemporaryDirectory() as tmp:
    card = Path(tmp) / 'disposable.img'
    shutil.copyfile(args.synthetic_card, card)
    with panel(args.emulator, args.main, card, ['--card-rw', '--names-early', '--dsp']) as cmd:
        def word(addr):
            return int.from_bytes(peek(cmd, addr, 4), 'big')

        def call(name, *values):
            for attempt in range(200):
                try:
                    response = cmd('call ' + ' '.join(hex(v) for v in [symbols[name], *values]))
                    return int(response.split('d0=')[1].split()[0], 16)
                except RuntimeError as error:
                    if "not main's spin" not in str(error):
                        raise
                    cmd('run 3')
            raise RuntimeError('Main task busy')

        def switch(on):
            assert call('modwerk_modset_switch', module, on) == 1
            for attempt in range(100):
                cmd('run 15')
                status = word(symbols['modwerk_modset_switch_result'])
                if status != 1:
                    break
            assert status == 0, (on, status)
            cmd('run 1500' if not on else 'run 100')

        def tap(code):
            for state in [1 << (code % 8), 0]:
                cmd(f'key {32 + code // 8} {state}')
                advance(35)

        def advance(ms):
            cmd(f'run {ms}')

        def level():
            return list(peek(cmd, 0x80000035, 2))  # MAIN and CUE project settings

        def master():
            starting = level()
            cmd('key 37 32')
            advance(80)
            stages = [starting]
            for delta in (-8, 8):
                cmd(f'knob 0x36 {delta}')
                advance(150)
                stages.append(level())
            cmd('key 37 0')
            advance(120)
            return stages

        def window(expected_source=None):
            starts = {WRAP: 'boundary', 0x400a2d5a:'source'}
            ends = {WRAP+6: 'boundary', 0x400a2d60:'source'}
            cmd('watch ' + ','.join(hex(pc) for pc in (*starts, *ends, AUDIO)))
            cmd('hits')
            metrics = ['mw_frame_skips','mw_frame_sheds','mw_frame_busy','mw_frame_count']
            before = [word(symbols[name]) for name in metrics]
            observed_sources = set()
            current = {}
            spans = {name:[] for name in starts.values()}
            for _ in range(300):
                advance(10)
                for raw in cmd('hits').split()[2:]:
                    hit = [int(x,16) for x in raw.split(':')]
                    stamp, pc = hit[:2]
                    if pc == AUDIO and hit[7] == 0x400a2d82:
                        observed_sources.add((hit[8], hit[10]))
                    if pc in starts:
                        current[starts[pc]] = stamp
                    elif pc in ends and ends[pc] in current:
                        name = ends[pc]
                        spans[name].append(stamp-current.pop(name))
            after = [word(symbols[name]) for name in metrics]
            result = dict(zip(metrics,[(b-a)&0xffffffff for a,b in zip(before,after)]))
            result['instruction_spans'] = {name:dict(count=len(v),minimum=min(v,default=None),
                                                      maximum=max(v,default=None)) for name,v in spans.items()}
            result['frame_peak_timer_counts_since_boot'] = word(symbols['mw_frame_max'])
            result['audio_lane_sources'] = sorted(observed_sources)
            if expected_source is not None:
                assert observed_sources == {(lane, expected_source) for lane in range(8)}, observed_sources
            return result

        for ms, key in [(3000,0x32),(3000,0x32),(500,0x31)]:
            advance(ms)
            tap(key)
        advance(2000)
        tap(0x11)
        tap(0x22)
        result = {}
        for name in ('empty','installed'):
            if name == 'installed':
                switch(1)
            result[name+'-master'] = master()
            result[name+'-stopped'] = window()
            tap(0x28)
            result[name+'-light'] = window(0)
            tap(0x27)
        # Assign all eight lanes to a dense A02 in ordinary Normal-16 time.
        for t in range(8):
            cmd(f'poke {bank+stride+t*lane_bytes:#x} 000000000000ffff')
        cmd(f'poke {bank+stride+0x8e50:#x} {peek(cmd,bank+0x8e50,8).hex()}')
        tap(0x1f)
        if args.performance_overlay:
            tap(0x1f)  # Row to Clip.
        else:
            cmd('knob 0x36 -7')
            advance(75)
        for t in range(8):
            if args.performance_overlay:
                tap(0x10+t)
            elif t:
                cmd('knob 0x36 1')
                advance(75)
            tap(1)
        tap(0x28)
        assert word(symbols['modwerk_runtime_api']) & 0xfff == 0x111
        result['installed-dense'] = window(1)
        tap(0x27)
        switch(0)
        # Independent stock global A02 uses the same eight dense track records.
        tap(0x28)
        cmd('poke 0x800065c0 01')
        advance(2300)
        result['empty-dense'] = window(1)
        tap(0x27)
        args.output.write_text(json.dumps(result,indent=2))
        a,b=result['empty-master'],result['installed-master']
        assert a == b and a[0] == a[2] and a[1][0] < a[0][0] and a[1][1] == a[0][1], (a,b)
