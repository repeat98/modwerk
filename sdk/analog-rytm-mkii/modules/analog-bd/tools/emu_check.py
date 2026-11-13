#!/usr/bin/env python3
"""BD ANALOG's regression run in rytm-emu (emulator only: no sound is judged).

    python3 -B tools/emu_check.py IMAGE.syx [--emu DIR] [--top]

IMAGE must be built on the Modwerk base (digital voices).

DIR holds rytm-emu's target/release (default ~/.cache/modwerk-upstream/rytm-emu,
from `npm run upstream:tools`). In a scratch folder it boots IMAGE on a blank
card, chooses BD ANALOG on track 1, then checks:

  select   choosing the machine plays nothing (the voice's stream stays 0)
  keys     RECORD, trigs, PLAY and STOP leave B's label at TON (808)
  tap      one tap of encoder B gives SWT (909) and the 909 plays
  meter    the render's cost from the base's mw_voice_meter

Clocks are rytm-emu 2ac0f1f's (presses 12M long, off the --every grid)."""
import array
import os
import pathlib
import subprocess
import sys
import tempfile
import wave

ID_TABLE, ID_STRIDE, ID_SHORT, ID_B = 0x401bfbc8, 52, 48, 346
STREAM0 = 0x80006bf8
BLOCK_TICKS = 88000
SLOT = 36


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    image = pathlib.Path(sys.argv[1]).resolve()
    emu = pathlib.Path(sys.argv[sys.argv.index('--emu') + 1] if '--emu' in sys.argv
                       else '~/.cache/modwerk-upstream/rytm-emu').expanduser() / 'target' / 'release'
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        card = str(tmp / 'card.img')
        env = dict(os.environ, DTEMU_FW=str(image))

        def boot(*args):
            return subprocess.run([str(emu / 'dtboot'), str(image), '--every', '999G', '--card', card, *args],
                                  capture_output=True, text=True, env=env)

        def press(key, at):
            return ['--press', f'{key}@{at}M:12M']

        def peek(snap, addr, n):
            out = subprocess.run([str(emu / 'dtpeek'), str(snap), 'mem', f'{addr:x}', str(n)],
                                 capture_output=True, text=True, env=env).stdout
            return bytes.fromhex(''.join(line.split(':', 1)[1] for line in out.splitlines() if ':' in line))

        def word(snap, addr):
            return int.from_bytes(peek(snap, addr, 4), 'big')

        def label(snap):
            ptr = word(snap, ID_TABLE + ID_B * ID_STRIDE + ID_SHORT)
            return peek(snap, ptr, 4).split(b'\0')[0].decode('latin1')

        def find(snap, hexstr):
            out = subprocess.run([str(emu / 'dtpeek'), str(snap), 'find', hexstr],
                                 capture_output=True, text=True, env=env).stdout.split()
            return int(out[0], 16) if out and all(c in '0123456789abcdef' for c in out[0]) else None

        # Format the card, dismiss the three notices, choose BD ANALOG.
        boot('--instr', '9G', '--card-save', *press('YES', 3900), *press('NO', 6001), *press('NO', 6503))
        # BD ANALOG: the last of BD's section on a base with machine-list sections, four
        # below BD HARD; --top for a base without them, where it tops the list
        ups = ([a for i in range(8) for a in press('UP', 13701 + 100 * i)] if '--top' in sys.argv
               else [a for i in range(4) for a in press('DOWN', 13701 + 100 * i)])
        sel = tmp / 'sel.snap'
        boot('--instr', '15G', *press('NO', 9201), *press('NO', 10001), *press('NO', 10801), *press('NO', 11601),
             '--press', 'FUNC@13201M:300M', *press('SRC', 13301), *ups, *press('YES', 14601), '--save', str(sel))
        results = []
        stream = peek(sel, STREAM0, 128)
        results.append(('select', not any(stream), f'stream {"zero" if not any(stream) else "not zero"}'))

        seq = [*press('RECORD', 15201), *press('T1', 15301), *press('T9', 15351), *press('RECORD', 15401),
               *press('PLAY', 15501), *press('STOP', 15601), *press('PLAY', 15701)]
        keys = tmp / 'keys.snap'
        boot('--load', str(sel), '--instr', '16050M', *seq, '--save', str(keys))
        results.append(('keys', label(keys) == 'TON', f'B reads {label(keys)}'))

        tap = tmp / 'tap.snap'
        r = boot('--load', str(sel), '--instr', '17500M', *seq, *press('PUSH_B', 16101), '--save', str(tap))
        # The stream is cleared after the mixer each block, so listen to the DAC side:
        # voice 1's slot of the codec frame, for half a second after the tap.
        wav = tmp / 'tap.wav'
        boot('--load', str(tap), '--instr', '19500M', '--wav', str(wav))
        with wave.open(str(wav)) as w:
            n = w.getnchannels()
            peak = max(abs(v) for v in array.array('h', w.readframes(w.getnframes()))[0::n])
        ok = label(tap) == 'SWT' and peak > 1000 and 'fault' not in r.stdout.lower()
        results.append(('tap', ok, f'B reads {label(tap)}, voice 1 peak {peak} of 32767 after it'))

        # The base's mw_voice_meter: a marker, then {blocks, ticks, max} per slot 34..43.
        meter = find(tap, 'ab0cc0de')
        if meter is not None:
            at = meter + 4 + 12 * (SLOT - 34)
            n, ticks, top = (word(tap, at + 4 * i) for i in range(3))
            results.append(('meter', n > 0, f'{n} blocks, mean {ticks / max(n, 1) / BLOCK_TICKS:.1%}, '
                                            f'max {top / BLOCK_TICKS:.1%} of a block (808 then 909)'))
        else:
            results.append(('meter', False, 'mw_voice_meter not found'))

    for name, ok, note in results:
        print(f'{"PASS" if ok else "FAIL"}  {name:10s} {note}')
    sys.exit(0 if all(ok for _, ok, _ in results) else 1)


if __name__ == '__main__':
    main()
