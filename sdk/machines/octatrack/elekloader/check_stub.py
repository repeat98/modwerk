#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Run the boot stub (build_stub.py) the way an Octatrack starts it, in Unicorn's ColdFire, with Elektron's own
bootloader code from your OS file: its last steps (the cache settings, its unpacker unpacking our trampoline, the
call to 0x40000400), then our stub, until the jump into the OS. For each slot state it checks the image the stub
unpacked, the try it marked, and that the OS is entered with the bootloader's stack and registers. Local only: the
bootloader's bytes stay on your computer. Unicorn models no caches; the instruction-cache invalidate is checked in
the stub's bytes (build_stub.py).

    python3 -B check_stub.py --stock OCTATRACK_OS1.40C.bin --base NOT_FLASH_CANDIDATE.bin [--upstream ELEKLOADER]

Needs `pip install unicorn` and m68k-elf-gcc; takes several minutes. --base is any base .bin (a second OS for slot B).
"""
import argparse
import struct
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
NOR, NOR_BYTES, SRAM, SDRAM = 0, 0x800000, 0x80000000, 0x40000000
SLOT_A, SLOT_B, RECORD, TRIES, CONFIRMED = 0x10000, 0x100000, 0x100, 0x80, 0xc0
OS, BOOT_WORD, SP = 0x40000400, 0x00001234, 0x80007f00


def fnv(data):
    h = 0x811c9dc5
    for byte in data:
        h = ((h ^ byte) * 0x01000193) & 0xffffffff
    return h


def record(generation, length, confirmed, tries):
    page = bytearray(b'\xff' * RECORD)
    page[0:12] = struct.pack('>4sII', b'MWSL', generation, length)
    page[12:44] = b'\0' * 32
    page[44:48] = struct.pack('>I', fnv(page[:44]))
    page[TRIES:TRIES + 2] = struct.pack('>H', tries)
    if confirmed:
        page[CONFIRMED:CONFIRMED + 2] = b'\0\0'
    return bytes(page)


class Unit:
    """NOR (with an AMD word-program model), SRAM and SDRAM; the bootloader in NOR's first 16 KB."""

    def __init__(self, bootloader, sector):
        from unicorn import Uc, UC_ARCH_M68K, UC_MODE_BIG_ENDIAN, UC_HOOK_MEM_WRITE, UC_HOOK_CODE
        from unicorn.m68k_const import UC_CPU_M68K_CFV4E
        self.uc = uc = Uc(UC_ARCH_M68K, UC_MODE_BIG_ENDIAN)
        uc.ctl_set_cpu_model(UC_CPU_M68K_CFV4E)
        for base, size in ((NOR, NOR_BYTES), (SRAM, 0x8000), (SDRAM, 0x2000000)):
            uc.mem_map(base, size)
        uc.mem_write(NOR, b'\xff' * NOR_BYTES)
        uc.mem_write(NOR, bootloader)
        uc.mem_write(0x4000, sector)
        self.pending, self.state, self.violations, self.programs, self.arrivals = [], 0, [], [], []
        self.ctrl = {}
        uc.hook_add(UC_HOOK_MEM_WRITE, self.nor_write, begin=NOR, end=NOR + NOR_BYTES - 1)
        uc.hook_add(UC_HOOK_CODE, self.from_sram, begin=SRAM, end=SRAM + 0x7fff)
        uc.hook_add(UC_HOOK_CODE, self.movec, begin=0x22a2, end=0x22ea)
        uc.hook_add(UC_HOOK_CODE, self.movec, begin=0x4100, end=0x4200)
        uc.hook_add(UC_HOOK_CODE, self.arrive, begin=OS, end=OS)

    def nor_write(self, uc, access, address, size, value, data):
        pc = uc.reg_read(self.reg('PC'))
        if not SRAM <= pc < SRAM + 0x8000:
            self.violations.append((pc, address, value))
        self.pending.append((address, size, value, bytes(uc.mem_read(address, size))))

    def from_sram(self, uc, address, size, data):
        """Before each instruction run from SRAM: undo the raw NOR writes and play them through the chip's commands."""
        for at, n, value, old in self.pending:
            uc.mem_write(at, old)
            value &= 0xffff
            if (self.state, at, value) in ((0, 0xaaaa, 0xaaaa), (1, 0x5554, 0x5555)):
                self.state += 1
            elif self.state == 2 and (at, value) == (0xaaaa, 0xa0a0):
                self.state = 3
            elif self.state == 3:
                word = struct.unpack('>H', bytes(uc.mem_read(at, 2)))[0] & value  # NOR clears bits only
                uc.mem_write(at, struct.pack('>H', word))
                self.programs.append((at, value))
                self.state = 0
            else:
                self.state = 0  # a reset (0xf0f0) or anything else: reading
        self.pending = []

    def reg(self, name):
        from unicorn import m68k_const
        return getattr(m68k_const, 'UC_M68K_REG_' + name)

    def movec(self, uc, address, size, data):
        """MOVEC to CACR/ACRs: recorded and skipped (Unicorn models no caches)."""
        op = bytes(uc.mem_read(address, 4))
        if op[:2] == b'\x4e\x7b':
            which = struct.unpack('>H', op[2:])[0] & 0xfff
            reg = (struct.unpack('>H', op[2:])[0] >> 12) & 0xf
            self.ctrl.setdefault(which, []).append(uc.reg_read(self.reg(('D%d' if reg < 8 else 'A%d') % (reg & 7))))
            uc.reg_write(self.reg('PC'), address + 4)

    def arrive(self, uc, address, size, data):
        regs = [uc.reg_read(self.reg('D%d' % i)) for i in range(8)] + [uc.reg_read(self.reg('A%d' % i)) for i in range(7)]
        sp = uc.reg_read(self.reg('A7'))
        self.arrivals.append((regs, sp, bytes(uc.mem_read(sp, 8))))
        if len(self.arrivals) == 2:
            uc.emu_stop()

    def start(self, limit=400_000_000):
        """The bootloader's last steps (1.40C 0x2db8): its cache routine unpacks 0x4012, then it calls 0x40000400."""
        uc = self.uc
        uc.mem_write(SRAM + 0x50a, struct.pack('>I', BOOT_WORD))
        uc.reg_write(self.reg('A7'), SP)
        for i in range(8):
            uc.reg_write(self.reg('D%d' % i), 0x11110000 + i)
        for i in range(7):
            uc.reg_write(self.reg('A%d' % i), 0x22220000 + i)
        uc.emu_start(0x2db8, 0xffffffff, count=limit)
        return uc.reg_read(self.reg('PC'))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--stock', required=True)
    parser.add_argument('--base', required=True, help='a base .bin: a second OS for slot B')
    parser.add_argument('--upstream', default='~/.cache/modwerk-upstream/elekloader')
    args = parser.parse_args()
    sys.path.insert(0, str(Path(args.upstream).expanduser()))
    sys.path.insert(0, str(HERE))
    from elekloader import formats
    import build_stub
    parsed, dev, _ = formats.load(args.stock)
    main_image = formats.main_image(parsed, dev)
    copy = main_image[0x400de1e0 - dev.main_load:0x400e21e0 - dev.main_load]
    bootloader = bytes(copy[0x86c:]) + bytes(copy[:0x86c])  # the copy is NOR's first 16 KB, rotated by 0x86c
    base = formats.parse(Path(args.base).read_bytes(), dev)
    images = {'stock': (bytes(parsed.container), bytes(main_image)), 'base': (bytes(base.container), bytes(formats.main_image(base, dev)))}
    with tempfile.TemporaryDirectory() as temp:
        body, code = build_stub.build(args.upstream, Path(temp))
    sector = bytes(parsed.container[:0x12]) + body

    def run(slots, expect, tries_after, name):
        unit = Unit(bootloader, sector)
        for base_at, (container, generation, confirmed, tries) in slots.items():
            unit.uc.mem_write(base_at, record(generation, len(container), confirmed, tries))
            unit.uc.mem_write(base_at + RECORD, container)
        pc = unit.start()
        ok = []
        if expect is None:
            ok.append(('stops, starting nothing', len(unit.arrivals) == 1 and 0x4100 <= pc < 0x4200))
        else:
            first, second = unit.arrivals[0], unit.arrivals[1] if len(unit.arrivals) > 1 else None
            image = images[expect][1]
            ok.append(('enters the OS', second is not None))
            if second:
                ok.append(('with the bootloader\'s registers', second[0] == first[0]))
                ok.append(('and its stack: return address and boot word', second[1] == first[1] == SP - 8 and
                           second[2] == struct.pack('>II', 0x2dc8, BOOT_WORD)))
                ok.append(('the %s image unpacked' % expect, bytes(unit.uc.mem_read(OS, len(image))) == image))
        for at, after in tries_after.items():
            ok.append(('tries at %#x now %#06x' % (at, after), struct.unpack('>H', bytes(unit.uc.mem_read(at + TRIES, 2)))[0] == after))
        ok.append(('NOR written only from SRAM, by the program routine', not unit.violations))
        ok.append(('caches as the bootloader leaves them, plus ICINVA', expect is None or unit.ctrl.get(2, [])[-1:] == [0x0008c100]))
        print('%-52s %s' % (name, 'passed' if all(v for _, v in ok) else 'FAILED'))
        for what, v in ok:
            if not v:
                print('    failed: ' + what)
        return all(v for _, v in ok)

    s, b = images['stock'][0], images['base'][0]
    results = [
        run({SLOT_A: (s, 2, True, 0xfffe)}, 'stock', {SLOT_A: 0xfffe}, 'one confirmed slot: starts it, writes nothing'),
        run({SLOT_A: (s, 2, True, 0xfffe), SLOT_B: (b, 3, False, 0xffff)}, 'base', {SLOT_B: 0xfffe}, 'newer unconfirmed: starts it, one try used'),
        run({SLOT_A: (s, 2, True, 0xfffe), SLOT_B: (b, 3, False, 0xfff8)}, 'stock', {SLOT_B: 0xfff0}, 'its tries spent: the previous base'),
        run({SLOT_A: (s, 4, True, 0xffff), SLOT_B: (b, 3, True, 0xffff)}, 'stock', {}, 'both confirmed: the newest'),
        run({SLOT_A: (s, 2, True, 0xffff), SLOT_B: (b[:len(b) // 2] + bytes([b[len(b) // 2] ^ 0xff]) + b[len(b) // 2 + 1:], 3, False, 0xffff)},
            'stock', {SLOT_B: 0xffff},
            'newer one damaged: the whole one'),
        run({}, None, {}, 'no whole slot: nothing'),
    ]
    sys.exit(0 if all(results) else 1)


if __name__ == '__main__':
    main()
