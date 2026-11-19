#!/usr/bin/env python3
"""FUNC + turn on E-Verb's main page, on the ColdFire port (ot_emu). Not hardware.

    python3 modules/everb/func_stops.py [--image <built image>]   # from sdk/octabam; about 5 min

Issue #438: in 0.1.0, FUNC + turn moved SIZE, DCY, ABSB and SPD between 0 and 127 only, where MIX
and DPTH also stop at 64. This builds verify.py's private image in a temporary folder (or takes
--image), boots it in out/emu/ot_emu the way scripts/capture-module-ui.py does (MKII panel, empty
scratch card, stopped transport), chooses E-Verb on track 1's FX2 and opens its main page. The
firmware's own panel code handles every key and detent; nothing is poked.

For each of the six knobs, with FUNC held, seven quick turns: one left, three right, three left,
each six one-detent packets 20 ms apart and then 1 s of rest, as a hand turns an encoder (a single
slow detent does not reach the next stop: the editor accumulates the turn first). After every turn
the knob's stored value is read from RAM: track 1's FX2 main-page bytes, 0x80000828 + slot, found by
diffing RAM around one plain detent and checked here against the defaults first. From its default
(all six are at or below 64), every knob must go 0 -> 64 -> 127 -> 127 -> 64 -> 0 -> 0. A plain turn
on A afterwards, long after A's FUNC turns, must still move one step per detent; right after a FUNC
turn the editor's leftover accumulation can absorb the first plain detent, in 0.1.0 and on stock
knobs alike. The image, the card and the emulator's state are deleted afterwards.
"""
import argparse
import importlib.util
import os
import pathlib
import selectors
import subprocess
import sys
import tempfile
import time

sys.dont_write_bytecode = True               # a stray __pycache__ in the module folder fails sdk:check
FOLDER = pathlib.Path(__file__).resolve().parent
if pathlib.Path.cwd().resolve() != FOLDER.parents[1]:
    sys.exit(f'[FAIL] everb: run from {FOLDER.parents[1]} (some module manifests read cwd-relative paths)')
_spec = importlib.util.spec_from_file_location('everb_verify', FOLDER / 'verify.py')
V = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(V)                 # its import sets up sys.path, the environment and the registry
import emu_card  # noqa: E402

EMU = V.ROOT / 'out/emu/ot_emu'
LIVE = 0x80000828                            # track 1, FX2 main page, slots A..F
KEYS = {'FUNC': 0x2d, 'FX2': 0x26, 'YES': 0x31, 'NO': 0x32}
ENCODERS = {name: index for index, name in enumerate(['A', 'B', 'C', 'D', 'E', 'F', 'LEVEL'])}
TURNS = (-1, +1, +1, +1, -1, -1, -1)
STOPS = [0, 64, 127, 127, 64, 0, 0]          # after each turn, from a first value at or below 64 (every default)
DETENTS, DETENT_MS, REST_MS, KEY_MS = 6, 20, 1000, 150


