# SPDX-License-Identifier: GPL-3.0-or-later
"""Stream probes A and B (module-adapters/stream_probe.py): A's core-0 checker and B's core-0 writer run in dsp_host,
B's ColdFire check compiled on the host and fed what the writer left, and the build seams against the sources they
edit."""
import hashlib
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest

SDK = Path(__file__).resolve().parents[1] / 'machines/octatrack'
sys.path[:0] = [str(SDK / 'module-adapters'), str(SDK / 'elekloader')]
import dsp_packages  # noqa: E402
import stream_probe  # noqa: E402

END = 0x1fdf
WRAPPER = 0x1100
OUT = 0x1800        # the wrapper copies A's 19 P words and the registers B must keep here
Y0, R2, B1, R4, R5, R7 = 0x123456, 0x00abcd, 0x345678, 0x000444, 0x000555, 0x000777


def memory_record(space, address, words):
    return struct.pack('<BII', space, address, len(words)) + struct.pack(f'<{len(words)}I', *words)


def model(words, counters, block):
    """What A's checker should leave: its 19 P words (8 live, the snapshot flag, 10 published) and the magic word."""
    c = list(counters)
    c[0] = (c[0] + 1) & 0xffffff
    if (block[0] ^ stream_probe.MAGIC) & 0xfffe:
        c[3] = (c[3] + 1) & 0xffffff
        return c, block[0]
    c[8] = block[0]
    seq = block[1] & 0xffff
    differences = (block[0] | block[1]) & 0xff0000
    if (c[6] + 1) & 0xffff != seq:
        c[4] = (c[4] + 1) & 0xffffff
    c[6] = seq
    for i in range(2, words):
        differences |= block[i] ^ (((seq & 0xff) << 8) + i)  # the DSP's expected value is not cut to 16 bits
    if differences & 0xffff:
        c[7] = differences
        c[2] = (c[2] + 1) & 0xffffff
    else:
        c[1] = (c[1] + 1) & 0xffffff
    if differences & (0xff0000 if words <= 256 else 0xfe0000):
        c[5] = (c[5] + 1) & 0xffffff
    if block[0] & 1:
        serial = (c[9] + 1) & 0xffffff
        c[9:19] = [serial, *c[0:8], serial]
    return c, 0


def classify_model(words, counts, block):
    """stream_probe.c mw_stream_read_classify, on 16-bit halfwords: blocks, good, bad, missing, jumps, stale, last."""
    c = dict(counts)
    first = not c['blocks']
    c['blocks'] += 1
    if block[0] != stream_probe.READ_MAGIC:
        c['missing'] += 1
        return c
    s = block[1]
    if not first and s != (c['last'] + 1) & 0xffff:
        if (c['last'] - s) & 0xffff < 0x8000:
            c['stale'] += 1
        else:
            c['jumps'] += 1
            c['last'] = s
    else:
        c['last'] = s
    good = block[2:] == stream_probe.read_pattern(s, words)[2:]
    c['good' if good else 'bad'] += 1
    return c


