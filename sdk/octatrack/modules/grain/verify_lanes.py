"""Check the compiled Grain wrappers against a synthetic Flex frame on a ColdFire CPU."""
import pathlib
import struct
import subprocess
import sys
import tempfile

from unicorn import Uc, UC_ARCH_M68K, UC_HOOK_CODE, UC_MODE_BIG_ENDIAN
from unicorn import m68k_const

HERE = pathlib.Path(__file__).resolve().parent
SDK = next(parent for parent in HERE.parents if (parent / "runtime/loader/build.py").is_file())
sys.path.insert(0, str(SDK / "runtime/loader"))
from build import link_units

IMAGE = 0x100000
STACK = 0x20F000
RETURN = 0x200800
FLEX_START = 0x4000F450
FLEX_RENDER = 0x40004008
CURSOR = 0x80001C80


def check_track(image, symbols, track, ping):
    cpu = Uc(UC_ARCH_M68K, UC_MODE_BIG_ENDIAN)
    cpu.ctl_set_cpu_model(m68k_const.UC_CPU_M68K_CFV4E)
    for address, size in ((IMAGE, 0x10000), (0x200000, 0x10000), (0x40000000, 0xE0000),
                          (0x80000000, 0x10000), (0x46C82000, 0x1000)):
        cpu.mem_map(address, size)
    cpu.mem_write(IMAGE, image)
    # Synthetic Flex callbacks simply return. The render callback also emits a valid 16-frame packet.
    for address in (FLEX_START, FLEX_RENDER):
        cpu.mem_write(address, bytes.fromhex("4e75"))
    lane = 0x80000510 + 48 * track + 384 * ping
    frame = bytearray(range(48))
    struct.pack_into(">6H", frame, 0, 0x4100, 0x2240, 0x4780, 0x5400, 0x7100, 0x3F00)
    frame[24:30] = bytes((3, 0, 0, 1, 5, 6))
    cpu.mem_write(lane, bytes(frame))
    cpu.mem_write(0x800062A8, struct.pack(">I", lane))
    packet = 0x80001C90 + 336 * track + 0xA80 * ping
    cpu.mem_write(CURSOR, struct.pack(">I", packet))
    cpu.mem_write(0x800049D8 + 168 * track, bytes([1]))

    neutral = frame.copy()
    struct.pack_into(">6H", neutral, 0, 0x4000, 0, 0x7F00, 0x7F00, 0, 0x4000)
    neutral[24:30] = bytes((1, 0, 0, 0, 0, 0))

    def flex_callback(uc, address, size, data):
        if uc.mem_read(lane, 48) != neutral:
            raise AssertionError(f"Flex received unexpected controls on T{track + 1}, ping {ping}")
        if address == FLEX_RENDER:
            uc.mem_write(packet, struct.pack(">I", 0x110))
            uc.mem_write(CURSOR, struct.pack(">I", packet + 16 + 16 * 8))

    for address in (FLEX_START, FLEX_RENDER):
        cpu.hook_add(UC_HOOK_CODE, flex_callback, begin=address, end=address)
    cpu.reg_write(m68k_const.UC_M68K_REG_SR, 0x2700)
    for entry in ("grain_start", "grain_render"):
        cpu.reg_write(m68k_const.UC_M68K_REG_A7, STACK)
        cpu.mem_write(STACK, struct.pack(">5I", RETURN, track, ping, 0, 16))
        cpu.emu_start(symbols[entry], RETURN, count=20000)
        if cpu.reg_read(m68k_const.UC_M68K_REG_PC) != RETURN or cpu.mem_read(lane, 48) != frame:
            raise AssertionError(f"{entry} on T{track + 1}, ping {ping} failed to return the complete Flex frame")
    if cpu.mem_read(symbols["live_w"] + 12 * track, 12) != frame[:12]:
        raise AssertionError(f"the renderer read different SRC words on T{track + 1}, ping {ping}")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as directory:
        work = pathlib.Path(directory)
        obj = work / "grain.o"
        subprocess.run(["m68k-elf-as", "-mcpu=54455", "--defsym", "MODWERK_EVENTS=1",
                        str(HERE / "grain_core.s"), "-o", str(obj)], check=True)
        image, symbols, _, _ = link_units([obj], "m68k-elf-", IMAGE, work, anywhere=True)
        for track in range(8):
            for ping in range(2):
                check_track(image, symbols, track, ping)
    print("[PASS] Grain preserves all 48 Flex frame bytes across START and render on all eight tracks and both buffers")
