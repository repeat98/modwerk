"""Check the compiled Grain wrappers against a synthetic Flex frame on a ColdFire CPU."""
import hashlib
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


def check_track(image, symbols, track, ping, pool=None, audition=False):
    cpu = Uc(UC_ARCH_M68K, UC_MODE_BIG_ENDIAN)
    cpu.ctl_set_cpu_model(m68k_const.UC_CPU_M68K_CFV4E)
    for address, size in ((IMAGE, 0x10000), (0x200000, 0x10000), (0x40000000, 0xE0000),
                          (0x80000000, 0x10000), (0x46C82000, 0x1000), (0x460E7000, 0x1000), (0x100B1000, 0x1000)):
        cpu.mem_map(address, size)
    cpu.mem_write(IMAGE, image)
    # The sample pool window and the selected track. Opening the pool changes nothing: only a START with the audition flag
    # (FUNC + YES, 0xe0 on the MKII against a sequencer trig's 0xc0) on the pool's track plays that voice as a plain Flex
    # until the next trig. A manual trig (trig key, CHROMATIC key, MIDI note) carries 0xe0 too and stays granular.
    cpu.mem_write(0x460E70E0, struct.pack(">I", 1 if pool is not None else 0))
    cpu.mem_write(0x100B14CC, bytes((pool if pool is not None else 0,)))
    plain = audition and pool == track
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
    neutral[24:30] = bytes((0, 0, 0, 0, 0, 0)) if plain else bytes((1, 0, 0, 0, 0, 0))   # plain Flex: factory LOOP, no loop

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
        third = (0xE0 if audition else 0xC0) if entry == "grain_start" else 0   # START's flags, render's first frame
        cpu.mem_write(STACK, struct.pack(">5I", RETURN, track, ping, third, 16))
        cpu.emu_start(symbols[entry], RETURN, count=20000)
        if cpu.reg_read(m68k_const.UC_M68K_REG_PC) != RETURN or cpu.mem_read(lane, 48) != frame:
            raise AssertionError(f"{entry} on T{track + 1}, ping {ping} failed to return the complete Flex frame")
    seen = cpu.mem_read(symbols["live_w"] + 12 * track, 12)
    if plain:
        if any(seen):
            raise AssertionError(f"the audition track T{track + 1} went through the engine, ping {ping}")
    elif seen != frame[:12]:
        raise AssertionError(f"the renderer read different SRC words on T{track + 1}, ping {ping}")


    if track == 0 and ping == 0 and pool is None:
        check_scan(cpu, symbols, lane, packet)


