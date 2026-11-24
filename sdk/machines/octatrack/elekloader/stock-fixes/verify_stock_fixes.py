#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The base's stock OS fixes (README.md here), run in ot_emu on a built base and on the original OS.

    python3 -B verify_stock_fixes.py --emulator OT_EMU --image TWIN/MAIN.raw [--max 4000000000]
    python3 -B verify_stock_fixes.py --emulator OT_EMU --image section_3_MAIN_OS.bin --stock

With --stock every check expects the stock bug, so the same states show the old behaviour and the fix. Each check
pokes its state into a pattern of bank A in RAM, runs stock's own routine with the port's `call` (a routine run as main)
or through the panel, reads the result back and puts the pattern back. Nothing here is hardware evidence: the panel's
LEDs, audio and timing are the unit's. Needs Python 3, the port and, for the Direct Jump Kyoti case (--dj-splice),
ColdFire binutils (m68k-elf-as/ld/objcopy). The images stay outside Git."""
import argparse
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parents[4]
EMU_CARD = APP / 'sdk/octabam/tools/emu/emu_card.py'
DJ_TRIGSCALE = APP / 'sdk/octatrack/modules/direct-jump-kyoti/patch_trigscale.s'

HASCONT, BANK_GRID = 0x4009a464, 0x4000fd78        # (pattern, bank) -> content; (bank) -> any pattern has content
BLOB, PAT, BANK = 0x400e21e0, 0x8ed8, 0x9b340
AUD, MID, MBLK, AROW, MROW = 0x91a, 0x8b0, 0x48d0, 0x59, 0x4900
MIRROR = 0x1001614e                                 # the erase workers' copy of the bank's pattern area
SCRATCH = 0x41480000                                # inside the base's boot reserve, past its RAM: unused by stock
LIVE_ERASE = 0x40041af4                             # opcode 8's LIVE branch: [NO] + a knob as the playhead passes
MIDI_SIDE, CUR_TRK, CUR_TRK2, CUR_PAT = 0x80000012, 0x100b14cc, 0x80000000, 0x100b14d0
PLAYHEAD, ER_TRIGS, ER_KNOB, ER_MASK = 0x800064e0, 0x460d1a90, 0x460d1a94, 0x460d1a98
DISPATCH, STEPS, SCALES = 0x40044584, 0x800064d0, 0x8000663e
BLOB_PTR, REC_OFF, PART_STRIDE, REC_CACHE = 0x46c82456, 0x8f382, 0x18b2, 0x80000c94
PART_TAIL = 0x40062216
KEYS = {'NO': 0x32, 'YES': 0x31, 'PLAY': 0x28, 'PTN': 0x2e, **{'T%d' % (i + 1): i for i in range(16)}}
FAILS = []


def check(ok, what):
    print(('  ok    ' if ok else '  FAIL  ') + what, flush=True)
    if not ok:
        FAILS.append(what)


def load_card():
    import importlib.util
    spec = importlib.util.spec_from_file_location('emu_card', EMU_CARD)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Port:
    """ot_emu's line protocol (Direct Jump Kyoti's verify.py has the same): keys by scan row, emulated
    milliseconds, memory reads and writes, borrowed calls and PC watches."""

    def __init__(self, emu, image, work, extra=()):
        card = work / 'card.img'
        (work / 'tree').mkdir()
        card.write_bytes(load_card().build_image(str(work / 'tree'), 32))
        command = [str(emu), '--image', str(image), '--card', str(card), '--dsp', '--frame', '--ms', '3000',
                   '--interactive', '--main-level', 'off', '--rtc', 'host', '--mkii', *extra]
        env = {k: v for k, v in os.environ.items() if not k.startswith('OT_')}
        self.port = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                     cwd=work, env=env)
        self.pending, self.rows = b'', [0] * 8
        self.reply(('ready ',), 600)
        for _ in range(3):
            self.tap('NO')                                   # the empty card's prompts
        self.send('run 1500')

    def reply(self, prefixes, timeout=300):
        deadline = time.monotonic() + timeout
        while True:
            while b'\n' in self.pending:
                line, self.pending = self.pending.split(b'\n', 1)
                if line.decode('latin-1').startswith(prefixes):
                    return line.decode('latin-1')
            if time.monotonic() > deadline or self.port.poll() is not None:
                raise RuntimeError('the port stopped answering')
            self.pending += os.read(self.port.stdout.fileno(), 65536)

    def send(self, line):
        self.port.stdin.write((line + '\n').encode())
        self.port.stdin.flush()
        answer = self.reply(('ok', 'err', 'peek ', 'hits '))
        if answer.startswith('err'):
            raise RuntimeError(line + ': ' + answer)
        return answer

    def key(self, name, down, ms=120):
        code = KEYS[name]
        row = code >> 3
        self.rows[row] = self.rows[row] | 1 << (code & 7) if down else self.rows[row] & ~(1 << (code & 7))
        self.send('key %d %d' % (0x20 | row, self.rows[row]))
        self.send('run %d' % ms)

    def tap(self, name, ms=120):
        self.key(name, True, ms)
        self.key(name, False, ms)

    def mem(self, address, length):
        return b''.join(bytes.fromhex(self.send('peek %d %d' % (a, min(4096, address + length - a)))[5:])
                        for a in range(address, address + length, 4096))

    def int(self, address, length=4):
        return int.from_bytes(self.mem(address, length), 'big')

    def poke(self, address, data):
        for at in range(0, len(data), 2048):
            self.send('poke %d %s' % (address + at, data[at:at + 2048].hex()))

    def call(self, *words):
        """A routine run as main: the port takes it only while main waits at its spin."""
        for _ in range(400):
            try:
                return int(self.send('call ' + ' '.join('%d' % w for w in words)).split('d0=')[1], 16)
            except RuntimeError as error:
                if "not main's spin" not in str(error):
                    raise
                self.send('run 1')
        raise RuntimeError('main never reached its spin for call %#x' % words[0])

    def close(self):
        try:
            self.send('quit')
            self.port.wait(timeout=10)
        except Exception:
            self.port.kill()


def pattern(p, bank=0):
    return BLOB + bank * BANK + p * PAT


def trac(p, t, bank=0):
    return pattern(p, bank) + t * AUD


def mtra(p, t, bank=0):
    return pattern(p, bank) + MBLK + t * MID


def lock_row(side, p, t, step):
    return (trac(p, t) + AROW if side == 'A' else mtra(p, t) + 0x30) + 32 * step


def set_mask(port, block, layer, step, mirror=False):
    """Step `step`'s bit in the 64-bit mask at block + layer (+0 steps 32-63, +4 steps 0-31), and its mirror byte."""
    at = block + layer + (4 if step < 32 else 0)
    value = port.int(at) | 1 << (step % 32)
    port.poke(at, value.to_bytes(4, 'big'))
    if mirror:
        port.poke(at - BLOB + MIRROR, value.to_bytes(4, 'big'))


