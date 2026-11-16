#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""DIRECT_JUMP_KYOTI's gate: the built image against the original OS, then under the ColdFire port.

    python3 modules/direct-jump-kyoti/verify.py        (from the octabam root)

Reads, and SKIPs without them:
  - the image: out/mainos_bus.bin built with DIRECT_JUMP_KYOTI (DJ_IMAGE overrides);
  - the original OS 1.40C MAIN image: out/raw/section_3_MAIN_OS.bin (DJ_STOCK overrides);
  - the port: out/emu/ot_emu (`make emu-cf`; OT_EMU overrides). Without it only part 1 runs.
Needs m68k-elf-as/ld/nm on PATH: the unit is assembled here for its symbol offsets.

1. The image (no emulator): the original OS matches the manifest's three guards and the [PTN]-layer YES
   slot is NULL; the image holds a jsr at the landing and MIDI START sites and a jmp at the [PTN] release,
   each onto the unit's own symbol, and the slot names dj_toggle. After boot, the unit in DRAM is the
   bytes the manifest's reference names.
2. The toggle, by the keys (MKII panel, empty card), on this image and on the original OS: OFF after boot;
   [PTN] + [YES] turns it ON with a toast, and releasing [PTN] closes the toast and leaves the pattern
   chooser shut; again turns it OFF; [YES] alone (stock's own toast) leaves it OFF. The original OS opens no
   toast for [PTN] + [YES] and opens the chooser on the release.
3. OFF is stock: a pattern cued at master step 7 lands at the pattern end, and the whole sequencer state
   (per-track step, previous step, ticks, armed, countdown, reload, scale; master step, tick, scale, the
   first-fire and hold masks, the metronome) runs through the same sequence of values as on the original OS.
4. ON, for three incoming patterns (16 steps; 7 steps on Part 2; PER TRACK with differing track lengths and
   scales; edited in RAM, and the reference run checked to play the edit): the jump lands within the landing
   window, and from the next tick on every tick's sequencer state is the state of a reference run in which
   the incoming pattern played since START. With Part 2 the active Part follows. With MIDI transport send
   on, the landing reaches stock's MIDI START gate in the landing path and the START send after it does not
   run.
5. A power cycle of the port (battery RAM of a run left ON, booted again) comes up OFF.
6. The author's MIDI Plays-Free fix, on this image and on the original OS: pattern A01 in PER TRACK mode, MIDI
   track 1 (16 steps at 1x by default) Plays Free with trig quantize DIRECT, started while playing by stock's
   manual-trig dispatcher in MIDI mode. The original OS seeds its scale from the audio-stride byte (0xff in an
   empty project) and the track stays on its first step; the image seeds 1x and the track steps on. Audio track 1
   at 2x, started the same way, seeds the same scale and plays the same steps on both (the fix redoes stock's
   bytes for audio tracks).
What it cannot see: a real unit's timing, audio, external MIDI gear, the arranger and chains, an MKI panel.
"""
import ast
import hashlib
import importlib.util
import os
import pathlib
import subprocess
import sys
import tempfile
import time

HERE = pathlib.Path(__file__).absolute().parent
ROOT = next((root for root in (pathlib.Path.cwd(), HERE.parents[1]) if (root / "tools/emu").is_dir()), None)
if ROOT is None:
    sys.exit("direct-jump-kyoti: run from an octabam root (one with tools/emu); nothing was checked")
EMU = pathlib.Path(os.environ.get("OT_EMU", ROOT / "out/emu/ot_emu"))
IMAGE = pathlib.Path(os.environ.get("DJ_IMAGE", ROOT / "out/mainos_bus.bin"))
STOCK = pathlib.Path(os.environ.get("DJ_STOCK", ROOT / "out/raw/section_3_MAIN_OS.bin"))
BASE = 0x40000400
KEYS = {"NO": 0x32, "YES": 0x31, "PLAY": 0x28, "PTN": 0x2E, **{"T%d" % (i + 1): i for i in range(16)}}
PTN_MODE, TOAST, MIDI_SEND, PART = 0x460d1742, 0x460d1e70, 0x8000002a, 0x100b14cf
ACT_PAT, M_STEP = 0x800065be, 0x800065b2
# The author's reference-lock vector (his tools/diag_reflock.py): per-track step, step-1, ticks and armed (16 each)
# and the metronome; the master step; the master tick; per-track countdown and reload; the first-fire and hold
# masks; the master scale and per-track scales.
ENGINE = ((0x800064d0, 0x80006513), (0x800065b2, 0x800065b4), (0x800065b6, 0x800065b7), (0x800065c3, 0x800065e3),
          (0x80006624, 0x80006628), (0x8000663d, 0x8000664e))
START_SEND = 0x400a2224                   # stock's MIDI START send in the landing path, after the gate the hook replaces
PAT_BASE, PAT_STRIDE = 0x400e21e0, 0x8ed8
DISPATCH, MIDI_MODE = 0x40044584, 0x80000012   # stock's manual-trig dispatcher (track, press); the UI's MIDI mode
STEPS, SCALES = 0x800064d0, 0x8000663e    # per-track step and scale index, tracks 0-15 (in ENGINE)
FAILS = []


def check(ok, what):
    print(("  ok    " if ok else "  FAIL  ") + what)
    if not ok:
        FAILS.append(what)


def declared():
    """The manifest's sites, guards and reference, read as literals: the declaration is never imported."""
    names = {}
    for node in ast.walk(ast.parse((HERE / "manifest.py").read_text())):
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            try:
                names[node.targets[0].id] = ast.literal_eval(node.value)
            except ValueError:
                pass
        if isinstance(node, ast.Call) and getattr(node.func, "id", "") == "stock_guard":
            site = node.args[0].id if isinstance(node.args[0], ast.Name) else None
            names.setdefault("guards", {})[site] = (ast.literal_eval(node.args[1]), ast.literal_eval(node.args[2]))
    return names


def unit_symbols(address, source="patch_directjump_v7.s"):
    """The unit assembled and linked at `address` as native octabam does: (bytes, {symbol: offset})."""
    with tempfile.TemporaryDirectory(prefix="dj-gate.") as directory:
        work = pathlib.Path(directory)
        subprocess.run(["m68k-elf-as", "-mcpu=54455", str(HERE / source), "-o", str(work / "u.o")], check=True)
        subprocess.run(["m68k-elf-ld", "-e", "0", "-Ttext=%#x" % address, "-o", str(work / "u.elf"), str(work / "u.o")], check=True)
        subprocess.run(["m68k-elf-objcopy", "-O", "binary", "-j", ".text", str(work / "u.elf"), str(work / "u.bin")], check=True)
        rows = [line.split() for line in subprocess.check_output(["m68k-elf-nm", str(work / "u.elf")], text=True).splitlines()]
        return (work / "u.bin").read_bytes(), {row[2]: int(row[0], 16) - address for row in rows if len(row) == 3}


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Port:
    """ot_emu's line protocol: keys by scan row, emulated milliseconds, memory reads and writes, PC watches."""

    def __init__(self, image, work, extra=()):
        card = work / "card.img"
        if not card.exists():
            (work / "tree").mkdir()
            card.write_bytes(load("dj_card", ROOT / "tools/emu/emu_card.py").build_image(str(work / "tree"), 32))
        command = [str(EMU), "--image", str(image), "--card", str(card), "--dsp", "--frame", "--ms", "3000",
                   "--interactive", "--main-level", "off", "--rtc", "host", "--mkii", *extra]
        env = {key: value for key, value in os.environ.items() if not key.startswith("OT_")}
        self.port = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, cwd=work, env=env)
        self.pending, self.rows = b"", [0] * 8
        self.reply(("ready ",))
        for _ in range(3):
            self.tap("NO")                                       # the empty card's prompts
        self.send("run 1500")

    def reply(self, prefixes, timeout=180):
        deadline = time.monotonic() + timeout
        while True:
            while b"\n" in self.pending:
                line, self.pending = self.pending.split(b"\n", 1)
                if line.decode("latin-1").startswith(prefixes):
                    return line.decode("latin-1")
            if time.monotonic() > deadline or self.port.poll() is not None:
                raise RuntimeError("the port stopped answering")
            self.pending += os.read(self.port.stdout.fileno(), 65536)

    def send(self, line):
        self.port.stdin.write((line + "\n").encode())
        self.port.stdin.flush()
        answer = self.reply(("ok", "err", "peek ", "hits "))
        if answer.startswith("err"):
            raise RuntimeError(line + ": " + answer)
        return answer

    def key(self, name, down, ms=120):
        code = KEYS[name]
        self.rows[code >> 3] = self.rows[code >> 3] | 1 << (code & 7) if down else self.rows[code >> 3] & ~(1 << (code & 7))
        self.send("key %d %d" % (0x20 | code >> 3, self.rows[code >> 3]))
        self.send("run %d" % ms)

    def tap(self, name, ms=120):
        self.key(name, True, ms)
        self.key(name, False, ms)

    def mem(self, address, length):
        return bytes.fromhex(self.send("peek %d %d" % (address, length))[5:])

    def int(self, address, length=4):
        return int.from_bytes(self.mem(address, length), "big")

    def poke(self, address, data):
        self.send("poke %d %s" % (address, data.hex()))

    def hits(self):
        return int(self.send("hits").split()[1][2:])

    def battery(self):
        return b"".join(self.mem(0x10000000 + at, 4096) for at in range(0, 0x100000, 4096))

    def close(self):
        try:
            self.send("quit")
            self.port.wait(timeout=10)
        except Exception:
            self.port.kill()


