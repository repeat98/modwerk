# SPDX-License-Identifier: GPL-3.0-or-later
"""Stream probe A (module-adapters/stream_probe.py): the core-0 checker run in dsp_host on blocks good and bad,
and the build seams against the sources they edit."""
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
import tempfile
import unittest

SDK = Path(__file__).resolve().parents[1] / 'machines/octatrack'
sys.path[:0] = [str(SDK / 'module-adapters'), str(SDK / 'elekloader')]
import dsp_packages  # noqa: E402
import stream_probe  # noqa: E402

END = 0x1fdf
WRAPPER = 0x1100
OUT = 0x1800        # the wrapper copies the checker's 19 P words here
Y0, R2 = 0x123456, 0x00abcd


def memory_record(space, address, words):
    return struct.pack('<BII', space, address, len(words)) + struct.pack(f'<{len(words)}I', *words)


def model(words, counters, block):
    """What the checker should leave: its 19 P words (8 live, the snapshot flag, 10 published) and the magic word."""
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
        differences |= block[i] ^ ((seq & 0xff) << 8 | i)
    if differences & 0xffff:
        c[7] = differences
        c[2] = (c[2] + 1) & 0xffffff
    else:
        c[1] = (c[1] + 1) & 0xffffff
    if differences & 0xff0000:
        c[5] = (c[5] + 1) & 0xffffff
    if block[0] & 1:
        serial = (c[9] + 1) & 0xffffff
        c[9:19] = [serial, *c[0:8], serial]
    return c, 0


class StreamProbe(unittest.TestCase):
    def run_checker(self, words, bank, counters, block):
        assembler = os.environ.get('ELEKLOADER_DSP_ASM')
        host = Path(assembler).with_name('dsp_host') if assembler else None
        if not host or not host.is_file():
            self.skipTest('dsp_host is required beside ELEKLOADER_DSP_ASM')
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            source = stream_probe.dsp_source(words)
            sized, _ = dsp_packages.assemble(source, END, work)
            origin = END - len(sized)
            checker, labels = dsp_packages.assemble(source, origin, work)
            self.assertEqual(labels['sqpub'] + stream_probe.DSP_WORDS, END)
            wrapper = f"""init:
        rts
proc:
        move #>${Y0:x},y0
        move #>${R2:x},r2
        move #>${bank:x},r6
        move #>${origin:x},r5
        jsr  (r5)
        move y0,x:>${OUT + 0x20:x}
        move #>${labels['sqframes']:x},r0
        move #>${OUT:x},r1
        do #19,copied
        move p:(r0)+,x0
        move x0,x:(r1)+
copied:
        rts
"""
            boot, entry = dsp_packages.assemble(wrapper, WRAPPER, work)
            mailbox = bank + stream_probe.REGION
            image = work / 'stream.mem'
            image.write_bytes(memory_record(0, WRAPPER, boot) + memory_record(0, origin, checker)
                              + memory_record(0, labels['sqframes'], counters) + memory_record(1, mailbox, block) + b'\xff')
            addresses = [*range(OUT, OUT + 19), OUT + 0x20, 0x204, mailbox]
            run = subprocess.run([host, '-mem', image, '-init', f'{entry["init"]:x}', '-proc', f'{entry["proc"]:x}',
                                  '-ctx', '100f,100f,1010', '-blocks', '1', '-frames', '16', '-out', work / 'audio.raw',
                                  '-peekx', ','.join(f'{at:x}' for at in addresses)],
                                 capture_output=True, text=True, timeout=10)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            found = {int(at, 16): int(value, 16) for at, value in
                     re.findall(r'X:0x([0-9a-f]+)\s*=\s*0x([0-9a-f]+)', run.stdout)}
            self.assertEqual(found[OUT + 0x20], Y0, 'y0 is put back')
            self.assertEqual(found[0x204], R2, 'the displaced instruction still stores r2')
            return [found[at] for at in range(OUT, OUT + 19)], found[mailbox]

    def expect(self, words, bank, counters, block):
        got, magic = self.run_checker(words, bank, counters, block)
        want, want_magic = model(words, counters, block)
        self.assertEqual(got, want)
        self.assertEqual(magic, want_magic)
        return got

    def test_good_blocks_on_both_banks_and_every_length(self):
        for words in (32, 160):
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

    def test_missing_out_of_order_wrapped_and_published(self):
        start = [100, 90, 2, 8, 0, 0, 0xffff, 0x10] + [0] * 11
        got = self.expect(96, 0x2000, start, [0x5349] + stream_probe.pattern(0, 96)[1:])
        self.assertEqual(got[3], 9)
        self.assertEqual(self.expect(96, 0x2000, start, stream_probe.pattern(0, 96))[4], 0)  # $ffff -> 0 is in order
        self.assertEqual(self.expect(96, 0x4000, start, stream_probe.pattern(7, 96))[4], 1)
        got = self.expect(128, 0x4000, start[:9] + [41] + [0] * 9, stream_probe.pattern(0, 128, snapshot=True))
        self.assertEqual(got[9:], [42, 101, 91, 2, 8, 0, 0, 0, 0x10, 42])

    def test_lengths_and_region(self):
        self.assertEqual(stream_probe.WORDS, (32, 64, 96, 128, 160))
        for bad in (0, 48, 192):
            with self.assertRaises(ValueError):
                stream_probe.check_words(bad)
        self.assertGreater(stream_probe.proof(), 0)
        self.assertEqual(stream_probe.REGION + stream_probe.CAPACITY, 0x400)
        # stream_probe.c's reply, dev.c's length check and scripts/stream-probe.mjs agree on its size.
        c = stream_probe.SOURCE.read_text()
        define = lambda name: int(re.search(rf'#define {name} (\d+)u', c).group(1))
        self.assertEqual(16 + 5 * define('WINDOWS') + define('DSP_WORDS'), stream_probe.REPLY_WORDS)
        self.assertEqual(define('DSP_WORDS'), stream_probe.DSP_WORDS)
        self.assertEqual(int(re.search(r'#define MAGIC 0x([0-9a-f]+)u', c).group(1), 16), stream_probe.MAGIC)
        reader = (SDK.parents[2] / 'scripts/stream-probe.mjs').read_text()
        self.assertIn(f'STREAM_REPLY_BYTES = {4 * stream_probe.REPLY_WORDS}', reader)
        self.assertIn(f'STREAM_REQUEST = {stream_probe.REQUEST}', reader)

    def test_build_seams_and_scheduler(self):
        core = stream_probe.build_core_module()  # every seam found once, and the edited build_core.py compiles
        self.assertIs(core.STREAM_PROBE, stream_probe)
        text = (SDK.parents[1] / 'octabam/platform/dsp-dynload-transport/hooks.s').read_text()
        for old, new in (core.DSP_EDITS['hooks.s'] + core.WIDTH_EDITS.get('hooks.s', ())
                         + core.DSP_HOOK_EDITS['guard'].get('hooks.s', ())):
            self.assertEqual(text.count(old), 1, old)
            text = text.replace(old, new)
        hooks = stream_probe.scheduler(text)
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


if __name__ == '__main__':
    unittest.main()