def tl_bit(port, side, p, t, step):
    block = trac(p, t) if side == 'A' else mtra(p, t)
    return port.int(block + 0x10 + (4 if step < 32 else 0)) >> (step % 32) & 1


class Saved:
    """Pattern p of bank A (and its mirror) as found, put back on exit."""

    def __init__(self, port, *patterns):
        self.port, self.saved = port, [(pattern(p), port.mem(pattern(p), PAT)) for p in patterns]
        self.saved += [(a - BLOB + MIRROR, port.mem(a - BLOB + MIRROR, PAT)) for a, _ in list(self.saved)]

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        for address, data in self.saved:
            self.port.poke(address, data)


def apply(port, state, p):
    for kind, *a in state:
        if kind == 'mask':                       # (side, track, layer, step)
            side, t, layer, step = a
            set_mask(port, trac(p, t) if side == 'A' else mtra(p, t), layer, step)
        else:                                    # ('lock', side, track, step, param, value)
            side, t, step, param, value = a
            port.poke(lock_row(side, p, t, step) + param, bytes([value]))


# (name, state, stock answer, fixed answer under [PTN] / a module's call, fixed answer under [BANK])
CONTENT = [
    ('nothing', [], 0, 0, 0),
    ('an audio sample trig', [('mask', 'A', 0, 0x00, 0)], 1, 1, 1),
    ('an audio trigless trig, no lock', [('mask', 'A', 0, 0x08, 0)], 1, 1, 1),
    ('an audio trigless lock with a locked parameter (T1, step 1)',
     [('mask', 'A', 0, 0x10, 0), ('lock', 'A', 0, 0, 0, 0x40)], 0, 1, 1),
    ('an audio trigless lock with a locked parameter (T3, step 17, parameter 5)',
     [('mask', 'A', 2, 0x10, 16), ('lock', 'A', 2, 16, 5, 0x10)], 0, 1, 1),
    ('an audio trigless lock with a locked parameter (T8, step 40, parameter 31)',
     [('mask', 'A', 7, 0x10, 39), ('lock', 'A', 7, 39, 31, 0x22)], 0, 1, 1),
    ('an audio trigless lock with nothing locked', [('mask', 'A', 0, 0x10, 0)], 0, 0, 0),
    ('an audio lock value on a step with no trig and no lock flag', [('lock', 'A', 0, 0, 0, 0x40)], 0, 1, 0),
    ('an audio trigless trig with a lock', [('mask', 'A', 0, 0x08, 0), ('lock', 'A', 0, 0, 0, 0x40)], 1, 1, 1),
    ('a MIDI note trig', [('mask', 'M', 0, 0x00, 0)], 1, 1, 1),
    ('a MIDI trigless trig', [('mask', 'M', 0, 0x08, 0)], 1, 1, 1),
    ('a MIDI trigless lock with a locked parameter (T1, step 1)',
     [('mask', 'M', 0, 0x10, 0), ('lock', 'M', 0, 0, 0, 0x40)], 0, 1, 1),
    ('a MIDI trigless lock with a locked parameter (T8, step 64, parameter 31)',
     [('mask', 'M', 7, 0x10, 63), ('lock', 'M', 7, 63, 31, 0x01)], 0, 1, 1),
    ('a MIDI trigless lock with nothing locked', [('mask', 'M', 0, 0x10, 0)], 0, 0, 0),
    ('a MIDI lock value on a step with no trig and no lock flag', [('lock', 'M', 0, 0, 0, 0x40)], 0, 1, 0),
    ('a MIDI trigless trig with a lock', [('mask', 'M', 0, 0x08, 0), ('lock', 'M', 0, 0, 0, 0x40)], 1, 1, 1),
    # [BANK]'s bound: 16 empty trigless locks above the locked one are checked first (highest step first), and the
    # pattern then reads as stock reads it. [PTN] scans every lock byte.
    ('16 empty audio trigless locks (steps 2-17) above a locked one (step 1)',
     [('mask', 'A', 0, 0x10, s) for s in range(17)] + [('lock', 'A', 0, 0, 0, 0x40)], 0, 1, 0),
]


