"""sy_render's silent paths (0.1.5) on a ColdFire core: an FM track with no voice, and a released voice at silence,
ship what the full path ships (FM_NO_SILENT assembles the full path alone), and the next note is the same."""
import importlib.util
import math
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import unittest

CODE, STACK, RETURN = 0x100000, 0x200000, 0x20e000
BANK, REC, RS, BUF = 0x40200000, 0x80008000, 0x80008100, 0x80009000
T = 1  # the FM track
WATCH = [(REC, 16), (BUF, 0x400), (0x80001c80, 4), (0x80000110, 0x400), (0x80000810, 72 * 8)]  # what the DSP and stock see


def build(defsym, source=Path(__file__).parent / "upstream/synth/poly.s"):
    with tempfile.TemporaryDirectory() as work:
        for command in (["as", "-mcpu=5475", *defsym, source, "-o", "p.o"],
                        ["ld", "-Ttext", hex(CODE), "-e", "sy_render", "p.o", "-o", "p.elf"],
                        ["objcopy", "-O", "binary", "p.elf", "p.bin"]):
            subprocess.run(["m68k-elf-" + command[0], *command[1:]], cwd=work, check=True)
        symbols = {f[2]: int(f[0], 16) for f in (row.split() for row in subprocess.check_output(
            ["m68k-elf-nm", "p.elf"], cwd=work, text=True).splitlines()) if len(f) == 3}
        # po_rate's EMAC instructions, which Unicorn's ColdFire does not all run: (address, length, mnemonic, operands)
        emac = []
        for row in subprocess.check_output(["m68k-elf-objdump", "-d", "p.elf"], cwd=work, text=True).splitlines():
            fields = row.split("\t")
            if len(fields) == 3 and "acc0" in fields[2]:
                mnemonic, operands = fields[2].split(None, 1)
                emac.append((int(fields[0].strip(" :"), 16), len(fields[1].split()) * 2, mnemonic, operands.split(",")))
        return (Path(work) / "p.bin").read_bytes(), symbols, emac


class Machine:
    def __init__(self, image, sym, emac):
        import unicorn
        from unicorn import m68k_const as regs
        self.u, self.sym, self.regs, self.count = unicorn.Uc(unicorn.UC_ARCH_M68K, unicorn.UC_MODE_BIG_ENDIAN), sym, regs, 0
        self.u.ctl_set_cpu_model(regs.UC_CPU_M68K_CFV4E)
        for start, length in [(CODE, 0x20000), (STACK, 0x10000), (0x100b1000, 0x1000), (0x46104000, 0x1000),
                              (0x46c82000, 0x1000), (0x40000000, 0x300000), (0x80000000, 0x10000)]:
            self.u.mem_map(start, length)
        self.u.mem_write(CODE, image)
        self.u.hook_add(unicorn.UC_HOOK_CODE, self.tick, begin=CODE, end=CODE + len(image))
        self.emac, self.acc = {at: (n, op, args) for at, n, op, args in emac}, 0
        for at in self.emac:
            self.u.hook_add(unicorn.UC_HOOK_CODE, self.mac, begin=at, end=at)
        w = lambda at, data: self.u.mem_write(at, data)
        w(sym["PART_PTR"], struct.pack(">I", BANK))
        w(BANK + sym["MACH_OFF"] + T, b"\1")                    # FLEX ...
        w(BANK + 0x8edbc + 30 * T, b"FM\1")                     # ... signed FM/1
        w(sym["FP_PTR"], struct.pack(">I", REC))
        w(sym["RS_PTR"], struct.pack(">I", RS))
        # The stock 2^x curve's shape (any table: both builds read the same one).
        w(sym["PITCH_TAB"], b"".join(struct.pack(">I", int(2 * 2 ** ((i - 512) / 480) * 2 ** 26)) for i in range(1100)))
        lane = sym["CURVALS"] + 72 * T
        w(lane + sym["CV_ATK"], b"\4"); w(lane + sym["CV_HOLD"], b"\x7f"); w(lane + sym["CV_REL"], b"\x14")
        w(lane + sym["CV_VOIC"], b"\1")
        # Stock code the paths reach, as stubs: the sample renderer an FM track gets before its first START (sy_fast),
        # and the voice kill's return (po_kill).
        w(sym["STOCK_RENDER"], bytes.fromhex("70004e75"))  # moveq #0,%d0; rts
        w(sym["KILL_RET"], bytes.fromhex("4e75"))

    def tick(self, *_):
        self.count += 1

    def mac(self, uc, at, *_):
        """One EMAC instruction, the same arithmetic for both builds (fractional products, a wide accumulator)."""
        n, op, args = self.emac[at]
        reg = lambda name: getattr(self.regs, "UC_M68K_REG_" + name.strip("%@+").upper())
        signed = lambda v: v - (1 << 32) if v & 1 << 31 else v
        get = lambda name: signed(uc.reg_read(reg(name)) & 0xffffffff)
        if op == "movel":
            self.acc = get(args[0])
        elif op == "movclrl":
            uc.reg_write(reg(args[1]), self.acc & 0xffffffff)
            self.acc = 0
        else:  # macl / msacl Ry,Rx[,<ea>@+,Rw],acc0
            product = get(args[0]) * get(args[1]) >> 31
            self.acc += -product if op == "msacl" else product
            if len(args) == 5:
                address = uc.reg_read(reg(args[2]))
                uc.reg_write(reg(args[3]), struct.unpack(">I", uc.mem_read(address, 4))[0])
                uc.reg_write(reg(args[2]), address + 4)
        uc.reg_write(self.regs.UC_M68K_REG_PC, at + n)

    def call(self, name, *args, **registers):
        sp = STACK + 0x8000 - 4 * (len(args) + 1)
        self.u.mem_write(sp, struct.pack(">%dI" % (len(args) + 1), RETURN, *args))
        self.u.reg_write(self.regs.UC_M68K_REG_A7, sp)
        for register, value in registers.items():
            self.u.reg_write(getattr(self.regs, "UC_M68K_REG_" + register.upper()), value)
        self.u.emu_start(self.sym[name], RETURN, count=200000)
        return self.u.reg_read(self.regs.UC_M68K_REG_D0)

    def seen(self):
        return b"".join(bytes(self.u.mem_read(at, n)) for at, n in WATCH)

    def frame(self, ping, start=None, glide=0):
        """One audio frame of track T: the copier's record, the frame's masks, the START, the two render calls."""
        u, s = self.u, self.sym
        u.mem_write(REC, struct.pack(">6H", 0x4000, 16 << 8, 40 << 8, 0x4000, 0, 40 << 8))  # PTCH, STRT, LEN, RATE, RTRG, RTIM
        u.mem_write(s["PING_AT"], struct.pack(">I", ping))
        u.mem_write(s["GLIDE_AT"], bytes([glide]))
        u.mem_write(s["NIBBLE"], bytes(0x10 | start if t == T and start is not None else 0 for t in range(8)))
        out, used = [], self.count
        self.call("fm_frame")
        if start is not None:
            self.call("fm_start", T)
        for first, last in ((0, start or 0), (start or 0, 16)):
            u.mem_write(s["CURSOR"], struct.pack(">I", BUF))
            u.mem_write(BUF, bytes(0x400))
            out.append((self.call("sy_render", T, ping, first, last), self.seen()))
        u.mem_write(s["NIBBLE"], bytes(8))
        return out, self.count - used

    def kill(self):  # the stock voice kill (STOP, a pattern change) reaching po_kill: d1 the track
        self.call("po_kill", d1=T, a0=0, a1=BUF)

    def release(self):  # po_rel's effect: the voice is released
        at = self.sym["sy_state"] + 128 * T + self.sym["S_ON"]
        self.u.mem_write(at, bytes([self.u.mem_read(at, 1)[0] | 2]))

    def state(self):
        return bytes(self.u.mem_read(self.sym["sy_state"] + 128 * T, 128))