def toggle(port):
    port.key("PTN", True)
    port.tap("YES")
    port.key("PTN", False)
    port.send("run 1200")                                       # past the toast


def pattern(port, index, ms=120):
    """[PTN] + trig key: select (stopped) or cue (playing) pattern `index` of the bank."""
    port.key("PTN", True, ms)
    port.tap("T%d" % (index + 1), ms)
    port.key("PTN", False, ms)


def engine(port):
    """The sequencer state the author's reference-lock oracle compares, as one byte string."""
    return b"".join(port.mem(a, b - a) for a, b in ENGINE)


def shape(port, index, part=0, length=None, tracks=()):
    """Edit pattern `index` of bank A in RAM: its Part, a NORMAL length, or PER TRACK mode with (track, length, scale)."""
    blob = PAT_BASE + index * PAT_STRIDE
    port.poke(blob + 0x8e57, bytes([part]))
    if length is not None:
        port.poke(blob + 0x8e53, bytes([length]))
    if tracks:
        port.poke(blob + 0x8e55, b"\x01")                       # PER TRACK
        port.poke(blob + 0x8e50, (16).to_bytes(2, "big") + b"\x02")   # master length 16, master scale 1x
        for track, steps, scale in tracks:
            record = blob + (0x50 + track * 0x91a if track < 8 else 0x48f8 + (track - 8) * 0x8b0)
            port.poke(record, bytes([steps, scale]))