def check_scan(cpu, symbols, lane, packet):
    """Read both the displayed speed and the actual cursor after a 16-frame render."""
    def call(name, *args):
        cpu.reg_write(m68k_const.UC_M68K_REG_A7, STACK)
        cpu.mem_write(STACK, struct.pack(f">{1 + len(args)}I", RETURN, *args))
        cpu.emu_start(symbols[name], RETURN, count=50000)
        if cpu.reg_read(m68k_const.UC_M68K_REG_PC) != RETURN:
            raise AssertionError(f"{name} did not return")

    # Model one allocated Flex page containing a 1,024-frame, 24-bit stereo sample.
    descriptor, arena, page_indices, page_map = 0x46c922c4, 0x40a955e0, 0x46000000, 0x46000100
    cpu.mem_map(0x46c92000, 0x3000)
    cpu.mem_map(0x40a95000, 0x6000)
    cpu.mem_map(0x46000000, 0x1000)
    cpu.mem_write(0x800049dc, struct.pack(">I", descriptor))
    cpu.mem_write(descriptor, struct.pack(">6I", 1, 0, 0, 0, 1024, 1))
    cpu.mem_write(0x46c920a4, struct.pack(">I", 1))
    cpu.mem_write(0x40096f82, struct.pack(">I", 14601))
    cpu.mem_write(0x4000045e, struct.pack(">I", arena))
    cpu.mem_write(0x80006914, struct.pack(">2I", page_map, page_indices))
    cpu.mem_write(page_map, struct.pack(">H", 1))
    cpu.mem_write(arena + 6144, bytes.fromhex("1000552000aa") * 1024)
    display = 0x204000
    for value in range(256):
        steps = 0 if value > 127 else 64 if value == 127 else value - 64
        hundredths = abs(steps) * 100 // 32
        sign = "-" if steps < 0 else "+" if steps > 0 else " "
        expected = f"{sign}{hundredths // 100}.{hundredths % 100:02}"
        call("scan_text", display, value)
        label = bytes(cpu.mem_read(display, 6)).split(b"\0", 1)[0].decode("ascii")
        if label != expected:
            raise AssertionError(f"SCAN {value} displayed {label!r}, expected {expected!r}")

        cpu.mem_write(lane + 10, struct.pack(">H", value << 8))
        cpu.mem_write(CURSOR, struct.pack(">I", packet))
        call("grain_start", 0, 0, 0)
        call("grain_render", 0, 0, 0, 16)
        # T1 GranTrack.scan and scanf are the whole-frame and Q16 fractional cursors.
        whole, fraction = struct.unpack(">2I", cpu.mem_read(symbols["eng"] + 228, 8))
        expected_cursor = (steps * 16 * 2048) % (1024 << 16)
        if (whole << 16) + fraction != expected_cursor:
            raise AssertionError(f"SCAN {value} advanced to {whole}+{fraction}/65536, expected Q16 {expected_cursor}")

    # 0.1.3: PTCH in Flex's units, 60 an octave (CHROMATIC and MIDI notes lock it so): the step prepare_frame keeps for T1
    # (Prepared: 12 bytes of GranParams, three words, then whole and frac) and the label.
    for value, label in ((4, "-12"), (44, "-4"), (59, "-1"), (63, "-0.2"), (64, "0"), (69, "+1"), (124, "+12"), (127, "+12.6")):
        cpu.mem_write(lane, struct.pack(">H", value << 8))
        cpu.mem_write(CURSOR, struct.pack(">I", packet))
        call("grain_start", 0, 0, 0)
        call("grain_render", 0, 0, 0, 16)
        whole, frac = struct.unpack(">iI", cpu.mem_read(symbols["prepared"] + 24, 8))
        if abs(whole + frac / 2 ** 32 - 2 ** ((value - 64) / 60)) > 1e-5:
            raise AssertionError(f"PTCH {value} stepped {whole}+{frac:#x}, expected 2^({value - 64}/60)")
        call("ptch_text", display, value)
        shown = bytes(cpu.mem_read(display, 8)).split(b"\0", 1)[0].decode("ascii")
        if shown != label:
            raise AssertionError(f"PTCH {value} displayed {shown!r}, expected {label!r}")
    cpu.mem_write(lane, struct.pack(">H", 0x4000))

    # The track recorders use eight independent rows of 14,602 physical page numbers.
    # Ordinary slot zero above and the recorder rows below point to the same test PCM.
    recorder_map = 0x46010000
    total = 14602
    cpu.mem_map(recorder_map, 0x48000)
    cpu.mem_write(0x80006914, struct.pack(">I", recorder_map))
    ctx, first, length = display + 32, display + 64, display + 68

    def locate(slot, start, frame, physical):
        cpu.mem_write(descriptor + 44 * slot, struct.pack(">6I", 1, 0, 0, 0, 37800, 1))
        cpu.mem_write(0x46c920a4 + 4 * slot, struct.pack(">I", 1))
        cpu.mem_write(page_indices + slot * 4, struct.pack(">I", start))
        if physical is not None:
            cpu.mem_write(recorder_map + 2 * (start + frame // 1024), struct.pack(">H", physical))
        call("open_sample", slot, display + 100, ctx)
        if not cpu.reg_read(m68k_const.UC_M68K_REG_D0):
            return 0
        call("flex_page", ctx, frame, first, length)
        return cpu.reg_read(m68k_const.UC_M68K_REG_D0)

    for recorder in range(8):
        slot = 128 + recorder
        start = (recorder + 2) * total
        for frame in (0, 1024, 2001):
            assert locate(slot, start, frame, total) == arena + total * 6144
            assert struct.unpack(">2I", cpu.mem_read(first, 8)) == (frame & ~1023, 1024)
        assert locate(slot, start, 0, 0) == 0
        assert locate(slot, start, 0, total + 1) == 0
        assert locate(slot, start + 1, 0, None) == 0
        assert locate(slot, start, total * 1024, None) == 0
    assert locate(0, 2, 0, 1) == arena + 6144
    assert locate(0, total + 1, 0, None) == 0

    # Two 24-bit stereo takes in R3. Keep the slot, descriptor and track running
    # while Flex remaps its first page between callbacks.
    slot = 130
    row = (slot - 126) * total
    cpu.mem_write(0x800049dc, struct.pack(">I", descriptor + 44 * slot))
    cpu.mem_write(page_indices + slot * 4, struct.pack(">I", row))
    cpu.mem_write(descriptor + 44 * slot, struct.pack(">6I", 1, 0, 0, 0, 1024, 1))
    cpu.mem_write(0x46c920a4 + 4 * slot, struct.pack(">I", 1))
    cpu.mem_write(lane, struct.pack(">6H", 0x4000, 0, 0x7f00, 0x4000, 0, 0x4000))
    cpu.mem_write(lane + 24, bytes((3, 0, 0, 0, 0, 0)))
    cpu.mem_write(symbols["eng"], bytes(6 * 32))  # previous SCAN tests leave six voices running
    for physical, frame in ((1, "400077300055"), (2, "c00088d000aa")):
        cpu.mem_write(recorder_map + 2 * row, struct.pack(">H", physical))
        cpu.mem_write(arena + physical * 6144, bytes.fromhex(frame) * 1024)
        cpu.mem_write(CURSOR, struct.pack(">I", packet))
        call("grain_start", 0, slot, 0)
        call("grain_render", 0, 0, 0, 16)
        page, = struct.unpack(">I", cpu.mem_read(symbols["eng"] + 6 * 32, 4))
        assert page == arena + physical * 6144, "R3 reused the previous take's Flex page"
        pcm = struct.unpack(">32i", cpu.mem_read(packet + 16, 128))
        assert any(pcm) and (min(pcm) >= 0 if physical == 1 else max(pcm) <= 0), pcm

    # A new recording in the same slot can be busy, then change format and
    # length. The previous take's validated geometry cannot stand in for it.
    recorder_state = 0x80004f1e + 84 * (slot - 128)
    cpu.mem_write(recorder_state, b"\x01")
    cpu.mem_write(CURSOR, struct.pack(">I", packet))
    call("grain_render", 0, 0, 0, 16)
    assert cpu.mem_read(packet + 16, 128) == bytes(128), "active recorder must be silent"
    cpu.mem_write(recorder_state, b"\x00")
    cpu.mem_write(descriptor + 44 * slot, struct.pack(">6I", 3, 0, 0, 0, 960, 2))
    cpu.mem_write(0x46c920a4 + 4 * slot, struct.pack(">I", 2))
    cpu.mem_write(arena + 2 * 6144, bytes.fromhex("30005000") * 960)
    cpu.mem_write(CURSOR, struct.pack(">I", packet))
    call("grain_start", 0, slot, 0)
    call("grain_render", 0, 0, 0, 16)
    assert cpu.mem_read(symbols["smp"], 6) == struct.pack(">IBB", 960, 2, 2)
    assert max(struct.unpack(">32i", cpu.mem_read(packet + 16, 128))) > 0


def check_ptch(image, symbols):
    """PTCH's knob step (0.1.3, Flex's units, 5 a semitone): one semitone a detent on the 64 + 5n grid; FUNC jumps between
    -12, 0 and +12 (4, 64, 124); a pressed knob moves 7 semitones."""
    cpu = Uc(UC_ARCH_M68K, UC_MODE_BIG_ENDIAN)
    cpu.ctl_set_cpu_model(m68k_const.UC_CPU_M68K_CFV4E)
    for at, size in ((IMAGE, 0x10000), (0x200000, 0x10000), (0x46C7D8EE & ~0xFFF, 0x1000)):
        cpu.mem_map(at, size)
    cpu.mem_write(IMAGE, image)
    func_key, knob_key = 0x46C7D8EE + 24 * 0x2D, 0x46C7D8EE + 24 * 56

    def step(detents, value, func=False, pressed=False):
        cpu.mem_write(func_key, struct.pack(">I", 1 if func else 0))
        cpu.mem_write(knob_key, struct.pack(">I", 1 if pressed else 0))
        cpu.reg_write(m68k_const.UC_M68K_REG_A7, STACK)
        cpu.mem_write(STACK, struct.pack(">4I", RETURN, 0, detents & 0xFFFFFFFF, value))
        cpu.emu_start(symbols["ptch_step"], RETURN, count=2000)
        result = cpu.reg_read(m68k_const.UC_M68K_REG_D0) & 0xFFFFFFFF
        return result - (1 << 32) if result & 0x80000000 else result

    cases = [((1, 64), 69), ((-1, 64), 59), ((3, 64), 79), ((-30, 64), 4), ((1, 124), 124), ((-1, 4), 4),
             ((1, 66), 69), ((-1, 62), 59), ((1, 67), 74),   # off the grid (an older Grain's value): to the next semitone
             ((1, 65, True), 124), ((-1, 65, True), 64), ((1, 63, True), 64), ((1, 64, True), 124), ((-1, 64, True), 4),
             ((-1, 124, True), 64), ((1, 124, True), 124), ((-1, 4, True), 4), ((1, 4, True), 64),
             ((1, 64, False, True), 99), ((-1, 9, False, True), 4)]
    for args, want in cases:
        got = step(*args)
        if got != want:
            raise AssertionError(f"PTCH step {args} gave {got}, expected {want}")


def check_assign(image, symbols):
    """Count stock calls and check both Part copies across a machine change."""
    cpu = Uc(UC_ARCH_M68K, UC_MODE_BIG_ENDIAN)
    cpu.ctl_set_cpu_model(m68k_const.UC_CPU_M68K_CFV4E)
    bank, mirror, apply_track, src_writer = 0x46000000, 0x100a4ece, 0x40001f18, 0x40054cd8
    for at, size in ((IMAGE, 0x10000), (0x200000, 0x10000), (0x40000000, 0xe0000),
                     (0x100a4000, 0xe000), (0x80000000, 0x10000), (bank, 0xa0000), (0x46c82000, 0x1000),
                     (0x460e7000, 0x1000)):   # the pool window word grain_ui_tick reads
        cpu.mem_map(at, size)
    cpu.mem_write(IMAGE, image)
    cpu.mem_write(0x46c82456, struct.pack(">I", bank))
    cpu.mem_write(0x100b14ce, bytes((7, 2)))  # Bank H, Part 3
    stock = bytes((64, 0, 0, 127, 0, 79, 1, 0, 0, 0, 0, 64))
    cpu.mem_write(0x400d320c, stock)
    calls = []

    def watch(machine, address, size, unused):
        sp = machine.reg_read(m68k_const.UC_M68K_REG_A7)
        calls.append((address, *struct.unpack(">3I", machine.mem_read(sp + 4, 12))))

    for address in (apply_track, src_writer):
        cpu.mem_write(address, bytes.fromhex("4e75"))
        cpu.hook_add(UC_HOOK_CODE, watch, begin=address, end=address)
    cpu.reg_write(m68k_const.UC_M68K_REG_SR, 0x2700)

    def call(name, *args):
        cpu.mem_write(STACK, struct.pack(f">{len(args) + 1}I", RETURN, *args))
        cpu.reg_write(m68k_const.UC_M68K_REG_A7, STACK)
        cpu.emu_start(symbols[name], RETURN, count=20000)
        assert cpu.reg_read(m68k_const.UC_M68K_REG_PC) == RETURN
        return cpu.reg_read(m68k_const.UC_M68K_REG_D0)

    def lanes(part, track):
        at = part + 30 * track
        return bytes(cpu.mem_read(at + 0x30, 6) + cpu.mem_read(at + 0x1e0, 6))

    part = bank + 0x8ed80 + 2 * 6322
    for t in (0, 4):
        cpu.mem_write(part + 0x22 + t, b"\x01")
        assert call("grain_admit", part, t) == 1
        defaults = bytes(cpu.mem_read(symbols["defaults"], 12))
        assert call("grain_assign", part, t, 1) == 1
        assert calls == [(apply_track, 7, 2, t)]
        assert call("grain_assign", part, t, 1) == 1
        for copy in (part, mirror + 2 * 6322):
            assert lanes(copy, t) == defaults
            assert cpu.mem_read(copy + 60 + 30*t, 3) == b"GR\x01"
        assert call("grain_assign", part, t, 0) == 1
        call("grain_ui_tick")
        for copy in (part, mirror + 2 * 6322):
            assert lanes(copy, t) == stock and cpu.mem_read(copy + 60 + 30*t, 5) == bytes(5)
        assert calls == [(apply_track, 7, 2, t)]
        calls.clear()
    # Stock also refreshes when the stored machine type changes. An inactive
    # Part must never update the currently sounding track on a later UI tick.
    for address, kind in ((part, 2), (part - 6322, 1)):
        cpu.mem_write(address + 0x22, bytes([kind]))
        assert call("grain_assign", address, 0, 1) == 1
        for _ in range(3):
            call("grain_ui_tick")
        assert not calls


def check_stereo(image, symbols):
    """Exercise the packed big-endian read and ADDX carry in the shipped instructions."""
    engine, params, sample, output, storage = 0x200000, 0x202000, 0x202040, 0x203000, 0x300000
    pcm = bytes((i * 59 + (i >> 3) * 97) & 255 for i in range(614400))
    # SHA-256 of 16 output frames and the six GranGrain structs. Alternate forward and reverse voices.
    # 0.1.2: regenerated for the window tables 3 dB lower (gen_tables.py); the instructions are unchanged, and the
    # previous hashes (draft package 329b40ef) still pass with the previous tables.
    cases = [
        (2, 0, True, "5b1609ec0a954c56f0e988f2658c65667171b4546fa4f8055cd0748b536c7314"),
        (2, 0x1f59ac3a, True, "3c010356fd141176b9a7436066c827248547d4c0c23ad0439d3ebdbe705ebfa2"),
        (2, 0x1f59ac3a, False, "c87dd1ec362717d95f765e60b3e4e2cfb7baff35833544e6ecff3d393d750ba1"),
        (3, 0x067ab234, True, "f245e88277f869ccebf775b0f54e24fbc2bbab9ed9d9a263068a21ce22074859"),
    ]
    for width, fraction, panned, expected in cases:
        cpu = Uc(UC_ARCH_M68K, UC_MODE_BIG_ENDIAN)
        cpu.ctl_set_cpu_model(m68k_const.UC_CPU_M68K_CFV4E)
        for address, size in ((IMAGE, 0x10000), (engine, 0x10000), (storage, 0xa0000)):
            cpu.mem_map(address, size)
        cpu.mem_write(IMAGE, image)
        cpu.mem_write(storage, pcm)
        for voice in range(6):
            reverse = voice % 2
            pan = (9817 + 3001 * voice) * (-1 if reverse else 1) if panned else 0
            grain = struct.pack(">7Ii", 200 + 6000 * voice, 0x1f11ab20, 1200, 0x041234, 0x265, 0, reverse, pan)
            cpu.mem_write(engine + voice * len(grain), grain)
        cpu.mem_write(params, bytes((60, 127, 127, 127, 2, 12, 127, 1, 0, 1, 0, 0)))
        cpu.mem_write(sample, struct.pack(">IBBII", len(pcm) // (width * 2), width, 2, 0, storage))
        initial = bytes(cpu.mem_read(engine, 250))
        for lengths in ((16,), (1, 15), (2, 14), (3, 13)):
            cpu.mem_write(engine, initial)
            cpu.mem_write(output, b"\xa5" * (17 * 8))
            written = 0
            for length in lengths:
                cpu.mem_write(STACK, struct.pack(">9I", RETURN, engine, 0, params, sample, 1, fraction,
                                                 output + written * 8, length))
                cpu.reg_write(m68k_const.UC_M68K_REG_SR, 0x2700)
                cpu.reg_write(m68k_const.UC_M68K_REG_A7, STACK)
                cpu.emu_start(symbols["gran_render"], RETURN, count=50000)
                assert cpu.reg_read(m68k_const.UC_M68K_REG_PC) == RETURN
                written += length
                assert cpu.mem_read(output + written * 8, 8) == b"\xa5" * 8, "wrote past the stereo span"
            rendered = cpu.mem_read(output, 16 * 8) + cpu.mem_read(engine, 6 * 32)
            if hashlib.sha256(rendered).hexdigest() != expected:
                raise AssertionError(f"stereo render changed for {width} bytes, {fraction:#x}, pan {panned}, spans {lengths}")


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
        # Pool open on T5 or on T1: all eight tracks stay granular; an audition START on the pool's track plays plain Flex.
        for pool in (4, 0):
            for track in range(8):
                check_track(image, symbols, track, 0, pool)
            check_track(image, symbols, pool, 0, pool, audition=True)
            check_track(image, symbols, 7 - pool, 0, pool, audition=True)   # a MIDI note on another track: granular
        # 0.1.3: trig keys, CHROMATIC keys and MIDI notes (START 0xe0) with the pool shut play grains on every track.
        for track in range(8):
            check_track(image, symbols, track, 0, audition=True)
        check_stereo(image, symbols)
        check_assign(image, symbols)
        check_ptch(image, symbols)
    print("[PASS] Grain preserves all 48 Flex frame bytes across START and render on all eight tracks and both buffers")
    print("[PASS] With the pool open on T5 or T1 every track stays granular; only an audition START (0xe0) on the pool's track takes the plain Flex path")
    print("[PASS] Manual trigs (0xe0) with the pool shut play grains on all eight tracks")
    print("[PASS] Compiled SCAN label and cursor match on 24-bit stereo at all 128 settings and 128 legacy values")
    print("[PASS] PTCH steps 2^((v-64)/60), Flex's units, and shows semitones (-12 .. +12.6)")
    print("[PASS] Compiled 16-bit and 24-bit stereo kernels match the reference PCM and six cursors")
    print("[PASS] PTCH moves one semitone (5) a detent, FUNC + turn stops at -12, 0 and +12, a pressed knob moves 7 semitones")
    print("[PASS] T1/T5 assignment refreshes Flex once, restores both Part copies and queues no control writes on exit")