@unittest.skipUnless(importlib.util.find_spec("unicorn") and all(
    shutil.which("m68k-elf-" + name) for name in ("as", "ld", "nm", "objcopy")
), "needs Unicorn and the ColdFire toolchain")
class Silence(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.new, cls.full = build([]), build(["--defsym", "FM_NO_SILENT=1"])

    def run_both(self, script):
        """Each step on both builds: every call's return and everything the DSP and stock read must match."""
        machines, costs = [Machine(*self.new), Machine(*self.full)], {}
        for at, (what, *args) in enumerate(script):
            if what in ("release", "kill"):
                for m in machines:
                    getattr(m, what)()
                continue
            (a, ca), (b, cb) = (m.frame(*args) for m in machines)
            self.assertEqual(a, b, "step %d %s" % (at, what))
            costs.setdefault(what, []).append((ca, cb))
        return machines, costs

    def test_silent_notes_and_silence_again(self):
        script = ([("frame", p & 1) for p in range(12)]                             # no trig yet
                  + [("frame", 0, 5)] + [("frame", p & 1) for p in range(40)]        # a note
                  + [("release",)] + [("frame", p & 1) for p in range(300)]          # released, then silent
                  + [("frame", 1, 9)] + [("frame", p & 1) for p in range(40)]        # the next note
                  + [("frame", 0, 0)] + [("frame", p & 1) for p in range(20)]        # a retrigger
                  + [("kill",)] + [("frame", p & 1) for p in range(30)]              # STOP: no voice of ours
                  + [("frame", 0, 7)] + [("frame", p & 1) for p in range(30)])       # and a note after it
        machines, _ = self.run_both(script)
        self.assertEqual(machines[0].state(), machines[1].state())  # the notes left the engine in the same state

    def test_glide_on_takes_the_full_path(self):
        script = [("frame", p & 1, None, 90) for p in range(8)] + [("frame", 0, 3, 90)] + [
            ("frame", p & 1, None, 90) for p in range(20)]
        self.run_both(script)

    def test_instruction_counts(self):
        counts = {}
        for name, built in (("0.1.5", self.new), ("full path", self.full)):
            m = Machine(*built)
            never = [m.frame(p & 1)[1] for p in range(4)]
            m.frame(0, 5)
            sounding = [m.frame(p & 1)[1] for p in range(4)]
            m.release()
            for p in range(300):
                m.frame(p & 1)
            released = [m.frame(p & 1)[1] for p in range(4)]
            m.kill()
            killed = [m.frame(p & 1)[1] for p in range(4)]
            counts[name] = dict(never=max(never), sounding=max(sounding), released=max(released), killed=max(killed))
        print("\nmodule instructions a frame for one FM track (fm_frame and two sy_render calls; stock calls stubbed):", counts)
        new, full = counts["0.1.5"], counts["full path"]
        self.assertEqual(new["never"], full["never"])  # an FM track before its first START: unchanged
        self.assertLessEqual(new["sounding"], full["sounding"] + 10)  # a sounding note: the full path and two tests
        self.assertLess(new["killed"] + 60, full["killed"])
        self.assertLess(new["released"] * 2, full["released"])


if __name__ == "__main__":
    unittest.main()
