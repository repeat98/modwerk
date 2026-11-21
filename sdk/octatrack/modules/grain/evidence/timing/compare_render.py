"""Compare two Grain assembly builds in the saved six-voice ColdFire timing fixture.

Pass the previous and candidate grain_core.s paths. The count includes the synthetic
page lookup called from gran_render. It excludes fixture setup and stock/USB work.
"""
import argparse
from bisect import bisect_left
import json
from pathlib import Path
import re
import struct
import subprocess
import tempfile

from unicorn import Uc, UC_ARCH_M68K, UC_HOOK_BLOCK, UC_MODE_BIG_ENDIAN
from unicorn import m68k_const as reg
from build_probe import HERE, GRAIN, build, m68k_codegen


def measure(assembly, work):
    cross = "m68k-elf-"
    grain, bench = work / "grain.o", work / "bench.o"
    subprocess.run([cross + "as", "-mcpu=54455", "--defsym", "MODWERK_EVENTS=1",
                    assembly, "-o", grain], check=True)
    subprocess.run([cross + "gcc", *build.CFLAGS, *m68k_codegen.FLAGS,
                    "-I" + str(GRAIN), "-c", HERE / "bench.c", "-o", bench], check=True)
    base, stack, stop = 0x100000, 0x20f000, 0x200800
    image, symbols, bss, _ = build.link_units([grain, bench], cross, base, work, anywhere=True)
    asm = subprocess.check_output([cross + "objdump", "-d", "--no-show-raw-insn",
                                   work / f"{base:x}.elf"], text=True)
    addresses = sorted(int(pc, 16) for pc in re.findall(r"^\s*([0-9a-f]+):\s+[a-z]", asm, re.M))
    cpu = Uc(UC_ARCH_M68K, UC_MODE_BIG_ENDIAN)
    cpu.ctl_set_cpu_model(reg.UC_CPU_M68K_CFV4E)
    cpu.mem_map(base, (len(image) + bss + 4095) & ~4095)
    cpu.mem_map(0x200000, 0x10000)
    cpu.mem_map(0xfc07c000, 0x1000)  # inert timer for the original bench
    cpu.mem_write(base, image)
    cpu.reg_write(reg.UC_M68K_REG_SR, 0x2700)
    cpu.mem_write(stack, struct.pack(">II", stop, 0x201000))
    cpu.mem_write(symbols["audio"], bytes((i * 59 + (i >> 3) * 97) & 255 for i in range(12288)))
    cpu.mem_write(symbols["page_init"], struct.pack(">I", 12288))
    return_pc = None
    instructions = 0
    branches = {}

    def count(machine, pc, size, userdata):
        nonlocal instructions, return_pc
        if pc == symbols["gran_render"]:
            sp = machine.reg_read(reg.UC_M68K_REG_A7)
            return_pc, = struct.unpack(">I", machine.mem_read(sp, 4))
        if pc == return_pc:
            return_pc = None
        if return_pc is not None:
            key = (pc, size)
            if key not in branches:
                branches[key] = bisect_left(addresses, pc + size) - bisect_left(addresses, pc)
            instructions += branches[key]

    cpu.hook_add(UC_HOOK_BLOCK, count)
    expected = json.loads((HERE / "measurements.json").read_text())["kernel"]["quiet"]
    rows = []
    for case, reference in enumerate(expected):
        instructions = 0
        cpu.reg_write(reg.UC_M68K_REG_A7, stack)
        cpu.emu_start(symbols["module_tick"], stop, count=100000)
        assert cpu.reg_read(reg.UC_M68K_REG_PC) == stop and instructions and return_pc is None
        digest, = struct.unpack(">I", cpu.mem_read(symbols["report"] + 16 + case * 20 + 16, 4))
        assert digest == reference[4], (case, hex(digest), hex(reference[4]))
        rows.append(instructions)
    return rows


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("previous", type=Path)
    parser.add_argument("candidate", type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as directory:
        rows = []
        for i, source in enumerate((args.previous, args.candidate)):
            work = Path(directory) / str(i)
            work.mkdir()
            rows.append(measure(source, work))
        for n in (16, 32):
            for crossing in (False, True):
                cases = [i for i in range(64) if (32 if i & 2 else 16) == n and bool(i & 4) == crossing]
                before, after = ([counts[i] for i in cases] for counts in rows)
                print(f"{n} frames, crossing={crossing}, {len(cases)} cases: "
                      f"mean {sum(before)/len(cases):.1f} -> {sum(after)/len(cases):.1f}, "
                      f"max {max(before)} -> {max(after)}, improved {sum(a < b for b, a in zip(before, after))}")