def kits_search_unit(work):
    """KITS' search for "the next empty pattern" (kits.s pattern_clone, Sam Banks, MIT), as a routine
    (current pattern, bank) -> the pattern it would copy over, 16 for none. Linked at SCRATCH."""
    source = work / 'kits_search.s'
    source.write_text('''
        .text
        .globl  kits_search
kits_search:
        lea     -8(%sp),%sp
        movem.l %d4/%d6,(%sp)
        move.l  12(%sp),%d4             | the current pattern
        move.l  16(%sp),%d6             | the bank
2:      addq.l  #1,%d4                  | as kits.s: d4 = the next empty pattern
        cmpi.l  #16,%d4
        beq.s   6f
        move.l  %d6,-(%sp)
        move.l  %d4,-(%sp)
        jsr     0x4009a464
        addq.l  #8,%sp
        tst.l   %d0
        bne.s   2b
6:      move.l  %d4,%d0
        movem.l (%sp),%d4/%d6
        lea     8(%sp),%sp
        rts
''')
    return assemble(source, SCRATCH, work)


def assemble(source, at, work):
    tools = {name: shutil.which('m68k-elf-' + name) for name in ('as', 'ld', 'objcopy')}
    if not all(tools.values()):
        return None
    obj, elf, out = work / (source.stem + '.o'), work / (source.stem + '.elf'), work / (source.stem + '.bin')
    subprocess.run([tools['as'], '-mcpu=5407', str(source), '-o', str(obj)], check=True)
    subprocess.run([tools['ld'], '-e', '0', '-Ttext=%#x' % at, '-o', str(elf), str(obj)], check=True)
    subprocess.run([tools['objcopy'], '-O', 'binary', '-j', '.text', str(elf), str(out)], check=True)
    return out.read_bytes()