def trace(port, clock, until, cue=None, slice_ms=4):
    """Run to tick `until` of the unit's tick counter: {tick: (active pattern, engine state at that tick's end)}.
    `cue` = (tick, pattern) cues that pattern once the counter reaches the tick."""
    seen = {}
    while True:
        port.send("run %d" % slice_ms)
        tick = port.int(clock)
        seen[tick] = (port.int(ACT_PAT, 1), engine(port))
        if cue and tick >= cue[0]:
            pattern(port, cue[1], 2)
            cue = None
        if tick >= until:
            return seen


def changes(port, count, cue_step, index, slice_ms=4):
    """Without the unit's counter (the original OS too): the sequence of distinct (pattern, state) values from
    [PLAY], cueing pattern `index` once the master step reads `cue_step`."""
    rows, cued = [], False
    while len(rows) < count:
        port.send("run %d" % slice_ms)
        row = (port.int(ACT_PAT, 1), engine(port))
        if not rows or rows[-1] != row:
            rows.append(row)
        if not cued and port.int(M_STEP, 2) == cue_step:
            pattern(port, index, 2)
            cued = True
    return rows


def part_toggle(image, module, symbols):
    with tempfile.TemporaryDirectory(prefix="dj-gate.") as directory:
        port, who = Port(image, pathlib.Path(directory)), "module" if module else "original OS"
        try:
            unit = port.int(0x400bf0c0)
            if module:
                mode = unit + symbols["DJ_MODE"]
                check(port.int(mode) == 0, "module: OFF after boot")
                port.send("watch %d" % (unit + symbols["dj_ptnrel"]))
            port.tap("YES")
            port.send("run 1500")                               # past stock's own toast for [YES]
            if module:
                check(port.int(mode) == 0, "module: [YES] alone leaves it OFF")
            port.key("PTN", True)
            port.tap("YES")
            if module:
                check(port.int(mode) == 1 and port.int(TOAST) != 0, "module: [PTN] + [YES] turns it ON and opens the toast")
            else:
                check(port.int(TOAST) == 0, "original OS: [PTN] + [YES] opens no toast")
            port.key("PTN", False)
            port.send("run 300")
            if module:
                check(port.hits() > 0 and port.int(TOAST) == 0 and port.int(PTN_MODE) == 0, "module: releasing [PTN] closes the toast and leaves the chooser shut")
                toggle(port)
                check(port.int(mode) == 0, "module: [PTN] + [YES] again turns it OFF")
                toggle(port)
                check(port.int(mode) == 1, "module: and ON again, for the power cycle")
                return port.battery()
            check(port.int(PTN_MODE) == 2, "original OS: releasing [PTN] opens the pattern chooser")
        finally:
            port.close()