class Port:
    """ot_emu --interactive: panel keys and encoders in, RAM peeks out."""

    def __init__(self, image, work):
        card = work / 'card.img'
        (work / 'card-tree').mkdir()
        card.write_bytes(emu_card.build_image(str(work / 'card-tree'), 32))
        command = [str(EMU), '--image', str(image), '--card', str(card), '--dsp', '--frame', '--ms', '3000',
                   '--interactive', '--lcd', str(work / 'lcd.bin'), '--main-level', 'off', '--rtc', 'host', '--mkii']
        env = {k: v for k, v in os.environ.items() if not k.startswith('OT_')}
        self.proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.DEVNULL, cwd=work, env=env)
        self.poll = selectors.DefaultSelector()
        self.poll.register(self.proc.stdout, selectors.EVENT_READ)
        self.pending, self.rows = b'', [0] * 8
        try:
            self.reply((b'ready ',), 120)
        except BaseException:
            self.close()
            raise

    def reply(self, prefixes, timeout=60):
        deadline = time.monotonic() + timeout
        while True:
            while b'\n' in self.pending:
                line, self.pending = self.pending.split(b'\n', 1)
                if line.startswith(b'err'):
                    raise RuntimeError(line.decode())
                if line.startswith(prefixes):
                    return line
            if time.monotonic() >= deadline or self.proc.poll() is not None:
                raise RuntimeError('ot_emu stopped answering')
            if self.poll.select(timeout=1):
                chunk = os.read(self.proc.stdout.fileno(), 1 << 16)
                if not chunk:
                    raise RuntimeError('ot_emu exited')
                self.pending += chunk

    def send(self, line, prefixes=(b'ok',)):
        self.proc.stdin.write((line + '\n').encode())
        self.proc.stdin.flush()
        return self.reply(prefixes)

    def run(self, ms):
        self.send(f'run {ms}')

    def key(self, name, down):
        code, bit = KEYS[name], 1 << (KEYS[name] & 7)
        self.rows[code >> 3] = self.rows[code >> 3] | bit if down else self.rows[code >> 3] & ~bit
        self.send(f'key {0x20 | (code >> 3)} {self.rows[code >> 3]}')
        self.run(KEY_MS)

    def press(self, *names):
        for name in names:
            self.key(name, True)
        for name in reversed(names):
            self.key(name, False)

    def turn(self, encoder, delta, ms):
        self.send(f'knob {0x30 | ENCODERS[encoder]} {delta & 255}')
        self.run(ms)

    def peek(self, address, length):
        return bytes.fromhex(self.send(f'peek {address:#x} {length}', (b'peek',)).split()[1].decode())

    def close(self):
        try:
            self.send('quit')
            self.proc.wait(timeout=10)
        except (RuntimeError, OSError, subprocess.TimeoutExpired):
            pass
        if self.proc.poll() is None:
            self.proc.terminate()
            self.proc.wait(timeout=10)
        self.poll.close()


def measure(image, work):
    port = Port(image, work)
    try:
        port.run(3000); port.press('YES'); port.run(2000); port.press('NO')    # the boot's date prompt
        port.press('FUNC', 'FX2'); port.turn('LEVEL', 30, 200); port.press('YES'); port.run(300)
        port.press('FX2'); port.run(2500)                                      # E-Verb's main page
        out = {'defaults': list(port.peek(LIVE, 6))}
        for slot, encoder in enumerate('ABCDEF'):
            seen = [port.peek(LIVE + slot, 1)[0]]
            port.key('FUNC', True)
            for direction in TURNS:
                for _ in range(DETENTS):
                    port.turn(encoder, direction, DETENT_MS)
                port.run(REST_MS)
                seen.append(port.peek(LIVE + slot, 1)[0])
            port.key('FUNC', False)
            port.run(300)
            out[encoder] = seen
        before = port.peek(LIVE, 1)[0]
        port.turn('A', +1, 300); port.turn('A', +1, 300)
        out['plain'] = [before, port.peek(LIVE, 1)[0]]
        return out
    finally:
        port.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--image', type=pathlib.Path, help='a built image instead of building the current source')
    a = ap.parse_args()
    if not EMU.is_file():
        sys.exit(f'[FAIL] everb: missing {EMU} (the ColdFire port: make emu-cf)')
    g = V.Gates()
    print('== everb: FUNC + turn stops on the main page (ot_emu, private image; not hardware)')
    with tempfile.TemporaryDirectory(prefix='everb-func.') as tmp:
        work = pathlib.Path(tmp)
        image = a.image.resolve() if a.image else V.build_image(work)[0]
        out = measure(image, work)
    defaults = V.knobs()[:6]
    g.check('panel: E-Verb main page, knobs read at their defaults', out['defaults'] == defaults,
            f'{out["defaults"]} (expected {defaults})')
    for slot, encoder in enumerate('ABCDEF'):
        seen = out[encoder]
        g.check(f'func stops: {encoder} {V.NAMES[slot]}', seen[1:] == STOPS,
                f'{" -> ".join(map(str, seen))} for FUNC + turn {" ".join("+" if d > 0 else "-" for d in TURNS)}'
                + ('' if seen[1:] == STOPS else f' (expected {" -> ".join(map(str, STOPS))})'))
    g.check('plain turn: one step per detent', out['plain'][1] == out['plain'][0] + 2, f'{out["plain"][0]} -> {out["plain"][1]} after two detents')
    print(f"== everb: {'all gates pass' if not g.failed else str(len(g.failed)) + ' failed: ' + ', '.join(g.failed)}")
    return 1 if g.failed else 0


if __name__ == '__main__':
    sys.exit(main())
