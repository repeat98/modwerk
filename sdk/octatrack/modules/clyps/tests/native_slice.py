"""Replay a T2 SRC request or its independent stock composite on a synthetic MKII card."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tempfile

from mkii_panel import panel, peek

parser = argparse.ArgumentParser(description=__doc__)
for name in ('emulator', 'main', 'symbols', 'synthetic_card', 'output'):
    parser.add_argument(name, type=Path)
parser.add_argument('--stock', action='store_true')
parser.add_argument('--midi-wire', type=Path, help='Record UART0 transmit writes on a two-channel fixture')
parser.add_argument('--stock-midi-home', action='store_true',
                    help='Keep stock global A01 throughout as a MIDI-only control')
args = parser.parse_args()
if args.stock_midi_home and not (args.stock and args.midi_wire):
    parser.error('--stock-midi-home requires --stock and --midi-wire')
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

        events, writes, wraps = [], [], []
        wire = []
        tick = 0
        recording = False

        def advance(ms):
            global tick
            for start in range(0, ms, 5):
                cmd(f'run {min(5, ms-start)}')
                if not recording:
                    continue
                for raw in cmd('hits').split()[2:]:
                    hit = [int(value, 16) for value in raw.split(':')]
                    pc = hit[1]
                    if pc == TICK:
                        tick += 1
                    elif pc == WRAP:
                        wraps.append(tick)
                    elif pc in (AUDIO, MIDI) and hit[7] in (0x400a2d82, 0x400a39ca):
                        events.append([tick, pc, hit[8], hit[11], hit[10]])
                for raw in cmd('writes').split()[2:]:
                    sample, pc, addr, value, width, _ = raw.split(':')
                    if args.midi_wire and int(addr, 16) == 0xfc06000c:
                        wire.append([float(sample), int(value, 16)])
                    writes.append([int(pc,16), int(addr,16), int(width), int(value,16)])

        def until(target):
            for attempt in range(1500):
                if tick >= target:
                    return
                advance(5)
            raise RuntimeError(('clock stalled', tick))

        def state():
            return word(symbols['modwerk_runtime_api']) & 0xffffff

        def storage():
            result = hashlib.sha256()
            for base, size in [(bank, 16*stride), (bank+0x8ed80, 4*0x18b2), (bank+0x9504a, 4*0x18b2)]:
                for pos in range(0, size, 1024):
                    result.update(peek(cmd, base+pos, min(1024, size-pos)))
            return result.hexdigest()

        def row_heads():
            return [word(word(symbols['modwerk_runtime_event_row'] + 4*(slot-4))) for slot in (42,40,41,63,64,65)]

        # Read the last stock LCD composer plane independently of module state.
        def lettering(x, band, groups):
            frame = peek(cmd, word(0x400b970c), 1024)
            return all(((frame[(x + 4*i + j)*8 + 7-band] >> 1) & 31) == column
                       for i, glyph in enumerate(groups) for j, column in enumerate(glyph))

        play = [(31,5,2),(31,16,16),(30,5,30),(3,28,3)]
        queued = [(14,25,30),(15,16,15),(31,21,17),(15,16,15),(31,21,17),(31,17,14)]
        zero, one, two = (31,17,31), (18,31,16), (29,21,23)
        assert call('modwerk_runtime_active') == 0
        initial_heads = row_heads()
        pool = call('modwerk_runtime_free', 0)
        for ms, key in [(3000,0x32),(3000,0x32),(500,0x31)]:
            cmd(f'run {ms}')
            tap(key)
        cmd('run 2000')
        tap(0x11)
        tap(0x22)
        if args.midi_wire:
            # OS 1.40C STEP_LOCKS and MIDI_TRACKS layouts (Octabam).
            for lane, mask, note in ((0, 0x1111, 48), (1, 0x0404, 67)):
                record = bank + 0x48d0 + lane * 0x8b0
                cmd(f'poke {record:#x} {mask:016x}')
                for step in range(16):
                    if mask & (1 << step):
                        cmd(f'poke {record+0x30+32*step:#x} {note:02x}')
                        if lane == 1:
                            cmd(f'poke {record+0x30+32*step+21:#x} {32+step:02x}')
                for part in range(4):
                    setup = bank + 0x8f262 + part * 0x18b2 + lane * 0x24
                    cmd(f'poke {setup:#x} {lane + 1:02x}')
                    if lane == 1:
                        cmd(f'poke {setup+0x15:#x} 01')
                        enables = bank + 0x8f162 + part * 0x18b2 + lane * 32 + 30
                        cmd(f'poke {enables:#x} 3c')
            cmd('poke 0x8000000c 00000000')
            cmd('poke 0x46c78d6a 0000')
            cmd('watchmem 0xfc06000c 1')
        # Compose stock A02 from A01, changing only T2's trigger mask.
        # Both runs get identical synthetic pattern bytes before PLAY.
        for pos in range(0, stride, 128):
            data = peek(cmd, bank+pos, min(128, stride-pos))
            cmd(f'poke {bank+stride+pos:#x} {data.hex()}')
        home_mask = peek(cmd, bank+lane_bytes, 8)
        assert home_mask != bytes.fromhex('0000000000001109')
        cmd(f'poke {bank+stride+lane_bytes:#x} 0000000000001109')
        initial_storage = storage()
        if not args.stock:
            switch(1)
            assert all(row_heads())
            tap(0x1f)
            tap(0x22)
            cmd('knob 0x36 1')
            cmd('run 65')
        cmd('watch ' + ','.join(hex(address) for address in (TICK, WRAP, AUDIO, MIDI)))
        cmd('watchmem 0x80001904 256')
        cmd('hits')
        cmd('writes')
        recording = True
        tap(0x28)
        until(30)
        if args.stock:
            if not args.stock_midi_home:
                cmd('poke 0x800065c0 01')
        else:
            tap(0x31)
            assert state() == 0x010000, hex(state())
            assert lettering(70, 3, queued) and lettering(32, 2, play), 'SRC queue display'
        until(142)
        recording = bool(args.midi_wire)
        assert len(wraps) == 1 and 30 < wraps[0] < 142, wraps
        for clock, pc, lane, step, source in events:
            expected = int(not args.stock_midi_home and clock >= wraps[0] and (args.stock or (pc == AUDIO and lane == 1)))
            assert source == expected, (clock, pc, lane, source, expected)
        for phase in (False, True):
            assert {e[2] for e in events if e[1] == AUDIO and (e[0] >= wraps[0]) == phase} == set(range(8))
        if not args.stock:
            assert state() == 0x010010, hex(state())
            assert lettering(32, 3, play), 'SRC playing display'
            cmd('knob 0x36 -1')
            if args.midi_wire:
                advance(65)
            else:
                cmd('run 65')
            tap(0x31)
            assert state() == 0x10, hex(state())
        if args.midi_wire:
            until(158)  # Both UART witnesses stop at the same stock tick.
        tap(0x27)
        if args.midi_wire:
            advance(250)
            recording = False
            args.midi_wire.write_text(json.dumps(wire))
        if not args.stock:
            assert state() == 0x010010, hex(state())
            tap(0x1f)
            assert all(lettering(12+15*t, 6, (zero, two if t == 1 else one)) for t in range(8)), 'ARR sources'
            switch(0)
        assert initial_heads == row_heads()
        assert initial_storage == storage()
        assert call('modwerk_runtime_active') == 0
        result = dict(wraps=wraps, events=[e[:4] for e in events], writes=[], initial_pool=pool,
                      final_pool=call('modwerk_runtime_free', 0))
        times = [w for w in writes if any(a <= w[1] < a+96 for a in (0x80001904,0x80001984))]
        assert times
        for pc, addr, width, value in times:
            result['writes'].append([pc, addr, width, (value-times[0][3]) & 0xffffffff])
        args.output.write_text(json.dumps(result))
        assert result['final_pool'] == pool, result['final_pool']

        if args.midi_wire:
            # One further transport on the unloaded base, after the slice checks.
            cmd('hits')
            cmd('writes')
            tick = 0
            wire.clear()
            recording = True
            tap(0x28)
            until(158)
            tap(0x27)
            advance(250)
            args.midi_wire.with_suffix('.off.json').write_text(json.dumps(wire))
