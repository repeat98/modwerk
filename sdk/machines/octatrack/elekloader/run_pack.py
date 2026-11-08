# SPDX-License-Identifier: GPL-3.0-or-later
"""The base's .run stored packed in MAIN, and run_unpack.s, the boot's decoder, in Python.

MAIN ends with the linked .run, which core-ot.s's boot used to copy word by word. Stored packed, it keeps the RAM
boot image under its bound. The stream is the section format of Elektron OS images (Modwerk's own codec,
sdk/firmware_codec: aplib.py's pack_section, which the browser builder runs byte for byte), so the native and browser
builds stay equal. decode() is run_unpack.s instruction by instruction, and pack() refuses a stream it does not turn
back into .run. No stock bytes.
"""
import hashlib
from pathlib import Path

ASM = Path(__file__).resolve().with_name('run_unpack.s')
# decode() models exactly this routine: change both together, then this pin.
ASM_SHA256 = '78241fcab328e00fe5f3e5a51568d3db25c1723708a40d9270491a05d074f592'
UNCACHED = 0x08000000  # core-ot's mod.json defsym
M = 0xFFFFFFFF


class Fatal(ValueError):
    """Where run_unpack.s hangs (mw_run_fatal) rather than write outside the run."""


class _Unpack:
    """run_unpack.s's registers on the image's section and the run it writes."""

    def __init__(self, section, words, load, start):
        self.section, self.load, self.start, self.out = section, load, start, bytearray(4 * words)
        self.a0 = load                                              # lea __run_load, %a0
        self.d0 = int.from_bytes(bytes(self.read(load + k) for k in range(4)), 'big')  # move.l (%a0), %d0
        self.a0 = self.a0 + 8 & M                                   # addq.l #8, %a0
        self.a3 = self.a0 + self.d0 & M                             # lea (%a0,%d0.l), %a3
        self.a1 = self.a2 = start                                   # movea.l #__run_start + UNCACHED, %a1 / %a2
        self.d0 = words                                             # move.l #__run_words, %d0
        self.a4 = self.a1 + 4 * self.d0 & M                         # lea (%a1,%d0.l*4), %a4
        self.d1 = self.d3 = self.a5 = 0
        self.d2 = 0                                                 # moveq #0, %d2

    def read(self, a):
        """The image's byte at a. The model knows only the section; the boot would read whatever lies past it."""
        if not 0 <= a - self.load < len(self.section):
            raise ValueError('run_unpack.s would read past the section as built')
        return self.section[a - self.load]

    def put(self, a, value):
        """A byte through the uncached alias: the checks before every write keep a inside the run."""
        if not 0 <= a - self.start < len(self.out):
            raise AssertionError('the model wrote outside the run: it is not run_unpack.s')
        self.out[a - self.start] = value

    def bit(self):
        """mw_run_bit -> C (X too)."""
        c, self.d2 = self.d2 >> 31, self.d2 << 1 & M                # add.l %d2, %d2
        if self.d2:                                                 # bne.s mw_run_bit_done
            return c
        if self.a0 >= self.a3:                                      # cmpa.l %a3, %a0 / bcc.s mw_run_fatal
            raise Fatal('a tag byte past the stream')
        self.d2 = self.d2 & ~0xff & M | self.read(self.a0)          # move.b (%a0)+, %d2
        self.a0 = self.a0 + 1 & M
        self.d2 = self.d2 << 8 & M                                  # lsl.l #8, %d2
        self.d2 |= 0x80                                             # ori.l #0x80, %d2
        self.d2 = (self.d2 >> 16 | self.d2 << 16) & M               # swap %d2
        c, self.d2 = self.d2 >> 31, self.d2 << 1 & M                # add.l %d2, %d2
        return c

    def gamma(self):
        """mw_run_gamma -> d0."""
        self.d0 = 1                                                 # moveq #1, %d0
        while True:
            x = self.bit()                                          # bsr.s mw_run_bit
            self.d0 = self.d0 * 2 + x & M                           # addx.l %d0, %d0
            if self.bit():                                          # bsr.s mw_run_bit / bcc.s mw_run_gamma_bit
                return

    def run(self):
        while True:
            if self.bit():                                          # mw_run_next: bsr.s mw_run_bit / bcc.s mw_run_match
                if self.a1 >= self.a4:                              # cmpa.l %a4, %a1 / bcc.s mw_run_fatal
                    raise Fatal('a literal past the run')
                if self.a0 >= self.a3:                              # cmpa.l %a3, %a0 / bcc.s mw_run_fatal
                    raise Fatal('a literal past the stream')
                self.put(self.a1, self.read(self.a0))               # move.b (%a0)+, (%a1)+
                self.a0, self.a1 = self.a0 + 1 & M, self.a1 + 1 & M
                continue                                            # bra.s mw_run_next
            self.gamma()                                            # mw_run_match: bsr.w mw_run_gamma
            self.d1 = 2                                             # moveq #2, %d1
            if self.d0 == self.d1:                                  # cmp.l %d1, %d0 / beq.s mw_run_fatal
                raise Fatal('the reuse code')
            if self.a0 >= self.a3:                                  # cmpa.l %a3, %a0 / bcc.s mw_run_fatal
                raise Fatal('an offset byte past the stream')
            self.d0 = self.d0 << 8 & M                              # lsl.l #8, %d0
            self.d1 = 0                                             # moveq #0, %d1
            self.d1 = self.d1 & ~0xff & M | self.read(self.a0)      # move.b (%a0)+, %d1
            self.a0 = self.a0 + 1 & M
            self.d0 = self.d0 + self.d1 & M                         # add.l %d1, %d0
            self.d0 = self.d0 - 767 & M                             # subi.l #767, %d0
            if self.d0 == 0:                                        # beq.s mw_run_done
                break
            self.d3 = self.d0                                       # move.l %d0, %d3
            self.d1 = 0                                             # moveq #0, %d1
            x = self.bit()                                          # bsr.s mw_run_bit
            self.d1 = self.d1 * 2 + x & M                           # addx.l %d1, %d1
            x = self.bit()                                          # bsr.s mw_run_bit
            self.d1 = self.d1 * 2 + x & M                           # addx.l %d1, %d1
            if self.d1 == 0:                                        # tst.l %d1 / bne.s mw_run_far
                self.gamma()                                        # bsr.s mw_run_gamma
                self.d1 = self.d0 + 2 & M                           # move.l %d0, %d1 / addq.l #2, %d1
            if self.d3 > 3328:                                      # mw_run_far: cmpi.l #3328, %d3 / bls.s mw_run_copy
                self.d1 = self.d1 + 1 & M                           # addq.l #1, %d1
            self.a5 = self.a1 - self.d3 & M                         # mw_run_copy: movea.l %a1, %a5 / suba.l %d3, %a5
            if self.a5 < self.a2:                                   # cmpa.l %a2, %a5 / bcs.s mw_run_fatal
                raise Fatal('an offset before the run')
            if self.a5 >= self.a1:                                  # cmpa.l %a1, %a5 / bcc.s mw_run_fatal
                raise Fatal('an offset of 0 or past the written run')
            self.d0 = self.a4 - self.a1 & M                         # move.l %a4, %d0 / sub.l %a1, %d0
            if self.d1 >= self.d0:                                  # cmp.l %d0, %d1 / bcc.s mw_run_fatal
                raise Fatal('a match past the run')
            while True:                                             # mw_run_byte:
                self.put(self.a1, self.out[self.a5 - self.start])   # move.b (%a5)+, (%a1)+
                self.a5, self.a1 = self.a5 + 1 & M, self.a1 + 1 & M
                borrow, self.d1 = self.d1 == 0, self.d1 - 1 & M     # subq.l #1, %d1
                if borrow:                                          # bcc.s mw_run_byte
                    break
        if self.a1 != self.a4:                                      # mw_run_done: cmpa.l %a4, %a1 / bne.s mw_run_fatal
            raise Fatal('the stream ended before the run')
        if self.a0 != self.a3:                                      # cmpa.l %a3, %a0 / bne.s mw_run_fatal
            raise Fatal('the run ended before the stream')
        return bytes(self.out)


