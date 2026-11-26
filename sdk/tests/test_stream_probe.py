# SPDX-License-Identifier: GPL-3.0-or-later
"""Stream probes A and B (module-adapters/stream_probe.py): A's core-0 checker and B's core-0 writer run in dsp_host,
B's ColdFire check compiled on the host and fed what the writer left, and the build seams against the sources they
edit."""
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


if __name__ == '__main__':
    unittest.main()