class State7:
    """Just enough ColdFire to run dsp_hooks.s's state 7 as built: the instructions its scheduler uses, with N, Z and C
    for its branches, one visit at a time, each ending at `jmp DONE`. A jsr to a name in `calls` runs it (its value is
    d0) and leaves d0, d1, a0 and a1 garbage, as C may; any other jsr or jmp fails. Writes are logged; reads give what
    was written (0 if nothing was), but TCD0's CSR reads idle, as the guarded entry needs to go on."""
    POISON = 0xdeadbeef

    def __init__(self, text, calls):
        self.code, self.labels, self.calls = [], {}, calls
        for line in text[text.index('dl_state7:'):text.index('dl_tick:')].splitlines():
            line = line.split('|')[0].strip()
            if line.endswith(':'):
                self.labels.setdefault(line[:-1], []).append(len(self.code))
            elif line and not line.startswith('.'):
                op, _, rest = line.partition(' ')
                self.code.append((op, [o.strip() for o in re.split(r',(?![^(]*\))', rest)] if rest else []))
        self.symbols = {'UNCACHED': 0x08000000, 'DONE': 0x40004bc8}
        self.memory, self.writes, self.d, self.a = {}, [], [0] * 8, [0] * 8

    def address(self, name):
        return self.symbols.setdefault(name, 0x41000000 + (int(hashlib.sha256(name.encode()).hexdigest()[:4], 16) << 8))  # by name

    def value(self, text):
        return sum(int(t, 0) if t[0].isdigit() else self.address(t) for t in text.split('+'))

    def target(self, text, at):
        if re.fullmatch(r'\d+[fb]', text):
            spots = self.labels[text[:-1]]
            return min(s for s in spots if s > at) if text[-1] == 'f' else max(s for s in spots if s <= at)
        return self.labels[text][0]

    def read(self, at, size):
        if at == 0xfc04501e:
            return 0x80
        return int.from_bytes(bytes(self.memory.get(at + i, 0) for i in range(size)), 'big')

    def write(self, at, size, v):
        v &= (1 << 8 * size) - 1
        self.writes.append((at, size, v))
        for i, byte in enumerate(v.to_bytes(size, 'big')):
            self.memory[at + i] = byte

    def load(self, operand, size):
        """(value, store): an operand's value and how to write it."""
        if operand.startswith('#'):
            return self.value(operand[1:]), None
        mask = (1 << 8 * size) - 1
        m = re.fullmatch(r'%([da])(\d)|%(sp)', operand)
        if m:
            regs, n = (self.a, 7) if m.group(3) else (self.d if m.group(1) == 'd' else self.a, int(m.group(2)))

            def store(v):
                regs[n] = v & 0xffffffff if regs is self.a else (regs[n] & ~mask & 0xffffffff) | (v & mask)
            return regs[n] & mask, store
        m = re.fullmatch(r'(-?\d*)\(%(sp|a\d)(?:,%d(\d)\.l)?\)', operand)
        if m:
            at = (self.a[7] if m.group(2) == 'sp' else self.a[int(m.group(2)[1])]) + int(m.group(1) or 0)
            at += self.d[int(m.group(3))] if m.group(3) else 0
        else:
            at = self.value(operand)
        at &= 0xffffffff
        return self.read(at, size), lambda v: self.write(at, size, v)

    def visit(self, sp=0x46000000):
        """One state-7 visit with d2-d7/a2-a6 holding marks, which must be back at DONE, sp too; -> instructions run."""
        self.a[7] = sp
        marks = [0x01110000 * (n + 1) for n in range(11)]
        self.d[2:8], self.a[2:7] = marks[:6], marks[6:]
        flags, at, ran = dict(n=0, z=0, c=0), self.labels['dl_state7'][0], 0
        while True:
            op, ops = self.code[at]
            at, ran = at + 1, ran + 1
            name, _, suffix = op.partition('.')
            size = {'b': 1, 'w': 2}.get(suffix, 4)
            mask = (1 << 8 * size) - 1

            def setnz(v):
                flags.update(z=int((v & mask) == 0), n=(v & mask) >> 8 * size - 1, c=0)
            if name in ('bra', 'beq', 'bne', 'bcs', 'bcc'):
                if {'bra': 1, 'beq': flags['z'], 'bne': not flags['z'], 'bcs': flags['c'], 'bcc': not flags['c']}[name]:
                    at = self.target(ops[0], at - 1)
            elif name == 'jsr':
                if ops[0] not in self.calls:
                    raise AssertionError('state 7 calls ' + ops[0])
                result = self.calls[ops[0]]()
                self.d[0], self.d[1], self.a[0], self.a[1] = (result or 0) & 0xffffffff, self.POISON, self.POISON, self.POISON
            elif name == 'jmp':
                if ops[0] != 'DONE':
                    raise AssertionError('state 7 jumps to ' + ops[0])
                if self.a[7] != sp or self.d[2:8] != marks[:6] or self.a[2:7] != marks[6:]:
                    raise AssertionError('state 7 left sp or d2-d7/a2-a6 changed')
                return ran
            elif name == 'movem':
                for k, (regs, n) in enumerate([(self.d, n) for n in range(2, 8)] + [(self.a, n) for n in range(2, 7)]):
                    if ops[0] == '(%sp)':
                        regs[n] = self.read(self.a[7] + 4 * k, 4)
                    else:
                        self.write(self.a[7] + 4 * k, 4, regs[n])
            elif name == 'lea':
                m = re.fullmatch(r'(-?\d+)\(%sp\)', ops[0])
                self.load(ops[1], 4)[1](self.a[7] + int(m.group(1)) if m else self.value(ops[0]))
            elif name == 'adda':
                v, store = self.load(ops[1], 4)
                store(v + self.load(ops[0], 4)[0])
            elif name in ('move', 'moveq', 'clr', 'tst'):
                v = 0 if name == 'clr' else self.load(ops[0], size)[0]
                if name != 'tst':
                    self.load(ops[-1], size)[1](v)
                setnz(v)
            elif name in ('cmpi', 'cmp'):
                s, d = self.load(ops[0], size)[0] & mask, self.load(ops[1], size)[0] & mask
                setnz(d - s)
                flags['c'] = int(d < s)
            elif name in ('addq', 'subq', 'andi', 'ori', 'lsl'):
                s = self.load(ops[0], size)[0]
                d, store = self.load(ops[1], size)
                v = {'addq': d + s, 'subq': d - s, 'andi': d & s, 'ori': d | s, 'lsl': d << s}[name]
                store(v)
                setnz(v)
                if name in ('addq', 'subq'):
                    flags['c'] = int(v >> 8 * size & 1 if name == 'addq' else d < s)
            elif name == 'btst':
                flags['z'] = int(not self.load(ops[1], 4)[0] >> self.value(ops[0][1:]) & 1)
            else:
                raise AssertionError('the model has no ' + op)


def host():
    assembler = os.environ.get('ELEKLOADER_DSP_ASM')
    found = Path(assembler).with_name('dsp_host') if assembler else None
    return found if found and found.is_file() else None