def decode(section, words, load, start):
    """run_unpack.s with the section at `load` (__run_load), writing `words` (__run_words) words from `start`
    (__run_start + UNCACHED): -> the bytes it writes. Raises Fatal where it hangs."""
    return _Unpack(bytes(section), words, load, start).run()


def _layout(layout, symbols, load):
    run_load, ddr = layout.get('run_load'), layout.get('ddr')
    words, start = symbols.get('__run_words'), symbols.get('__run_start')
    if (not isinstance(ddr, list) or len(ddr) != 2 or any(type(v) is not int for v in (run_load, words, start, *ddr)) or
            symbols.get('__run_load') != run_load or start != ddr[0] or 4 * words != ddr[1] - ddr[0] or run_load <= load):
        raise ValueError('The packed .run needs the actual linked run layout.')
    return run_load - load, run_load, words, start


def pack(main, layout, symbols, load, pack_section):
    """MAIN with its trailing plain .run replaced by `pack_section` of it -> (image, proof). Refuses unless decode()
    turns the section back into exactly that .run, and the stream lies apart from the run it is unpacked into."""
    if hashlib.sha256(ASM.read_bytes()).hexdigest() != ASM_SHA256:
        raise ValueError('run_unpack.s is not the routine decode() models; change both, then ASM_SHA256.')
    at, run_load, words, start = _layout(layout, symbols, load)
    plain = bytes(main[at:])
    if len(plain) != 4 * words:
        raise ValueError('MAIN does not end with exactly the linked .run.')
    section = bytes(pack_section(plain))
    if not (run_load + len(section) <= start or start + 4 * words <= run_load):
        raise ValueError('The packed .run would be unpacked over itself.')
    if decode(section, words, run_load, start + UNCACHED) != plain:
        raise ValueError('The packed .run does not decode to the linked one.')
    return bytes(main[:at]) + section, dict(
        format='section (sdk/firmware_codec aplib.pack_section)', decoder='run_unpack.s', decoderSha256=ASM_SHA256,
        plainBytes=len(plain), plainSha256=hashlib.sha256(plain).hexdigest(),
        packedBytes=len(section), packedSha256=hashlib.sha256(section).hexdigest(), savedBytes=len(plain) - len(section))


def unpack(main, layout, symbols, load):
    """The plain image a boot of the packed MAIN runs: the section at run_load as run_unpack.s decodes it."""
    at, run_load, words, start = _layout(layout, symbols, load)
    return bytes(main[:at]) + decode(main[at:], words, run_load, start + UNCACHED)