def part_content(port, stock, kits):
    print('1. the pattern content test 0x4009a464 (the [PTN] grid, the chain view, KITS), and the [BANK] grid')
    want = (lambda row: row[2]) if stock else (lambda row: row[3])
    bank_want = (lambda row: row[2]) if stock else (lambda row: row[4])
    check(port.call(HASCONT, 5, 0) == 0 and port.call(BANK_GRID, 0) & 0xff == 0,
          'A06 and bank A are empty after boot')
    for row in CONTENT:
        with Saved(port, 5):
            apply(port, row[1], 5)
            got, bank = port.call(HASCONT, 5, 0), port.call(BANK_GRID, 0) & 0xff
        check(bool(got) == bool(want(row)) and bool(bank) == bool(bank_want(row)),
              'A06 holding %s: content %d, bank A lit %d (expected %d, %d)' % (row[0], got, bank, want(row), bank_want(row)))
    check(port.call(HASCONT, 5, 0) == 0, 'A06 put back: empty again')
    if kits is None:
        print('  [SKIP] KITS\' search: no ColdFire binutils')
        return
    port.poke(SCRATCH, kits)
    for name, state, stock_pick, fixed_pick in (
            ('A02 holds only an audio trigless lock with a locked parameter',
             [('mask', 'A', 0, 0x10, 3), ('lock', 'A', 0, 3, 2, 0x40)], 1, 2),
            ('A02 holds only a MIDI trigless lock with a locked parameter',
             [('mask', 'M', 1, 0x10, 3), ('lock', 'M', 1, 3, 2, 0x40)], 1, 2),
            ('A02 holds only a lock value on a step with no trig', [('lock', 'A', 0, 3, 2, 0x40)], 1, 2),
            ('A02 holds an audio trigless trig', [('mask', 'A', 0, 0x08, 3)], 2, 2),
            ('A02 holds only an empty trigless lock', [('mask', 'A', 0, 0x10, 3)], 1, 1)):
        with Saved(port, 1):
            apply(port, state, 1)
            got = port.call(SCRATCH, 0, 0)
        expect = stock_pick if stock else fixed_pick
        check(got == expect, 'KITS on A01, %s, A03 empty: copies over A%02d (expected A%02d%s)'
              % (name, got + 1, expect + 1, ', A02 is lost' if expect == 1 and fixed_pick != 1 else ''))


def erase_case(port, side, t, step, locks, erase, stock, keep, veto=None):
    """A trigless lock on (side, track, step) with `locks` {param: value}, then stock's LIVE erase of the params in
    `erase`: the trigless-lock bit after it (1 lit, 0 gone)."""
    p = 0
    with Saved(port, p):
        block = trac(p, t) if side == 'A' else mtra(p, t)
        set_mask(port, block, 0x10, step, mirror=True)
        if veto is not None:
            set_mask(port, block, veto, step, mirror=True)
        for param, value in locks.items():
            at = lock_row(side, p, t, step) + param
            port.poke(at, bytes([value]))
            port.poke(at - BLOB + MIRROR, bytes([value]))
        port.poke(MIDI_SIDE, (1 if side == 'M' else 0).to_bytes(4, 'big'))
        port.poke(CUR_TRK, bytes([t]))
        port.poke(CUR_TRK2, bytes([t]))
        port.poke(CUR_PAT, bytes([p]))
        for group in erase:
            port.poke(PLAYHEAD + t + (8 if side == 'M' else 0), bytes([step]))
            port.poke(ER_TRIGS, bytes(4))
            port.poke(ER_KNOB, (1).to_bytes(4, 'big'))
            port.poke(ER_MASK, sum(1 << q for q in group).to_bytes(4, 'big'))
            port.call(LIVE_ERASE)
            port.poke(ER_KNOB, bytes(4))
        bit = tl_bit(port, side, p, t, step)
        mirror = port.int(block + 0x10 + (4 if step < 32 else 0) - BLOB + MIRROR) >> (step % 32) & 1
        row = port.mem(lock_row(side, p, t, step), 32)
        port.poke(MIDI_SIDE, bytes(4))
    erased = {q for group in erase for q in group}
    kept = all(row[q] == (0xff if q in erased else locks.get(q, 0xff)) for q in range(32))
    return bit, mirror, kept