class StreamProbe(unittest.TestCase):
    def run_frame_head(self, words, read_words, bank, counters=None, block=None, sequence=0):
        """The frame-head code at the end of private P, called as from P:$88 with r6 on `bank`; -> A's 19 P words,
        A's magic word after the call, B's block in X and B's sequence word."""
        dsp_host = host()
        if not dsp_host:
            self.skipTest('dsp_host is required beside ELEKLOADER_DSP_ASM')
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            source = stream_probe.dsp_source(words, read_words)
            sized, _ = dsp_packages.assemble(source, END, work)
            origin = END - len(sized)
            code, labels = dsp_packages.assemble(source, origin, work)
            first = labels['wbentry'] if read_words else labels['sqentry']
            self.assertEqual(first, origin)
            copy = labels['sqframes'] if words else origin
            wrapper = f"""init:
        rts
proc:
        move #>${Y0:x},y0
        move #>${R2:x},r2
        move #>${B1:x},b
        move #>${R4:x},r4
        move #>${R5:x},r5
        move #>${R7:x},r7
        move #>${bank:x},r6
        move #>${origin:x},r0
        jsr  (r0)
        move y0,x:>${OUT + 0x20:x}
        move b1,x:>${OUT + 0x21:x}
        move r4,x:>${OUT + 0x22:x}
        move r5,x:>${OUT + 0x23:x}
        move r6,x:>${OUT + 0x24:x}
        move r7,x:>${OUT + 0x25:x}
        move #>${copy:x},r0
        move #>${OUT:x},r1
        do #19,copied
        move p:(r0)+,x0
        move x0,x:(r1)+
copied:
        move #>${labels.get('wbseq', origin):x},r0
        move p:(r0),x0
        move x0,x:>${OUT + 0x26:x}
        rts
"""
            boot, entry = dsp_packages.assemble(wrapper, WRAPPER, work)
            records = memory_record(0, WRAPPER, boot) + memory_record(0, origin, code)
            if words:
                records += memory_record(0, labels['sqframes'], counters) + memory_record(1, bank + stream_probe.region_a(words)[0], block)
            if read_words:
                records += memory_record(0, labels['wbseq'], [sequence])
            image = work / 'stream.mem'
            image.write_bytes(records + b'\xff')
            mailbox = bank + stream_probe.region_a(words)[0] if words else None
            read_at = bank + stream_probe.READ_REGION
            addresses = [*range(OUT, OUT + 19), *range(OUT + 0x20, OUT + 0x27), 0x204] + ([mailbox] if words else []) + (
                [*range(read_at - 1, read_at + read_words + 1)] if read_words else [])
            run = subprocess.run([dsp_host, '-mem', image, '-init', f'{entry["init"]:x}', '-proc', f'{entry["proc"]:x}',
                                  '-ctx', '100f,100f,1010', '-blocks', '1', '-frames', '16', '-out', work / 'audio.raw',
                                  '-peekx', ','.join(f'{at:x}' for at in addresses)],
                                 capture_output=True, text=True, timeout=20)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            found = {int(at, 16): int(value, 16) for at, value in
                     re.findall(r'X:0x([0-9a-f]+)\s*=\s*0x([0-9a-f]+)', run.stdout)}
            self.assertEqual(found[OUT + 0x20], Y0, 'y0 is put back')
            self.assertEqual([found[OUT + 0x21 + k] for k in range(5)], [B1, R4, R5, bank, R7], 'b, r4-r7 are kept')
            self.assertEqual(found[0x204], R2, 'the displaced instruction still stores r2')
            written = [found[at] for at in range(read_at, read_at + read_words)] if read_words else None
            if read_words:
                self.assertEqual(found[read_at - 1], 0, 'nothing below the block')
                self.assertEqual(found[read_at + read_words], 0, 'nothing past the block')
            return dict(counters=[found[at] for at in range(OUT, OUT + 19)] if words else None,
                        magic=found[mailbox] if words else None, block=written, sequence=found[OUT + 0x26])

    def run_checker(self, words, bank, counters, block):
        r = self.run_frame_head(words, 0, bank, counters, block)
        return r['counters'], r['magic']

    def expect(self, words, bank, counters, block):
        got, magic = self.run_checker(words, bank, counters, block)
        want, want_magic = model(words, counters, block)
        self.assertEqual(got, want)
        self.assertEqual(magic, want_magic)
        return got

    def test_good_blocks_on_both_banks_and_every_length(self):
        for words in (32, 160, 576):
            for bank in (0x2000, 0x4000):
                with self.subTest(words=words, bank=hex(bank)):
                    got = self.expect(words, bank, [7, 5, 0, 1, 0, 0, 0x1233] + [0] * 12,
                                      stream_probe.pattern(0x1234, words))
                    self.assertEqual(got[:7], [8, 6, 0, 1, 0, 0, 0x1234])

    def test_a_wrong_word_a_stale_block_and_junk_bits(self):
        start = [0] * 6 + [0x40] + [0] * 12
        wrong = stream_probe.pattern(0x41, 64)
        wrong[63] ^= 0x10
        self.assertEqual(self.expect(64, 0x2000, start, wrong)[1:3], [0, 1])
        stale = stream_probe.pattern(0x41, 64)[:2] + stream_probe.pattern(0x3f, 64)[2:]  # this sequence, older words
        self.assertEqual(self.expect(64, 0x4000, start, stale)[2], 1)
        junk = [w | (0xa5 << 16 if i == 9 else 0) for i, w in enumerate(stream_probe.pattern(0x41, 64))]
        got = self.expect(64, 0x2000, start, junk)
        self.assertEqual((got[1], got[2], got[5]), (1, 0, 1))
        header = [0xc00000 | w if i < 2 else w for i, w in enumerate(stream_probe.pattern(0x41, 64))]
        got = self.expect(64, 0x4000, start, header)
        self.assertEqual((got[1], got[5], got[6]), (1, 1, 0x41))
        # Wide A: the pattern's carry into bit 16 is neither bad nor junk; a wrong word past 256 still is.
        wide = stream_probe.pattern(0xff, 576)
        got = self.expect(576, 0x2000, start[:6] + [0xfe] + start[7:], wide)
        self.assertEqual((got[1], got[2], got[5]), (1, 0, 0))
        wide[500] ^= 0x100
        self.assertEqual(self.expect(576, 0x4000, start[:6] + [0xfe] + start[7:], wide)[2], 1)

    def test_missing_out_of_order_wrapped_and_published(self):
        start = [100, 90, 2, 8, 0, 0, 0xffff, 0x10] + [0] * 11
        got = self.expect(96, 0x2000, start, [0x5349] + stream_probe.pattern(0, 96)[1:])
        self.assertEqual(got[3], 9)
        self.assertEqual(self.expect(96, 0x2000, start, stream_probe.pattern(0, 96))[4], 0)  # $ffff -> 0 is in order
        self.assertEqual(self.expect(96, 0x4000, start, stream_probe.pattern(7, 96))[4], 1)
        got = self.expect(128, 0x4000, start[:9] + [41] + [0] * 9, stream_probe.pattern(0, 128, snapshot=True))
        self.assertEqual(got[9:], [42, 101, 91, 2, 8, 0, 0, 0, 0x10, 42])

    def test_writer_on_both_banks_alone_and_beside_the_checker(self):
        for words, read_words in ((0, 32), (0, 560), (0, 928), (160, 64), (576, 560)):
            for bank in (0x2000, 0x4000):
                with self.subTest(words=words, read_words=read_words, bank=hex(bank)):
                    a = [7, 5, 0, 1, 0, 0, 0x1233] + [0] * 12
                    r = self.run_frame_head(words, read_words, bank, a, stream_probe.pattern(0x1234, words or 32), 0xffff)
                    self.assertEqual(r['sequence'], 0, 'the sequence wraps at 16 bits')
                    self.assertEqual(r['block'], stream_probe.read_pattern(0, read_words))
                    r = self.run_frame_head(words, read_words, bank, a, stream_probe.pattern(0x1234, words or 32), 0x12fe)
                    self.assertEqual(r['sequence'], 0x12ff)  # ((sequence & $ff) << 8) + i carries into bit 16 past 256
                    self.assertEqual([w & 0xffff for w in r['block']], stream_probe.read_pattern(0x12ff, read_words))
                    self.assertFalse(any(w >> 17 for w in r['block']), 'bits 17-23 stay clear')
                    if words:  # A's checker ran after the writer, as alone
                        self.assertEqual(r['counters'][:7], [8, 6, 0, 1, 0, 0, 0x1234])
                        self.assertEqual(r['magic'], 0)

    def test_coldfire_check_compiled_on_the_host(self):
        compiler = shutil.which('cc') or shutil.which('gcc')
        if not compiler:
            self.skipTest('a host C compiler is required')
        words = 560
        blocks = [stream_probe.read_pattern(s, words) for s in (0x1ff, 0x200, 0x201)]
        bad = stream_probe.read_pattern(0x203, words)
        bad[400] ^= 0x40
        stale = stream_probe.read_pattern(0x202, words)[:2] + stream_probe.read_pattern(0x200, words)[2:]
        blocks += [bad, stream_probe.read_pattern(0x202, words), [0] * words, stale,
                   stream_probe.read_pattern(0x205, words), stream_probe.read_pattern(0x206, words)]
        counts = dict(blocks=0, good=0, bad=0, missing=0, jumps=0, stale=0, last=0)
        expected = []
        for block in blocks:
            counts = classify_model(words, counts, block)
            expected.append(counts)
        flat = ','.join('0x%08x' % (b[i] << 16 | b[i + 1]) for b in blocks for i in range(0, words, 2))
        driver = f'''#include <stdio.h>
#include "{stream_probe.SOURCE}"
static const uint32_t blocks[] = {{{flat}}};
int main(void) {{
    struct mw_read_counts c = {{0}};
    for (unsigned b = 0; b < {len(blocks)}u; ++b) {{
        mw_stream_read_classify(blocks + b * {words // 2}u, &c);
        printf("%u %u %u %u %u %u %u %x\\n", (unsigned)c.blocks, (unsigned)c.good, (unsigned)c.bad, (unsigned)c.missing,
               (unsigned)c.jumps, (unsigned)c.stale, (unsigned)c.last, (unsigned)c.diff);
    }}
    return 0;
}}
'''
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            (work / 'driver.c').write_text(driver)
            build = subprocess.run([compiler, '-std=c99', '-Wall', '-Wextra', '-Wno-unused-function', '-Werror',
                                    '-DMODWERK_HOST', f'-DMODWERK_STREAM_READ_WORDS={words}u',
                                    '-DMODWERK_STREAM_READ_REGION=0x1840u', '-o', work / 'driver', work / 'driver.c'],
                                   capture_output=True, text=True)
            self.assertEqual(build.returncode, 0, build.stderr)
            lines = subprocess.run([work / 'driver'], capture_output=True, text=True, check=True).stdout.split('\n')
        for line, want in zip(lines, expected):
            got = list(map(int, line.split()[:7]))
            self.assertEqual(got, [want[k] for k in ('blocks', 'good', 'bad', 'missing', 'jumps', 'stale', 'last')])
        self.assertEqual(lines[3].split()[7], '40', "the bad block's difference")
        self.assertEqual(expected[-1], dict(blocks=9, good=6, bad=2, missing=1, jumps=2, stale=2, last=0x206))

    def test_lengths_regions_and_proofs(self):
        self.assertEqual(stream_probe.WORDS, (32, 64, 96, 128, 160))
        self.assertEqual((stream_probe.WIDE_WORDS[0], stream_probe.WIDE_WORDS[-1]), (192, 928))
        self.assertEqual((stream_probe.READ_WORDS[0], stream_probe.READ_WORDS[-1]), (32, 928))
        self.assertIn(560, stream_probe.READ_WORDS)
        for bad in (0, 48, 176, 960):
            with self.assertRaises(ValueError):
                stream_probe.check_words(bad)
        for bad in (0, 16, 40, 944):
            with self.assertRaises(ValueError):
                stream_probe.check_read_words(bad)
        self.assertEqual(stream_probe.region_a(160), (0x360, 160))
        self.assertEqual(stream_probe.region_a(192)[0], stream_probe.A_WIDE)
        self.assertEqual(stream_probe.REGION + stream_probe.CAPACITY, 0x400)
        self.assertEqual(stream_probe.READ_REGION + stream_probe.READ_CAPACITY, stream_probe.A_WIDE)
        self.assertEqual(stream_probe.A_WIDE + stream_probe.A_WIDE_CAPACITY, stream_probe.FREE_RUN[1])
        self.assertEqual(stream_probe.read_loop_bytes(560), 32)
        self.assertEqual(stream_probe.read_loop_bytes(576), 64)
        for a, b in ((160, 0), (0, 928), (160, 560), (928, 928)):
            self.assertGreater(stream_probe.proof(a_words=a, b_words=b), 0)
        ledger = {'regions': [{'space': 'x', 'cores': ['A'], 'start': '0x5900', 'words': '0x10', 'about': 'a test region'}]}
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'ledger.json'
            path.write_text(__import__('json').dumps(ledger))
            with self.assertRaisesRegex(ValueError, 'stream probe B'):
                stream_probe.proof(path, a_words=0, b_words=256)
            self.assertEqual(stream_probe.proof(path, a_words=160, b_words=0), 1)
        self.assertEqual(stream_probe.pattern(0xff, 300)[299], (0xff00 + 299) & 0xffff)

    def test_reply_layouts_agree(self):
        # stream_probe.c's replies, dev.c's length checks and scripts/stream-probe.mjs agree on their sizes.
        c = stream_probe.SOURCE.read_text()
        define = lambda name: int(re.search(rf'#define {name} (\d+)u', c).group(1))
        self.assertEqual(16 + 5 * define('WINDOWS') + define('DSP_WORDS'), stream_probe.REPLY_WORDS)
        self.assertEqual(define('READ_COUNTS') + 5 * define('RWINDOWS'), stream_probe.READ_REPLY_WORDS)
        self.assertEqual(define('DSP_WORDS'), stream_probe.DSP_WORDS)
        self.assertEqual(int(re.search(r'#define MAGIC 0x([0-9a-f]+)u', c).group(1), 16), stream_probe.MAGIC)
        self.assertEqual(int(re.search(r'#define RMAGIC 0x([0-9a-f]+)u', c).group(1), 16), stream_probe.READ_MAGIC)
        reader = (SDK.parents[2] / 'scripts/stream-probe.mjs').read_text()
        self.assertIn(f'STREAM_REPLY_BYTES = {4 * stream_probe.REPLY_WORDS}', reader)
        self.assertIn(f'STREAM_REQUEST = {stream_probe.REQUEST}', reader)
        self.assertIn(f'STREAM_READ_REPLY_BYTES = {4 * stream_probe.READ_REPLY_WORDS}', reader)
        self.assertIn(f'STREAM_READ_REQUEST = {stream_probe.READ_REQUEST}', reader)
        both = SimpleNamespace(stream_probe=64, stream_read=560)
        dev = stream_probe.dev_c((SDK / 'elekloader/dev.c').read_text(), both)
        self.assertIn(f'want == {4 * stream_probe.REPLY_WORDS}u', dev)
        self.assertIn(f'want == {4 * stream_probe.READ_REPLY_WORDS}u', dev)

    def hooks(self, core):
        text = (SDK.parents[1] / 'octabam/platform/dsp-dynload-transport/hooks.s').read_text()
        for old, new in (core.DSP_EDITS['hooks.s'] + core.WIDTH_EDITS.get('hooks.s', ())
                         + core.DSP_HOOK_EDITS['guard'].get('hooks.s', ())):
            self.assertEqual(text.count(old), 1, old)
            text = text.replace(old, new)
        return text

    def test_build_seams_and_scheduler(self):
        core = stream_probe.build_core_module()  # every seam found once, and the edited build_core.py compiles
        self.assertIs(core.STREAM_PROBE, stream_probe)
        hooks = stream_probe.scheduler(self.hooks(core), SimpleNamespace(stream_probe=64, stream_read=0))
        flow = hooks[hooks.index('dl_state7:'):]
        # The block goes on the first visit after the loader's frame step, its completion is stamped before the loader's
        # packet or the unmask, and dl_complete puts TCD0 back before it unmasks the frame interrupt.
        self.assertLess(flow.index('jsr dl_frame'), flow.index('jsr mw_stream_block'))
        self.assertLess(flow.index('dl_next:'), flow.index('jsr mw_stream_complete'))
        complete = flow[flow.index('dl_complete:'):]
        self.assertLess(complete.index('jsr mw_stream_account'), complete.index('move.b %d1,0xfc04801d'))
        send = flow[flow.index('dl_send_stream:'):flow.index('dl_write:')]
        for line in ('move.w #0x6360,%d1', 'move.w #0x88,%d1', 'clr.b 0xfc0a400c', 'clr.b 0xfc04401e',
                     'move.l #mw_stream_tx+UNCACHED,%d1', 'moveq #64,%d1'):
            self.assertIn(line, send)
        self.assertNotIn('0xfc04501e', send)  # CSR is never written
        self.assertEqual(hooks.count('move.w #0x6320,%d0'), 1)  # the loader's packet stays at $x320-$x35f
        self.assertNotIn('mw_stream_state0', hooks)
        wide = stream_probe.scheduler(self.hooks(core), SimpleNamespace(stream_probe=576, stream_read=0))
        self.assertIn('move.w #0x7be0,%d1', wide)

    def test_read_scheduler(self):
        core = stream_probe.build_core_module()
        for words in (0, 160):
            hooks = stream_probe.scheduler(self.hooks(core), SimpleNamespace(stream_probe=words, stream_read=560))
            self.assertEqual('jsr mw_stream_block' in hooks, bool(words))
            complete = hooks[hooks.index('dl_complete:'):]
            # The times before the unmask, the check after it and before the interrupt's return.
            self.assertLess(complete.index('jsr mw_stream_account'), complete.index('move.b %d1,0xfc04801d'))
            self.assertLess(complete.index('move.b %d1,0xfc04801d'), complete.index('jsr mw_stream_check'))
            self.assertLess(complete.index('jsr mw_stream_check'), complete.index('jmp DONE'))
            read = hooks[hooks.index('mw_stream_state0:'):hooks.index('mw_stream_stock0:')]
            order = ['jsr mw_stream_read', 'move.b %d1,0xfc04401c', 'clr.b 0xfc0a400c', 'move.w %d1,0x20000000',
                     'move.w %d1,0xfc04503e', 'move.w #0x7840,%d1', 'move.w #559,%d1', 'move.w #0x89,%d1',
                     'move.l %d1,0xfc045030', 'moveq #32,%d1', 'move.l %d1,0xfc045028', 'move.w #0x8223,%d1',
                     'move.w %d1,0xfc045034', 'move.w %d1,0xfc04503c', 'move.b %d1,0xfc04401e', 'jmp DONE']
            at = [read.index(line) for line in order]
            self.assertEqual(at, sorted(at), 'stock state 0\'s order: CSR, address, count, command, DADDR, CITER, start')
            self.assertNotIn('0xfc04801d', read)  # never the frame interrupt's mask
            stock = hooks[hooks.index('mw_stream_stock0:'):]
            self.assertIn('moveq #7,%d1\n        move.b %d1,0xfc04401c', stock)
            self.assertIn('jmp 0x4000486a', stock)  # right past the 8 bytes the site takes
        self.assertEqual(stream_probe.STATE0 + 8, 0x4000486a)
        self.assertIn('move.w #0x8211,%d1', stream_probe.scheduler(self.hooks(core), SimpleNamespace(stream_probe=0, stream_read=544)))
        with self.assertRaises(ValueError):
            stream_probe.dsp_source(0, 0)
        dsp = stream_probe.dsp_c((SDK / 'elekloader/dsp.c').read_text(), SimpleNamespace(stream_probe=0, stream_read=64))
        self.assertIn('mw_stream_read_failed();', dsp)
        self.assertNotIn('mw_stream_dma_failed', dsp)


    def test_channel_scheduler(self):
        """--stream-channel: A's send at the wide in-region with the lanes' minor loops, B's read at the out-region with
        stream_channel.c's count and minor loops, no frame-head code, both recoveries."""
        core = stream_probe.build_core_module()
        args = SimpleNamespace(stream_probe=0, stream_read=0, stream_channel=True, resident_on_demand=True)
        stream_probe.check_args(args)
        hooks = stream_probe.scheduler(self.hooks(core), args)
        send = hooks[hooks.index('dl_send_stream:'):hooks.index('dl_write:')]
        for line in ('move.w #0x7be0,%d1', 'move.l #mw_stream_tx+UNCACHED,%d1', 'moveq #64,%d1', 'lsl.l #5,%d1'):
            self.assertIn(line, send)
        read = hooks[hooks.index('mw_stream_state0:'):hooks.index('mw_stream_stock0:')]
        order = ['jsr mw_stream_read', 'move.b %d1,0xfc04401c', 'clr.b 0xfc0a400c', 'move.w %d1,0x20000000',
                 'move.w %d1,0xfc04503e', 'move.w #0x7840,%d1', 'move.w mw_stream_read_count,%d1', 'move.w #0x89,%d1',
                 'move.l %d1,0xfc045030', 'moveq #32,%d1', 'move.l %d1,0xfc045028', 'move.w mw_stream_read_iter,%d1',
                 'move.w %d1,0xfc045034', 'move.w %d1,0xfc04503c', 'move.b %d1,0xfc04401e', 'jmp DONE']
        at = [read.index(line) for line in order]
        self.assertEqual(at, sorted(at))
        self.assertEqual(hooks.count('mw_stream_state0:'), 1)
        complete = hooks[hooks.index('dl_complete:'):]
        self.assertLess(complete.index('move.b %d1,0xfc04801d'), complete.index('jsr mw_stream_check'))
        dsp = stream_probe.dsp_c((SDK / 'elekloader/dsp.c').read_text(), args)
        self.assertIn('mw_stream_read_failed();', dsp)
        self.assertIn('mw_stream_dma_failed', dsp)
        self.assertNotIn('mw_stream_dsp_wanted', dsp)  # probe A's snapshot reads are not the channel's
        self.assertIs(stream_probe.place_receiver(args, lambda end: end, None, 'A', 0x1234, None), 0x1234)
        self.assertEqual(stream_probe.cflags(args), ['-DMODWERK_STREAM_CHANNEL'])
        with self.assertRaises(ValueError):
            stream_probe.check_args(SimpleNamespace(stream_probe=64, stream_read=0, stream_channel=True, resident_on_demand=True))

    def test_channel_core1(self):
        """--stream-channel on core 1: its block after the loader's packet at state 3 (phase 2), its read at state 1's
        entry with core 1 still selected, its regions clear of core 1's transfers and of payload B's frame words."""
        args = SimpleNamespace(stream_probe=0, stream_read=0, stream_channel=True, resident_on_demand=True)
        stock = (SDK / 'elekloader/dsp_core1.s').read_text()
        self.assertEqual(stream_probe.core1(stock, SimpleNamespace(stream_channel=False)), stock)
        text = stream_probe.core1(stock, args)
        flow = text[text.index('dl_state3:'):text.index('mw_stream_state1:')]
        # the packet first; its completion (phase 1) and an idle frame with none waiting go on to the block
        order = ['bne 2f', 'beq 4f', 'jmp DONE', '2:      move.l dl_c1_phase,%d0', 'beq 5f', 'clr.w (%a0)', '4:',
                 'bne 3f', 'jsr mw_stream_block1', 'beq 3f', 'move.b %d1,0xfc0a400c', 'move.l #mw_stream_tx1+UNCACHED,%d1',
                 'move.w #0x7be0,%d1', 'lsl.l #5,%d1', 'move.w #0x88,%d1', 'moveq #2,%d0', 'move.l %d0,dl_c1_phase',
                 'clr.b 0xfc04401e', 'jmp DONE', '5:      clr.l dl_c1_phase', 'jsr mw_stream_complete1', '3:', 'jmp STATE3']
        at, start = [], 0
        for line in order:
            start = flow.index(line, start)
            at.append(start)
        self.assertNotIn('0xfc04801d', flow)  # never the frame interrupt's mask
        read = text[text.index('mw_stream_state1:'):text.index('mw_stream_stock1:')]
        order = ['jsr mw_stream_read1', 'move.b %d1,0xfc04401c', 'move.b %d1,0xfc0a400c', 'move.w %d1,0x20000000',
                 'move.w %d1,0xfc04503e', 'move.w #0x7840,%d1', 'move.w mw_stream_read_count1,%d1', 'move.w #0x89,%d1',
                 'move.l #mw_stream_rx1+UNCACHED,%d1', 'move.l %d1,0xfc045030', 'moveq #32,%d1', 'move.l %d1,0xfc045028',
                 'move.w mw_stream_read_iter1,%d1', 'move.w %d1,0xfc045034', 'move.w %d1,0xfc04503c',
                 'move.b %d1,0xfc04401e', 'jmp DONE']
        at = [read.index(line) for line in order]
        self.assertEqual(at, sorted(at))
        self.assertNotIn('clr.b 0xfc0a400c', read)  # core 1 stays selected
        stock1 = text[text.index('mw_stream_stock1:'):]
        self.assertEqual([line.split('|')[0].strip() for line in stock1.splitlines()[1:4]],
                         ['moveq #1,%d0', 'move.b %d0,0xfc04401c', 'jmp 0x400048e2'])  # right past the 8 bytes
        self.assertEqual(text.count('.data'), 1)
        self.assertLess(text.index('mw_stream_stock1:'), text.index('.data'))
        dsp = stream_probe.dsp_c((SDK / 'elekloader/dsp.c').read_text(), args)
        self.assertIn('if (dl_phase >= 3u || dl_c1_phase == 2u)', dsp)
        # the regions
        self.assertGreaterEqual(stream_probe.core1_proof(), 1)
        self.assertEqual(stream_probe.A_WIDE + stream_probe.CORE1_IN_CAPACITY + 0x2000, 0x3f60)
        old = stream_probe.CORE1_IN_CAPACITY
        try:
            stream_probe.CORE1_IN_CAPACITY = stream_probe.A_WIDE_CAPACITY  # core 0's 928 words reach $3f7f
            with self.assertRaises(ValueError):
                stream_probe.core1_proof()
        finally:
            stream_probe.CORE1_IN_CAPACITY = old
        self.assertEqual(hashlib.sha256(bytes.fromhex('700113c0fc04401c')).hexdigest(), stream_probe.STATE1_GUARD)
        header = (SDK / 'module-adapters/stream_channel.h').read_text()
        self.assertIn('#define MW_STREAM_IN1_WORDS %#xu' % stream_probe.CORE1_IN_CAPACITY, header)
        mapping = {name: 0x40a00000 for name in ('mw_stream_tx', 'mw_stream_rx', 'mw_stream_tx1', 'mw_stream_rx1')}
        stream_probe.check_link(mapping, args)
        mapping['mw_stream_rx1'] += 8
        with self.assertRaises(ValueError):
            stream_probe.check_link(mapping, args)

    def chain(self, text, usb_loops, stream_loops, packet):
        """One frame's state-7 chain run on State7, a visit per transfer's completion: -> (transfers in order as (host
        address, count - 1, source, CITER), the C calls in order, instructions of the longest visit, visits)."""
        events, model = [], None

        def call(name, result=0):
            def run():
                events.append(name)
                if name == 'dl_frame' and packet:
                    model.write(model.address('dl_tx') + 0x08000000, 2, 0x4d57)  # the loader's packet waits, as dl_frame says
                return result
            return run
        calls = {name: call(name) for name in ('mw_stream_complete', 'mw_stream_account', 'mw_stream_check')}
        calls.update(dl_frame=call('dl_frame', packet), modwerk_usb_input_block=call('modwerk_usb_input_block', usb_loops),
                     mw_stream_block=call('mw_stream_block', stream_loops))
        model = State7(text, calls)
        longest, visits, transfers = 0, 0, []
        while not any(at == 0xfc04801d for at, _, _ in model.writes):  # until the frame interrupt is unmasked
            start = len(model.writes)
            longest, visits = max(longest, model.visit()), visits + 1
            self.assertLess(visits, 8, 'the chain ends')
            new = model.writes[start:]
            if (0xfc04401e, 1, 0) in new:  # channel 0's start
                host = [v for at, _, v in new if at == 0x2000001c]
                saddr = [v for at, _, v in new if at == 0xfc045000][-1]
                citer = [v for at, _, v in new if at == 0xfc045014][-1]
                transfers.append((host[0], host[1], saddr, citer))
                events.append('started')
        self.assertTrue(all(v == 0 for at, _, v in model.writes if at == 0xfc0a400c), 'state 7 selects core 0 only')
        self.assertNotIn(0xfc04501e, [at for at, _, _ in model.writes], "TCD0's CSR is never written")
        self.assertEqual(model.read(model.address('dl_phase'), 4), 0)
        unmask = next(i for i, (at, _, _) in enumerate(model.writes) if at == 0xfc04801d)
        self.assertEqual(model.writes[unmask][2], 1)
        return transfers, events, longest, visits

    def test_channel_beside_usb_input(self):
        """The release base: USB AUDIO IN's scheduler, then the channel's (usb). In one frame USB AUDIO IN's block goes
        first, then the channel's, then the loader's packet, each from the completion of the one before; mw_stream_block
        is asked once a frame, mw_stream_complete follows the channel's block alone, TCD0 goes back right before the
        unmask and the lanes' check runs after it; d2-d7/a2-a6 and sp are kept on every visit. With no lane open the
        hardware sees exactly what it sees without the channel."""
        import usb_audio_input
        core = stream_probe.build_core_module()
        args = SimpleNamespace(stream_channel=True, resident_on_demand=True)
        stream_probe.check_args(args)
        usb = usb_audio_input.scheduler(self.hooks(core))
        both = stream_probe.scheduler(usb, args, usb=True)
        self.assertEqual(both.count('mw_stream_state0:'), 1)
        tx = State7(both, {}).address('mw_stream_tx') + 0x08000000
        usb_block = lambda loops: (0x6360, 32 * loops - 1, usb_audio_input.STAGE, 0x8000 | loops)
        lane = lambda loops: (0x7be0, 32 * loops - 1, tx, 0x8000 | loops)
        loader = (0x6320, 63, None, 0x8002)
        for usb_loops in (0, 3, 5):
            for stream_loops in (0, 1, 11, 29):  # 11: a plate's 352 halfwords; 29: the in-region's 928
                for packet in (0, 1):
                    with self.subTest(usb=usb_loops, stream=stream_loops, packet=packet):
                        transfers, events, longest, visits = self.chain(both, usb_loops, stream_loops, packet)
                        want = [usb_block(usb_loops)] * bool(usb_loops) + [lane(stream_loops)] * bool(stream_loops) + [loader] * packet
                        self.assertEqual([t[:2] + t[3:] for t in transfers], [w[:2] + w[3:] for w in want])
                        self.assertEqual([t[2] for t in transfers][:len(want) - packet], [w[2] for w in want][:len(want) - packet])
                        self.assertEqual(visits, len(want) + 1)
                        self.assertEqual(events.count('mw_stream_block'), 1)
                        self.assertEqual(events.count('modwerk_usb_input_block'), 1)
                        self.assertLess(events.index('modwerk_usb_input_block'), events.index('mw_stream_block'))
                        if stream_loops:  # its completion right after its own transfer, before the next starts
                            sent = [i for i, e in enumerate(events) if e == 'started'][bool(usb_loops)]
                            self.assertEqual(events[sent + 1], 'mw_stream_complete')
                        else:
                            self.assertNotIn('mw_stream_complete', events)
                        self.assertEqual(events[-2:], ['mw_stream_account', 'mw_stream_check'])
                        self.assertLess(longest, 80, 'instructions in one visit')
        # No lane open: the same writes, in the same order, as USB AUDIO IN's scheduler alone.
        for usb_loops in (0, 5):
            for packet in (0, 1):
                runs = []
                for text in (usb, both):
                    model = State7(text, dict(dl_frame=lambda: packet, modwerk_usb_input_block=lambda: usb_loops,
                                              mw_stream_block=lambda: 0, mw_stream_account=lambda: 0, mw_stream_check=lambda: 0))
                    if packet:
                        model.write(model.address('dl_tx') + 0x08000000, 2, 0x4d57)
                    while not any(at == 0xfc04801d for at, _, _ in model.writes):
                        model.visit()
                    runs.append(model.writes)
                self.assertEqual(runs[0], runs[1])
        # The probes never run beside USB AUDIO IN, and the channel's in-region is clear of its block.
        with self.assertRaises(ValueError):
            stream_probe.scheduler(usb, SimpleNamespace(stream_probe=64, stream_read=0), usb=True)
        self.assertEqual(stream_probe.USB_INPUT[:2], (usb_audio_input.DESTINATION & 0xfff, 160))
        with self.assertRaisesRegex(ValueError, 'USB AUDIO IN'):
            stream_probe.proof(a_words=160, transfers=stream_probe.TRANSFERS + (stream_probe.USB_INPUT,))

    def test_channel_recovery_beside_usb_input(self):
        """dsp.c's recovery in the release base: USB AUDIO IN gives up for its phases (3, 4), the channel for its own (5,
        6) and core 1's (dl_c1_phase 2); state 7 selects core 0 once; B's read gives up too."""
        import usb_audio_input
        text = (SDK / 'elekloader/dsp.c').read_text()
        # build_core.py's own USB AUDIO IN edits, as it makes them
        text = usb_audio_input.replace(text, 'DSP_SELECT = dl_c1_phase ? 1u : (uint8_t)(dl_phase - 1u);',
                                       'DSP_SELECT = dl_c1_phase ? 1u : 0u; /* state 7 always targets core 0 */')
        text = usb_audio_input.replace(text, '    dl_phase = dl_c1_phase = 0;', '    if (dl_phase >= 3u) {\n'
                                       '        extern void modwerk_usb_input_dma_failed(void);\n        modwerk_usb_input_dma_failed();\n'
                                       '    }\n    dl_phase = dl_c1_phase = 0;')
        dsp = stream_probe.dsp_c(text, SimpleNamespace(stream_channel=True), usb=True)
        self.assertIn('if (dl_phase == 3u || dl_phase == 4u) {\n        extern void modwerk_usb_input_dma_failed', dsp)
        self.assertIn('if (dl_phase >= 5u || dl_c1_phase == 2u) {', dsp)
        self.assertEqual(dsp.count('DSP_SELECT = dl_c1_phase ? 1u : 0u;'), 1)
        self.assertIn('mw_stream_read_failed();', dsp)
        self.assertLess(dsp.index('mw_stream_dma_failed();'), dsp.index('    dl_phase = dl_c1_phase = 0;'))
        # the channel adds nothing at the frame head and keeps USB AUDIO IN's cold words
        args = SimpleNamespace(stream_channel=True, resident_on_demand=True)
        self.assertEqual(stream_probe.place_receiver(args, lambda end: ('placed', end), None, 'A', 0x1fdf, None), ('placed', 0x1fdf))
        self.assertEqual(stream_probe.cflags(args), ['-DMODWERK_STREAM_CHANNEL'])
        names = set(stream_probe.inputs(args))
        self.assertEqual(names, {'sdk/machines/octatrack/module-adapters/' + n for n in ('stream_probe.py', 'stream_channel.c', 'stream_channel.h')})


if __name__ == '__main__':
    unittest.main()
