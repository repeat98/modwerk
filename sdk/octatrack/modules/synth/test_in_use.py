"""fm_in_use (registration.c, 0.1.5) on a ColdFire core: when FM Synth may rest, and when it must stay awake."""
import importlib.util
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import unittest

BANK0, BANK_STRIDE, WORK, SAVED, STRIDE = 0x400e21e0, 0x9b340, 0x8ed80, 0x9504a, 6322
SLOTS, GLIDE, PART_IDX, BANK_PTR = 0x100b14f0, 0x100b14ed, 0x100b14cf, 0x46c82456
CODE, STACK, RETURN, FR = 0x100000, 0x200000, 0x20e000, 0x110000  # FR: poly.s fm_fr


@unittest.skipUnless(importlib.util.find_spec("unicorn") and all(
    shutil.which("m68k-elf-" + name) for name in ("as", "ld", "nm", "objcopy")
), "needs Unicorn and the ColdFire toolchain")
class InUse(unittest.TestCase):
    def setUp(self):
        import unicorn
        from unicorn import m68k_const as regs
        self.regs = regs
        with tempfile.TemporaryDirectory() as build:
            source = Path(__file__).parent / "registration.s"
            for command in (
                ["as", "-mcpu=5475", source, "-o", "r.o"],
                ["ld", "-Ttext", hex(CODE), "--defsym", "fm_stock_validate=0", "--defsym", "fm_fr=" + hex(FR), "-e", "fm_in_use",
                 "r.o", "-o", "r.elf"],
                ["objcopy", "-O", "binary", "r.elf", "r.bin"],
            ):
                subprocess.run(["m68k-elf-" + command[0], *command[1:]], cwd=build, check=True)
            self.sym = {f[2]: int(f[0], 16) for f in (row.split() for row in subprocess.check_output(
                ["m68k-elf-nm", "r.elf"], cwd=build, text=True).splitlines()) if len(f) == 3}
            image = (Path(build) / "r.bin").read_bytes()
        self.cpu = unicorn.Uc(unicorn.UC_ARCH_M68K, unicorn.UC_MODE_BIG_ENDIAN)
        self.cpu.ctl_set_cpu_model(regs.UC_CPU_M68K_CFV4E)
        for start, length in [(CODE, 0x10000), (FR, 0x1000), (STACK, 0x10000), (0x100b1000, 0x23000), (0x46c82000, 0x1000),
                              (0x400e2000, 0x9b5000)]:
            self.cpu.mem_map(start, length)
        self.cpu.mem_write(CODE, image)
        self.live(2, 1)

    def call(self, name, *args):
        sp = STACK + 0x8000 - 4 * (len(args) + 1)
        self.cpu.mem_write(sp, struct.pack(">%dI" % (len(args) + 1), RETURN, *args))
        self.cpu.reg_write(self.regs.UC_M68K_REG_A7, sp)
        self.cpu.emu_start(self.sym[name], RETURN, count=100000)
        return self.cpu.reg_read(self.regs.UC_M68K_REG_D0)

    def live(self, bank, part):
        self.cpu.mem_write(BANK_PTR, struct.pack(">I", BANK0 + bank * BANK_STRIDE))
        self.cpu.mem_write(PART_IDX, bytes([part]))

    def part(self, bank, part, saved=False):
        return BANK0 + bank * BANK_STRIDE + (SAVED if saved else WORK) + part * STRIDE

    def sign(self, at, track, kind=1, sig=b"FM\x01"):
        self.cpu.mem_write(at + 0x22 + track, bytes([kind]))
        self.cpu.mem_write(at + 60 + 30 * track, sig)

    def sweep(self):
        return [self.call("fm_in_use") for _ in range(128)]

    def test_rests_only_after_a_whole_clean_sweep(self):
        self.assertEqual(self.sweep(), [1] * 127 + [0])  # awake from the install until a whole sweep found nothing
        self.assertEqual(self.sweep(), [0] * 128)

    def test_an_fm_track_in_the_live_part_keeps_it_awake(self):
        self.sweep()
        self.sign(self.part(2, 1), 5)
        self.assertEqual(self.call("fm_in_use"), 1)
        self.sign(self.part(2, 1), 5, sig=b"FM\x02")  # another version is not FM/1
        self.sign(self.part(2, 1), 6, kind=0)         # nor a STATIC track carrying the bytes
        self.sweep()
        self.assertEqual(self.sweep(), [0] * 128)

    def test_any_part_of_any_bank_working_or_saved(self):
        for bank, part, saved in ((15, 3, True), (0, 0, False), (9, 2, True)):
            self.sweep(); self.sweep()
            self.sign(self.part(bank, part, saved), 7)
            first = self.sweep()
            at = bank * 8 + (4 if saved else 0) + part  # the sweep's index for that Part
            self.assertEqual(first, [0] * at + [1] * (128 - at))
            self.assertEqual(self.sweep(), [1] * 128)  # seen last sweep: awake for this one
            self.sign(self.part(bank, part, saved), 7, kind=0, sig=b"\0\0\0")
            self.assertEqual(self.sweep(), [1] * 127 + [0])

    def test_a_legacy_marker_in_any_flex_slot(self):
        def path(slot, text):
            self.cpu.mem_write(SLOTS + 0x448 * slot, text + b"\0")
        path(3, b"/AUDIO/SYNTHS/kick.wav")  # a folder named SYNTH* is no marker
        path(4, b"/AUDIO/x/FMSYNTH")        # 255 bytes at most are read; the name is what counts
        self.sweep(); self.sweep()
        path(4, b"")
        self.assertEqual(self.sweep()[:5], [1, 1, 1, 1, 1])  # the slot before 4's turn: seen in the last sweep
        self.assertEqual(self.sweep(), [0] * 128)
        for name in (b"/AUDIO/FMSYNTH.WAV", b"/A/B/SYNTH1.wav", b"SYNTH"):
            path(100, name)
            self.assertEqual(self.sweep(), [0] * 100 + [1] * 28, name)
            path(100, b"/AUDIO/pad.wav")
            self.assertEqual(self.sweep(), [1] * 127 + [0])
        path(127, b"/" * 300)  # no terminator within 255 bytes: still bounded
        self.assertEqual(self.sweep(), [0] * 128)

    def test_idle_and_waking_tell_the_clock(self):
        flags = lambda: list(self.cpu.mem_read(FR + 10, 2))  # FR_IDLE, FR_REBASE
        self.sweep()
        self.assertEqual(flags(), [1, 0])  # idle
        self.sweep()
        self.assertEqual(flags(), [1, 0])
        self.cpu.mem_write(GLIDE, b"\x10")
        self.assertEqual(self.call("fm_in_use"), 1)
        self.assertEqual(flags(), [0, 1])  # awake again: po_l3b_three drops one step measurement
        self.cpu.mem_write(FR + 11, b"\0")  # po_rebase clears it
        self.assertEqual(self.call("fm_in_use"), 1)
        self.assertEqual(flags(), [0, 0])  # awake to awake: no rebase

    def test_glide_a_pick_or_no_bank_keep_it_awake(self):
        self.sweep()
        self.cpu.mem_write(GLIDE, b"\x10")
        self.assertEqual(self.call("fm_in_use"), 1)
        self.cpu.mem_write(GLIDE, b"\0")
        self.assertEqual(self.call("fm_in_use"), 0)
        self.assertEqual(self.call("fm_admit_track", self.part(2, 1), 3), 1)  # the base's pick asks before it wakes
        self.assertEqual([self.call("fm_in_use") for _ in range(2)], [1, 0])  # once: then the Part answers
        self.assertEqual(self.call("fm_admit_track", self.part(2, 1), 8), 0)
        self.cpu.mem_write(BANK_PTR, b"\0\0\0\0")
        self.assertEqual(self.call("fm_in_use"), 1)


if __name__ == "__main__":
    unittest.main()
