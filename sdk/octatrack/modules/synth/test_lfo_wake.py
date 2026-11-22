"""Exercise the frame router and LFO selector before the first voice is rendered."""
import importlib.util
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


@unittest.skipUnless(importlib.util.find_spec("unicorn") and all(
    shutil.which("m68k-elf-" + name) for name in ("as", "ld", "nm", "objcopy")
), "needs Unicorn and the ColdFire toolchain")
class FirstNote(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import unicorn
        from unicorn import m68k_const as regs
        cls.regs = regs
        with tempfile.TemporaryDirectory() as build:
            source = Path(__file__).parent / "upstream/synth/poly.s"
            for command in (
                ["as", "-mcpu=5475", source, "-o", "poly.o"],
                ["ld", "-Ttext", "0x100000", "-e", "fm_prepare_frame", "poly.o", "-o", "poly.elf"],
                ["objcopy", "-O", "binary", "poly.elf", "poly.bin"],
            ):
                subprocess.run(["m68k-elf-" + command[0], *command[1:]], cwd=build, check=True)
            listing = subprocess.check_output(["m68k-elf-nm", "poly.elf"], cwd=build, text=True)
            cls.sym = {}
            for row in listing.splitlines():
                fields = row.split()
                if len(fields) == 3:
                    cls.sym[fields[2]] = int(fields[0], 16)
            cls.image = (Path(build) / "poly.bin").read_bytes()
        cls.cpu = unicorn.Uc(unicorn.UC_ARCH_M68K, unicorn.UC_MODE_BIG_ENDIAN)
        cls.cpu.ctl_set_cpu_model(regs.UC_CPU_M68K_CFV4E)
        cls.bank, cls.stack, cls.return_to = 0x40200000, 0x208000, 0x20e000
        for start, length in [(0x100000, 65536), (0x200000, 65536), (0x100b1000, 4096),
                              (0x46104000, 4096), (0x46c82000, 4096), (cls.bank, 0xa0000),
                              (0x40000000, 65536), (0x80006000, 4096), (0x400d2000, 4096)]:
            cls.cpu.mem_map(start, length)
        cls.cpu.mem_write(0x100000, cls.image)
        cls.cpu.mem_write(cls.sym["PART_PTR"], cls.bank.to_bytes(4, "big"))

    def route(self, starts, sounding, signature, glide, external=False):
        u, s = self.cpu, self.sym
        u.mem_write(s["fm_fr"], bytes(16))
        u.mem_write(s["fm_fr"] + s["FR_ON"], bytes([sounding]))
        u.mem_write(s["GLIDE_AT"], bytes([glide]))
        u.mem_write(s["NIBBLE"], bytes(16 if starts & (1 << t) else 0 for t in range(8)))
        machines = self.bank + s["MACH_OFF"]
        u.mem_write(machines, bytes([1]) * 8)
        for t in range(8):
            u.mem_write(machines + 26 + 30 * t, signature)
        u.mem_write(self.stack, self.return_to.to_bytes(4, "big"))
        u.reg_write(self.regs.UC_M68K_REG_A7, self.stack)
        u.emu_start(s["fm_frame"], self.return_to, count=2000)
        self.assertEqual(u.reg_read(self.regs.UC_M68K_REG_PC), self.return_to)
        self.assertEqual(u.mem_read(s["fm_fr"] + s["FR_PENDING"], 1)[0],
                         0 if external else starts)
        target = 0x40003bc6 if sounding or (starts and not external) else 0x4000cf56
        u.reg_write(self.regs.UC_M68K_REG_A7, self.stack)
        u.emu_start(s["fm_lfo_pass"], target, count=12)
        self.assertEqual(u.reg_read(self.regs.UC_M68K_REG_PC), target)

    def test_first_note_and_idle(self):
        for track in range(8):
            bit = 1 << track
            for signature in (b"FM\x01", bytes(3)):  # native FM or FLEX with a possible sample lock
                for glide in (0, 96):
                    self.route(0, 0, signature, glide)
                    self.route(bit, 0, signature, glide)
                    self.route(0, bit, signature, glide)
                    self.route(0, 0, signature, glide)
            self.route(bit, 0, b"AB\x01", 0, external=True)

    def test_prepare_does_nothing_while_idle_and_drops_the_step_across_it(self):
        # registration.c fm_in_use sets FR_IDLE while FM Synth rests and FR_REBASE as it wakes (0.1.5).
        u, s = self.cpu, self.sym
        fps = lambda: int.from_bytes(u.mem_read(s["po_clock"] + s["CK_FPS"], 4), "big")
        frames = lambda: int.from_bytes(u.mem_read(s["po_clock"] + s["CK_FRAMES"], 4), "big")
        def prepare(frame):  # a 20-frame step
            u.mem_write(s["SEQ_STEP"], (frame // 20).to_bytes(2, "big"))
            u.mem_write(s["SEQ_TICK"], b"\0")
            u.mem_write(self.stack, self.return_to.to_bytes(4, "big"))
            u.reg_write(self.regs.UC_M68K_REG_A7, self.stack)
            u.emu_start(s["fm_prepare_frame"], self.return_to, count=4000)
        u.mem_write(s["fm_fr"], bytes(16))
        u.mem_write(s["NIBBLE"], bytes(16))
        u.mem_write(s["GLIDE_AT"], b"\0")
        u.mem_write(s["po_clock"], bytes(32))
        for frame in range(59):
            prepare(frame)
        self.assertEqual(fps(), 20)
        counted = frames()
        u.mem_write(s["fm_fr"] + s["FR_IDLE"], b"\1")
        for frame in range(59, 114):
            prepare(frame)
        self.assertEqual(frames(), counted)  # idle: not one frame counted
        u.mem_write(s["fm_fr"] + s["FR_IDLE"], b"\0")
        u.mem_write(s["fm_fr"] + s["FR_REBASE"], b"\1")
        for frame in range(114, 120):
            prepare(frame)
        self.assertEqual(fps(), 20)  # without the rebase this step change would measure 19
        self.assertEqual(u.mem_read(s["fm_fr"] + s["FR_REBASE"], 1)[0], 0)
        for frame in range(120, 145):
            prepare(frame)
        self.assertEqual(fps(), 20)


if __name__ == "__main__":
    unittest.main()