def part_off(image, module):
    with tempfile.TemporaryDirectory(prefix="dj-gate.") as directory:
        port = Port(image, pathlib.Path(directory))
        try:
            port.tap("PLAY")
            return changes(port, 260, 7, 1)
        finally:
            port.close()


def part_on(image, symbols, name, part=0, length=None, tracks=(), window=6, midi=False):
    """The jump against its reference: the incoming pattern B (index 1) played since START."""
    runs = {}
    for jump in (False, True):
        with tempfile.TemporaryDirectory(prefix="dj-gate.") as directory:
            port = Port(image, pathlib.Path(directory))
            try:
                unit = port.int(0x400bf0c0)
                clock = unit + symbols["dj_T"]
                shape(port, 1, part, length, tracks)
                if jump:
                    toggle(port)
                    if midi:
                        port.poke(MIDI_SEND, b"\x01")
                        port.send("watch %d,%d" % (unit + symbols["dj_nofa"], START_SEND))
                else:
                    pattern(port, 1)                             # B from START
                port.tap("PLAY")
                runs[jump] = trace(port, clock, 300, (41, 1) if jump else None)
                if jump:
                    if midi:
                        pcs = [int(record.split(":")[1], 16) for record in port.send("hits").split()[2:]]
                        check(pcs.count(unit + symbols["dj_nofa"]) > 0 and START_SEND not in pcs,
                              name + ": with MIDI transport send on, the jump reaches stock's MIDI START gate and does not send START")
                    if part:
                        check(port.int(PART, 1) == part, name + ": the active Part follows the incoming pattern (Part %d)" % (part + 1))
            finally:
                port.close()
    reference, run = runs[False], runs[True]
    master = ENGINE[0][1] - ENGINE[0][0]
    steps = {track: max(state[track] for _, state in reference.values()) + 1 for track in range(16)}
    longest = max(int.from_bytes(state[master:master + 2], "big") for _, state in reference.values()) + 1
    check(all(steps[track] == count for track, count, _ in tracks) and longest == (length or 16),
          name + ": the reference run plays the edited pattern (master %d steps%s)" % (
              longest, "".join(", T%d %d" % (track + 1, steps[track]) for track, _, _ in tracks)))
    landed = min((t for t, (act, _) in run.items() if act == 1), default=None)
    check(landed is not None and 41 <= landed <= 41 + window, name + ": cued at tick 41, landed at tick %s (window %d)" % (landed, window))
    if landed is None:
        return
    common = [t for t in sorted(run) if landed < t <= 300 and t in reference]
    wrong = [t for t in common if run[t] != reference[t]]
    check(len(common) > 200 and not wrong, name + ": %d ticks after the landing equal the reference run%s" % (
        len(common), "" if not wrong else ", first difference at tick %d" % wrong[0]))