def part_erase(port, stock):
    print('2. erasing a trigless lock\'s last parameter lock (LIVE erase, 0x40041af4)')
    for side in ('A', 'M'):
        name = 'audio' if side == 'A' else 'MIDI'
        for what, t, step, locks, erase, fixed_keep, veto in (
                ('its one lock erased', 1, 4, {5: 0x40}, [[5]], 0, None),
                ('two locks, one erased', 1, 6, {0: 0x40, 12: 0x00}, [[0]], 1, None),
                ('two locks, both erased one after the other', 1, 6, {0: 0x40, 12: 0x00}, [[0], [12]], 0, None),
                ('an empty one (FUNC + TRIG), a never-locked parameter erased', 1, 8, {}, [[3]], 1, None),
                ('its one lock erased by a two-parameter mask', 1, 9, {2: 0x40}, [[2, 7]], 0, None),
                ('a note trig on the step too (veto)', 1, 11, {4: 0x40}, [[4]], 1, 0x00),
                ('a trigless trig on the step too (veto)', 1, 13, {4: 0x40}, [[4]], 1, 0x08),
                ('the last track, a high step, the last parameter', 7, 40, {31: 0x10}, [[31]], 0, None)):
            bit, mirror, row = erase_case(port, side, t, step, locks, erase, stock, fixed_keep, veto)
            want = 1 if stock else fixed_keep
            check(bit == want and mirror == want and row,
                  '%s T%d step %d, %s: lock flag %d, mirror %d (expected %d); the erased locks read 0xff, the rest '
                  'as set: %s' % (name, t + 1, step + 1, what, bit, mirror, want, 'yes' if row else 'NO'))


def plays_free(port, track):
    """A01 in PER TRACK, `track` Plays Free + DIRECT, started by the dispatcher while playing (Direct Jump Kyoti's
    verify.py, part 6): (its seeded scale byte, its steps every 40 ms for a second)."""
    record = BLOB + (0x50 + track * AUD if track < 8 else 0x48f8 + (track - 8) * MID)
    port.poke(BLOB + 0x8e55, b'\x01')                                   # PER TRACK
    port.poke(record + 4, b'\x01')                                      # PLAYS FREE
    port.poke(record + 6, b'\xff')                                      # trig quantize DIRECT
    port.tap('PLAY')
    port.send('run 500')
    if track >= 8:
        port.poke(MIDI_SIDE, b'\x01')
    port.send('call %d %d 1' % (DISPATCH, track))                      # its trig key pressed
    steps = []
    for _ in range(25):
        port.send('run 40')
        steps.append(port.int(STEPS + track, 1))
    return port.int(SCALES + track, 1), steps, port.int(record + 1, 1)


