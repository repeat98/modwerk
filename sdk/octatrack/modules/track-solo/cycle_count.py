#!/usr/bin/env python3
"""Count Track Solo's executed instructions per entry in ot_emu (emulator, not chip cycles).

PC watches on each module entry and on its exit: a subscribed routine's return
address (read from the stack at its first entry) or a frame detour's stock
continuation. Each count runs from entry to exit, so a frame interrupt nested
inside a UI-task call is counted with it: an upper bound for that call.
The gestures are the dearest ones: activation updating all sixteen lamps, every
other track joining and leaving, release, on several anchors, with the frame
interrupt and both DSP cores running. ts_enc is not counted: no gesture here turns an
encoder, and its static bound is 15 instructions. Private inputs are supplied externally.
"""
import argparse
import json
from pathlib import Path
import shutil
from emulator_test import Emulator

CYCLES_PER_INSTRUCTION = 2.49216  # Tuner's model: 9.44 ns an instruction at 264 MHz
FRAME_ENTER_EXIT, FRAME_LEAVE_EXIT = 0x4000aee6, 0x4000d994


def run(a):
    out = a.output; out.mkdir(parents=True, exist_ok=False)
    inputs = a.inputs
    symbols = json.loads((inputs/'base-symbols.json').read_text())
    own = json.loads((inputs/'symbols.json').read_text())
    package = (inputs/'track-solo.mwrm').read_bytes()
    card = out/'card.private.img'; shutil.copy2(inputs/'card.private.img', card)
    e = Emulator(inputs/'ot_emu', inputs/'MAIN.raw', out, extra=['--card', card, '--mount', '--set', 'SOLO', '--project', 'TEST',
                 '--load-ms', '90000', '--rtc', '1793318400', '--dsp', '--frame'])
    rows = [0]*8
    read32 = lambda at: int.from_bytes(e.read(at, 4), 'big')
    advance = lambda ms: e.command('run '+str(ms))

    def invoke(at, *args):
        e.command('frame off'); advance(10)
        try:
            for n in range(100):
                try: return e.call(at, *args)
                except RuntimeError as err:
                    if "not main's spin" not in str(err) or n == 99: raise
                    advance(1)
        finally:
            e.command('frame on'); advance(10)

    def key(code, down=True, ms=40):
        row, bit = code >> 3, 1 << (code & 7)
        rows[row] = rows[row] | bit if down else rows[row] & ~bit
        e.command(f'key {0x20|row} {rows[row]}'); advance(ms)

    def hits():
        fields = e.command('hits').split()
        assert fields[0] == 'hits', fields
        return [(int(r.split(':')[0], 16), int(r.split(':')[1], 16), int(r.split(':')[7], 16)) for r in fields[2:]]

    try:
        assert e.project_loaded
        for off in range(0, len(package), 4096): e.write(0x47010000+off, package[off:off+4096])
        assert invoke(symbols['modwerk_backend_prepare'], 0, 0x47010000, len(package)) == 1
        assert invoke(symbols['modwerk_backend_publish'], 0) == 1
        assert invoke(symbols['modwerk_backend_retire'], 0) == 1
        record = invoke(symbols['modwerk_runtime_module'], 0); assert record
        base = read32(record+8) - own['ts_tick']
        entries = {name: base+own[name] for name in ('ts_tick', 'ts_key', 'ts_frame_enter', 'ts_frame_leave')}
        exits = {'ts_frame_enter': FRAME_ENTER_EXIT, 'ts_frame_leave': FRAME_LEAVE_EXIT}
        overlay = lambda: read32(base+own['ts_overlay'])
        for _ in range(3): key(0x32); key(0x32, False)
        advance(2200)
        invoke(base+own['ts_set'], 1, 0); advance(60)
        # Discover each subscribed routine's return address from its first entry.
        e.command('watch '+','.join(hex(v) for v in entries.values()))
        key(0x11); advance(100); key(0x10); advance(60); key(0x10, False); key(0x11, False); advance(200)
        for count, pc, ret in hits():
            for name, at in entries.items():
                if pc == at and name not in exits: exits[name] = ret
        assert set(exits) == set(entries), ('no first entry for', set(entries)-set(exits))
        e.command('watch '+','.join(hex(v) for v in sorted(set(entries.values()) | set(exits.values()))))
        hits()
        open_calls, samples = {}, {name: [] for name in entries}
        activations = 0
        for anchor in (1, 0, 7, 3):
            key(0x10+anchor); advance(700)
            assert overlay() == 1 << anchor, ('activation', anchor, hex(overlay()))
            activations += 1
            for other in range(8):
                if other != anchor: key(0x10+other); key(0x10+other, False)
            for other in range(8):
                if other != anchor: key(0x10+other); key(0x10+other, False)
            key(0x10+anchor, False); advance(200); assert overlay() == 0
            for count, pc, ret in hits():
                for name, at in entries.items():
                    if pc == at: open_calls.setdefault(name, []).append(count)
                    elif pc == exits[name] and open_calls.get(name):
                        samples[name].append(count - open_calls[name].pop())
        assert all(samples[name] for name in ('ts_tick', 'ts_key', 'ts_frame_enter', 'ts_frame_leave')), {k: len(v) for k, v in samples.items()}
        # Module-owned instructions only: watch every halfword of the image except
        # the two frame detours (counted above). A watch hits only an executed
        # instruction, so the hits inside a tick or key call are that call's own
        # instructions; stock callees and interrupts produce no hits.
        image_len = int.from_bytes(package[8:12], 'big')
        frame_code = range(base+own['ts_frame_enter'], base+own['ts_scope_begin'])
        own_pcs = [at for at in range(base, base+image_len, 2) if at not in frame_code]
        callers = ('ts_tick', 'ts_key')
        e.command('watch '+','.join(hex(v) for v in sorted(set(own_pcs) | {exits[n] for n in callers})))
        hits()
        windows, owned = {}, {name: [] for name in callers}
        def collect():
            for count, pc, ret in hits():
                for name in callers:
                    if pc == entries[name]: windows[name] = 0
                    elif pc == exits[name] and name in windows: owned[name].append(windows.pop(name))
                if base <= pc < base+image_len:
                    for name in windows: windows[name] += 1
        for anchor in (1, 0, 7, 3):
            key(0x10+anchor); advance(700); collect()
            assert overlay() == 1 << anchor, ('activation', anchor, hex(overlay()))
            for _ in range(2):
                for other in range(8):
                    if other != anchor: key(0x10+other); key(0x10+other, False); collect()
            key(0x10+anchor, False); advance(200); collect(); assert overlay() == 0
        assert all(owned[name] for name in callers), {k: len(v) for k, v in owned.items()}
        frame = max(samples['ts_frame_enter']) + max(samples['ts_frame_leave'])
        worst = max(owned['ts_tick']) + frame
        report = {'result': 'passed', 'hardwareTested': False,
                  'method': 'ot_emu PC-watch instruction counts. entryToExit: hits at entry and exit, stock callees and nested interrupts included. moduleOwned: hits on every executed instruction of the module image during the call.',
                  'activations': activations * 2, 'cyclesPerInstruction': CYCLES_PER_INSTRUCTION,
                  'entryToExit': {name: {'calls': len(v), 'max': max(v) if v else None} for name, v in samples.items()},
                  'moduleOwned': {name: {'calls': len(v), 'max': max(v)} for name, v in owned.items()},
                  'worstEventInstructions': worst, 'worstEventCycles': round(worst * CYCLES_PER_INSTRUCTION),
                  'worstEvent': 'dearest module-owned ts_tick call plus the dearest frame enter and leave',
                  'packageSha256': __import__('hashlib').sha256(package).hexdigest(),
                  'baseSha256': __import__('hashlib').sha256((inputs/'MAIN.raw').read_bytes()).hexdigest()}
        (out/'report.json').write_text(json.dumps(report, indent=2)+'\n')
        print(json.dumps(report, indent=2))
    finally:
        e.close()


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--inputs', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    run(p.parse_args())