def power_cycle(image, battery, symbols):
    with tempfile.TemporaryDirectory(prefix="dj-gate.") as directory:
        work = pathlib.Path(directory)
        (work / "cs1.bin").write_bytes(battery)
        port = Port(image, work, ("--cs1-in", str(work / "cs1.bin")))
        try:
            check(port.int(port.int(0x400bf0c0) + symbols["DJ_MODE"]) == 0, "module: after a power cycle of the port (battery RAM kept) it is OFF")
        finally:
            port.close()


def plays_free(image, track, scale=None):
    """A01 in PER TRACK, `track` (8+ is MIDI) Plays Free + DIRECT (and at `scale`), started by the dispatcher while
    playing: (its seeded scale byte, its step every 40 ms for a second)."""
    record = PAT_BASE + (0x50 + track * 0x91a if track < 8 else 0x48f8 + (track - 8) * 0x8b0)
    with tempfile.TemporaryDirectory(prefix="dj-gate.") as directory:
        port = Port(image, pathlib.Path(directory))
        try:
            port.poke(PAT_BASE + 0x8e55, b"\x01")                                      # PER TRACK
            if scale is not None:
                port.poke(record + 1, bytes([scale]))
            port.poke(record + 4, b"\x01")                                             # PLAYS FREE
            port.poke(record + 6, b"\xff")                                             # trig quantize DIRECT
            port.tap("PLAY")
            port.send("run 500")
            if track >= 8:
                port.poke(MIDI_MODE, b"\x01")
            port.send("call %d %d 1" % (DISPATCH, track))                             # its trig key pressed
            steps = []
            for _ in range(25):
                port.send("run 40")
                steps.append(port.int(STEPS + track, 1))
            return port.int(SCALES + track, 1), steps
        finally:
            port.close()