def part_plays_free(args, stock, dj):
    print('3. MIDI Plays-Free trig (PER TRACK scale, trig quantize DIRECT)%s' % (
        ', with Direct Jump Kyoti\'s splice at 0x4009b6f2 too' if dj else ''))
    for track in (8, 15, 0):
        with tempfile.TemporaryDirectory(prefix='stock-fixes.') as directory:
            port = Port(args.emulator, args.image, pathlib.Path(directory), args.extra)
            try:
                if dj:
                    port.poke(SCRATCH, dj)
                    port.poke(0x4009b6f2, b'\x4e\xf9' + SCRATCH.to_bytes(4, 'big') + b'\x4e\x71' * 6)
                scale, steps, own = plays_free(port, track)
            finally:
                port.close()
        moving = len(set(steps)) > 4
        broken = track >= 8 and stock and not dj
        check((scale == own and moving) if not broken else (scale != own and not moving),
              '%s track %d: seeded scale byte %#x (its own %#x), steps %s' % (
                  'MIDI' if track >= 8 else 'audio', track - 7 if track >= 8 else track + 1, scale, own,
                  'advance' if moving else 'stall at %s' % sorted(set(steps))))


def part_carryover(args, stock):
    print('4. a pattern change to another Part republishes the recorder settings (the select-Part handler\'s tail)')
    with tempfile.TemporaryDirectory(prefix='stock-fixes.') as directory:
        port = Port(args.emulator, args.image, pathlib.Path(directory), args.extra)
        try:
            blob = port.int(BLOB_PTR)
            port.poke(pattern(1) + 0x8e57, b'\x01')                     # A02 plays Part 2
            one, two = blob + REC_OFF, blob + PART_STRIDE + REC_OFF
            before = port.mem(REC_CACHE, 96)
            records = bytearray(port.mem(one, 96))
            check(bytes(records) == before, 'after boot the recorder cache holds Part 1\'s records')
            changed = bytearray(records)
            for t in range(8):                                           # Part 2: each track's first byte one higher
                changed[12 * t] = (changed[12 * t] + 1) & 0xff
            port.poke(two, bytes(changed))
            port.send('watch %d' % PART_TAIL)
            port.key('PTN', True)
            port.tap('T2')
            port.key('PTN', False)
            port.send('run 600')
            hits = int(port.send('hits').split()[1].split('=')[1], 0)
            after = port.mem(REC_CACHE, 96)
        finally:
            port.close()
    check(hits > 0, 'the switch to A02 ran the select-Part handler\'s tail (%d time%s)' % (hits, 's' * (hits != 1)))
    want = bytes(records) if stock else bytes(changed)
    check(after == want, 'the recorder cache then holds Part %d\'s records (%s)' % (
        1 if after == bytes(records) else 2 if after == bytes(changed) else 0, 'stale' if after == bytes(records) else 'fresh'))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--emulator', type=pathlib.Path, required=True)
    parser.add_argument('--image', type=pathlib.Path, required=True)
    parser.add_argument('--stock', action='store_true', help='the original OS: expect every stock bug')
    parser.add_argument('--max', help='the emulator\'s instruction budget (a base needs 4000000000)')
    parser.add_argument('--only', help='comma-separated parts: content,erase,playsfree,dj,carryover')
    args = parser.parse_args()
    args.extra = ('--max', args.max) if args.max else ()
    parts = set((args.only or 'content,erase,playsfree,dj,carryover').split(','))
    with tempfile.TemporaryDirectory(prefix='stock-fixes.') as directory:
        work = pathlib.Path(directory)
        kits = kits_search_unit(work)
        dj = assemble(DJ_TRIGSCALE, SCRATCH, work) if 'dj' in parts else None
        if parts & {'content', 'erase'}:
            port = Port(args.emulator, args.image, work, args.extra)
            try:
                if 'content' in parts:
                    part_content(port, args.stock, kits)
                if 'erase' in parts:
                    part_erase(port, args.stock)
            finally:
                port.close()
    if 'playsfree' in parts:
        part_plays_free(args, args.stock, None)
    if 'dj' in parts:
        if dj is None:
            print('  [SKIP] Direct Jump Kyoti\'s splice: no ColdFire binutils')
        else:
            part_plays_free(args, args.stock, dj)
    if 'carryover' in parts:
        part_carryover(args, args.stock)
    print('%d failed' % len(FAILS) if FAILS else 'all passed')
    return 1 if FAILS else 0


if __name__ == '__main__':
    sys.exit(main())