def main():
    if not IMAGE.is_file() or not STOCK.is_file():
        print("[SKIP] direct-jump-kyoti: needs the built image and the original MAIN OS")
        return 0
    facts, image, stock = declared(), IMAGE.read_bytes(), STOCK.read_bytes()
    at = lambda address: address - BASE
    print("1. the image")
    for site in ("LAND_HOOK", "NOFA_HOOK", "PTNREL_HOOK", "TS_HOOK"):
        length, digest = facts["guards"][site]
        address = facts[site]
        check(hashlib.sha256(stock[at(address):at(address) + length]).hexdigest() == digest, "the original OS matches the guard at %#x" % address)
    slot = facts["PTN_LAYER_YES_PRESS"]
    check(stock[at(slot):at(slot) + 4] == bytes(4), "the original OS's [PTN]-layer YES press slot %#x is NULL" % slot)
    reference, symbols = unit_symbols(facts["REFERENCE"][0])
    check(hashlib.sha256(reference).hexdigest() == facts["REFERENCE"][1] and len(reference) == facts["UNIT_BYTES"],
          "the source links to the manifest's reference (%d bytes)" % facts["UNIT_BYTES"])
    unit = int.from_bytes(image[at(slot):at(slot) + 4], "big")
    for site, opcode, name in (("LAND_HOOK", b"\x4e\xb9", "dj_land"), ("NOFA_HOOK", b"\x4e\xb9", "dj_nofa"), ("PTNREL_HOOK", b"\x4e\xf9", "dj_ptnrel")):
        address = facts[site]
        check(image[at(address):at(address) + 6] == opcode + (unit + symbols[name]).to_bytes(4, "big"),
              "%#x holds a %s to %s" % (address, "jsr" if opcode[1] == 0xb9 else "jmp", name))
    check(symbols["dj_toggle"] == 0, "the [PTN]-layer YES press slot names dj_toggle (%#x)" % unit)
    fix, fix_bytes = facts["TS_HOOK"], facts["guards"]["TS_HOOK"][0]
    ts_unit = int.from_bytes(image[at(fix) + 2:at(fix) + 6], "big")
    ts_reference, _ = unit_symbols(facts["TS_REFERENCE"][0], "patch_trigscale.s")
    check(hashlib.sha256(ts_reference).hexdigest() == facts["TS_REFERENCE"][1], "patch_trigscale.s links to the manifest's reference")
    check(image[at(fix):at(fix) + 2] == b"\x4e\xf9" and image[at(fix) + 6:at(fix) + fix_bytes] == stock[at(fix) + 6:at(fix) + fix_bytes],
          "%#x holds a jmp to ts_cave (%#x), the rest of the guarded span stock" % (fix, ts_unit))
    if not EMU.is_file():
        print("[SKIP] the port: none at %s" % EMU)
        return 1 if FAILS else 0
    with tempfile.TemporaryDirectory(prefix="dj-gate.") as directory:
        port = Port(IMAGE, pathlib.Path(directory))
        try:
            check(port.mem(unit, facts["UNIT_BYTES"]) == unit_symbols(unit)[0], "after boot the unit in DRAM at %#x is this source, linked there" % unit)
            ts_bytes = unit_symbols(ts_unit, "patch_trigscale.s")[0]
            check(port.mem(ts_unit, len(ts_bytes)) == ts_bytes, "after boot the fix's unit at %#x is patch_trigscale.s, linked there" % ts_unit)
        finally:
            port.close()
    print("2. the toggle")
    battery = part_toggle(IMAGE, True, symbols)
    part_toggle(STOCK, False, symbols)
    print("3. OFF is stock")
    module, original = part_off(IMAGE, True), part_off(STOCK, False)
    landing = next((i for i, (act, _) in enumerate(original) if act == 1), None)
    master = ENGINE[0][1] - ENGINE[0][0]
    check(landing is not None and original[landing][1][master:master + 2] == b"\0\0",
          "original OS: the cue lands at the pattern end (master step 0)")
    check(module == original, "module OFF: %d distinct sequencer states from [PLAY], the same as the original OS" % len(module))
    print("4. ON: the jump against a reference run since START")
    part_on(IMAGE, symbols, "16 steps", midi=True)
    part_on(IMAGE, symbols, "7 steps, Part 2", part=1, length=7)
    part_on(IMAGE, symbols, "PER TRACK 16/7/5/3, scales 1x/2x/3:4x/1:2x, MIDI 5 at 3:2x",
            tracks=((0, 16, 2), (1, 7, 0), (2, 5, 3), (3, 3, 4), (8, 5, 1)), window=24)
    print("5. a power cycle in the port")
    power_cycle(IMAGE, battery, symbols)
    print("6. the MIDI Plays-Free fix")
    scale, steps = plays_free(STOCK, 8)
    check(scale == 0xff and len(set(steps)) == 1, "original OS: MIDI track 1's scale is seeded %#x and it stays on step %s" % (scale, sorted(set(steps))))
    scale, steps = plays_free(IMAGE, 8)
    check(scale == 2 and len(set(steps)) > 4, "module: MIDI track 1's scale is seeded %#x (1x) and it plays %d steps in a second" % (scale, len(set(steps))))
    original, module = plays_free(STOCK, 0, 1), plays_free(IMAGE, 0, 1)
    check(original == module and original[0] == 1 and len(set(original[1])) > 4,
          "audio track 1 at 2x, the same way: scale %#x and the same %d steps on both" % (module[0], len(set(module[1]))))
    print("%d failed" % len(FAILS) if FAILS else "all passed")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
