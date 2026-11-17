#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""DIRECT_JUMP_KYOTI's gate: the built image against the original OS, then under the ColdFire port.

    python3 modules/direct-jump-kyoti/verify.py        (from the octabam root)

Reads, and SKIPs without them:
  - the image: out/mainos_bus.bin built with DIRECT_JUMP_KYOTI (DJ_IMAGE overrides);
  - the original OS 1.40C MAIN image: out/raw/section_3_MAIN_OS.bin (DJ_STOCK overrides);
  - the port: out/emu/ot_emu (`make emu-cf`; OT_EMU overrides). Without it only part 1 runs.
Needs m68k-elf-as/ld/nm on PATH: the unit is assembled here for its symbol offsets.

1. The image (no emulator): the original OS matches the manifest's guards and the [PTN]-layer YES slot is
   NULL; the image holds a jsr at the landing, MIDI START, light Part apply's LFO AUTO CHANGE and stock pattern
   switch (COND_RESET call) sites and a jmp at the [PTN] release, each onto the unit's own symbol, and the slot
   names dj_toggle. After boot, the
   unit in DRAM is the bytes the manifest's reference names.
2. The toggle, by the keys (MKII panel, empty card), on this image and on the original OS: OFF after boot;
   [PTN] + [YES] turns it ON with a toast, and releasing [PTN] closes the toast and leaves the pattern
   chooser shut; again turns it OFF; [YES] alone (stock's own toast) leaves it OFF. The original OS opens no
   toast for [PTN] + [YES] and opens the chooser on the release.
3. OFF is stock: a pattern cued at master step 7 lands at the pattern end, and the whole sequencer state
   (per-track step, previous step, ticks, armed, countdown, reload, scale; master step, tick, scale, the
   first-fire and hold masks, the metronome) runs through the same sequence of values as on the original OS.
4. ON, for four incoming patterns (16 steps with [FILL] latched; 7 steps on Part 2; PER TRACK with differing
   track lengths and scales; 16 steps cued in the outgoing pattern's last step; edited in RAM, and the
   reference run checked to play the edit): the jump lands within the landing window, and from the next tick
   on every tick's sequencer state and trig-condition state (every track's A:B pass counter, the FILL and
   PRE latches) is the state of a reference run in which the incoming pattern played since START. Both runs
   start from stock's STOP reset of the trig conditions. With Part 2 the active Part follows. With MIDI
   transport send on, the landing reaches stock's MIDI START gate in the landing path and the START send
   after it does not run. No jump here silences a track, and none calls stock's note-off.
5. A power cycle of the port (battery RAM of a run left ON, booted again) comes up OFF.
6. The author's MIDI Plays-Free fix, on this image and on the original OS: pattern A01 in PER TRACK mode, MIDI
   track 1 (16 steps at 1x by default) Plays Free with trig quantize DIRECT, started while playing by stock's
   manual-trig dispatcher in MIDI mode. The original OS seeds its scale from the audio-stride byte (0xff in an
   empty project) and the track stays on its first step; the image seeds 1x and the track steps on. Audio track 1
   at 2x, started the same way, seeds the same scale and plays the same steps on both (the fix redoes stock's
   bytes for audio tracks).
7. Each track's Part at its first sounding trig (V7.2): with LFO AUTO CHANGE on, a jump into a pattern on
   Part 2 with sample trigs on four audio tracks (written into the pattern in RAM, as the trig keys store them)
   hands each of those tracks to stock's per-track Part apply exactly once, on the tick its first trig's step
   starts, and every track without a trig (audio and MIDI) on the boundary tick; the light Part apply of the
   switch skips its per-track part once (dj_lfoq). With LFO AUTO CHANGE off the same jump defers nothing.
8. SILENCE TRACKS (V7.2.2): with the project's SILENCE TRACKS on and two tracks' START SILENT set to OFF, the
   jump calls stock's note-off once for each of the six silenced audio tracks, on the tick after the landing,
   and for no other track.
9. The last restart (V7.3): [PLAY] on A01, a stock pattern change (DIRECT JUMP off) to A02, then DIRECT JUMP on
   and a jump to A03 a few steps into A02; against a reference run that changed from A01 straight to A03 on the
   same tick (DIRECT JUMP on, idle, from the same tick). From the tick after the landing every tick's sequencer
   state and trig-condition state equals the reference's (the author's cmp_reflock.py --ref-for). Ticks are
   counted from [PLAY] by the unit's tick hook, so a re-based clock cannot hide a shift. Twice: 16 -> 12 -> 12
   steps at 1x (the author's hardware case), and 1x -> 12 steps at 2x -> 12 steps at 3/4x (the switch's first
   step runs at the outgoing rate). Stock's switch runs the COND_RESET call once, for the stock change only.
What it cannot see: a real unit's timing, audio (the pop itself), external MIDI gear, the arranger, an MKI
panel.
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
# The trig-condition state: every track's A:B pass counter (long[16]), the FILL-held byte, the two FILL latches and
# the PRE latch ([16] each), contiguous. COND_RESET(-1) is what stock's STOP runs; FILL_LATCH is what the UI calls on a
# [FILL] press (0x40050050): it latches FILL for every track (0x46107959 or 0x46107969).
COND, COND_RESET, FILL_LATCH = (0x46107918, 0x46107989), 0x400a539c, 0x400a5460
TRK_APPLY, NOTE_OFF, LIGHT_APPLY = 0x40001f18, 0x40008f84, 0x40009e00   # (bank, part, t); (t); (bank, part)
SWRES_SITE = 0x400a4850                   # stock's switch block: `jsr COND_RESET` (V7.3: jsr dj_swres)
LFO_AUTO, SILENCE_DEF = 0x80000050, 0x8000004f   # LFO AUTO CHANGE; SILENCE TRACKS (a START SILENT byte of -1 uses it)
FAILS = []
SPAN = [0x10000]                          # the unit's length, from the manifest (main): calls made from inside it


def check(ok, what):
    print(("  ok    " if ok else "  FAIL  ") + what, flush=True)
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

    def records(self):
        """The PC hits since the last read: (pc, return address, first three stack arguments, d6) each."""
        rows = [[int(field, 16) for field in record.split(":")] for record in self.send("hits").split()[2:]]
        return [(row[1], row[7], row[8], row[9], row[10], row[16]) for row in rows]

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


def track_record(index, track):
    """Pattern `index`'s record of `track` (8+ MIDI): its first eight bytes are the trig mask, steps 32-63 then 0-31."""
    return PAT_BASE + index * PAT_STRIDE + (track * 0x91a if track < 8 else 0x48d0 + (track - 8) * 0x8b0)


def shape(port, index, part=0, length=None, tracks=(), trigs=(), silent=()):
    """Edit pattern `index` of bank A in RAM: its Part, a NORMAL length, or PER TRACK mode with (track, length, scale);
    a sample trig on (track, step); (audio track, START SILENT byte)."""
    blob = PAT_BASE + index * PAT_STRIDE
    for track, step in trigs:
        mask = track_record(index, track) + (4 if step < 32 else 0)
        port.poke(mask, (port.int(mask) | 1 << step % 32).to_bytes(4, "big"))
    for track, value in silent:
        port.poke(track_record(index, track) + 0x53, bytes([value & 0xff]))
    port.poke(blob + 0x8e57, bytes([part]))
    if length is not None:
        port.poke(blob + 0x8e53, bytes([length]))
    if tracks:
        port.poke(blob + 0x8e55, b"\x01")                       # PER TRACK
        port.poke(blob + 0x8e50, (16).to_bytes(2, "big") + b"\x02")   # master length 16, master scale 1x
        for track, steps, scale in tracks:
            record = blob + (0x50 + track * 0x91a if track < 8 else 0x48f8 + (track - 8) * 0x8b0)
            port.poke(record, bytes([steps, scale]))


def trace(port, clock, until, cue=None, slice_ms=4, hits=None):
    """Run to tick `until` of the unit's tick counter: {tick: (active pattern, engine state, trig-condition state at
    that tick's end)}. `cue` = (tick, pattern) cues that pattern once the counter reaches the tick. With a list as
    `hits`, the watched PCs' records are appended to it as (tick, record)."""
    seen = {}
    while True:
        port.send("run %d" % slice_ms)
        tick = port.int(clock)
        seen[tick] = (port.int(ACT_PAT, 1), engine(port), port.mem(COND[0], COND[1] - COND[0]))
        if hits is not None:
            hits.extend((tick, row) for row in port.records())
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


def call(port, *words):
    """A stock routine run as main; the port runs it only while main waits at its spin, so wait for that."""
    for _ in range(200):
        try:
            return port.send("call " + " ".join("%d" % word for word in words))
        except RuntimeError as error:
            if "not main's spin" not in str(error):
                raise
            port.send("run 1")
    raise RuntimeError("main never reached its spin for call %#x" % words[0])


def start(port, fill=False):
    """Stock's STOP reset of the trig conditions, [FILL] latched if asked, then [PLAY]."""
    call(port, COND_RESET, 0xffffffff)
    if fill:
        call(port, FILL_LATCH)
    port.tap("PLAY")


def landed_at(run, index=1):
    return min((t for t, (act, _, _) in run.items() if act == index), default=None)


def part_on(image, symbols, name, part=0, length=None, tracks=(), window=6, midi=False, fill=False, cue_tick=41):
    """The jump against its reference: the incoming pattern B (index 1) played since START."""
    runs, unit, hits = {}, None, []
    for jump in (False, True):
        with tempfile.TemporaryDirectory(prefix="dj-gate.") as directory:
            port = Port(image, pathlib.Path(directory))
            try:
                unit = port.int(0x400bf0c0)
                clock = unit + symbols["dj_T"]
                shape(port, 1, part, length, tracks)
                if jump:
                    toggle(port)
                    port.send("watch %d,%d,%d" % (unit + symbols["dj_nofa"], START_SEND, NOTE_OFF))
                    if midi:
                        port.poke(MIDI_SEND, b"\x01")
                else:
                    pattern(port, 1)                             # B from START
                start(port, fill)
                runs[jump] = trace(port, clock, 300, (cue_tick, 1) if jump else None, hits=hits if jump else None)
                if jump:
                    if midi:
                        pcs = [row[0] for _, row in hits]
                        check(pcs.count(unit + symbols["dj_nofa"]) > 0 and START_SEND not in pcs,
                              name + ": with MIDI transport send on, the jump reaches stock's MIDI START gate and does not send START")
                    if part:
                        check(port.int(PART, 1) == part, name + ": the active Part follows the incoming pattern (Part %d)" % (part + 1))
            finally:
                port.close()
    reference, run = runs[False], runs[True]
    master = ENGINE[0][1] - ENGINE[0][0]
    steps = {track: max(state[track] for _, state, _ in reference.values()) + 1 for track in range(16)}
    longest = max(int.from_bytes(state[master:master + 2], "big") for _, state, _ in reference.values()) + 1
    check(all(steps[track] == count for track, count, _ in tracks) and longest == (length or 16),
          name + ": the reference run plays the edited pattern (master %d steps%s)" % (
              longest, "".join(", T%d %d" % (track + 1, steps[track]) for track, _, _ in tracks)))
    landed = landed_at(run)
    check(landed is not None and cue_tick <= landed <= cue_tick + window,
          name + ": cued at tick %d, landed at tick %s (window %d)" % (cue_tick, landed, window))
    if landed is None:
        return
    common = [t for t in sorted(run) if landed < t <= 300 and t in reference]
    wrong = [t for t in common if run[t][:2] != reference[t][:2]]
    check(len(common) > 200 and not wrong, name + ": %d ticks after the landing equal the reference run%s" % (
        len(common), "" if not wrong else ", first difference at tick %d" % wrong[0]))
    wrong = [t for t in common if run[t][2] != reference[t][2]]
    counters = sorted({int.from_bytes(run[t][2][4 * k:4 * k + 4], "big") for t in common for k in range(16)})
    check(len(common) > 200 and not wrong and len(counters) > 1,
          name + ": the trig conditions (A:B counters %d..%d, FILL and PRE latches) equal the reference on the same "
          "ticks%s" % (counters[0], counters[-1], "" if not wrong else ", first difference at tick %d" % wrong[0]))
    if fill:
        latched = [t for t in common if any(run[t][2][0x41:0x61])]
        check(common[0] in latched and latched == [t for t in common if any(reference[t][2][0x41:0x61])],
              name + ": [FILL] stays latched across the jump (a stock switch clears it): ticks %s..%s, as in the "
              "reference" % (latched[0] if latched else None, latched[-1] if latched else None))
    released = [row for _, row in hits if row[0] == NOTE_OFF and unit <= row[1] < unit + SPAN[0]]
    check(not released, name + ": no track is silenced, and the unit calls no note-off (%d)" % len(released))


def part_publish(image, symbols):
    """V7.2: B on Part 2 with sample trigs on four audio tracks; with LFO AUTO CHANGE on, each track's Part reaches the
    engine at its first sounding trig (trigless tracks on the boundary tick); with it off nothing is deferred."""
    trigs = ((0, 4), (1, 9), (3, 7), (4, 12))
    defer = symbols["lq_stock"] - 2                          # dj_lfoq's rts after `cmp.l %d0,%d0`: the skip taken
    for lfo in (1, 0):
        with tempfile.TemporaryDirectory(prefix="dj-gate.") as directory:
            port = Port(image, pathlib.Path(directory))
            try:
                unit = port.int(0x400bf0c0)
                shape(port, 1, part=1, trigs=trigs)
                port.poke(LFO_AUTO, bytes([lfo]))
                toggle(port)
                port.send("watch %d,%d,%d" % (TRK_APPLY, unit + symbols["dj_pub1"], unit + defer))
                start(port)
                hits = []
                run = trace(port, unit + symbols["dj_T"], 150, (41, 1), hits=hits)
            finally:
                port.close()
        landed = landed_at(run)
        ours = [(tick, row) for tick, row in hits if unit <= row[1] < unit + SPAN[0] or row[0] == unit + defer]
        pubs = {}
        for tick, row in ours:
            if row[0] == unit + symbols["dj_pub1"]:
                pubs.setdefault(row[5], []).append(tick)
        applies = [(tick, row[2:5]) for tick, row in ours if row[0] == TRK_APPLY]
        skips = [tick for tick, row in ours if row[0] == unit + defer]
        if not lfo:
            check(not pubs and not applies and not skips,
                  "LFO AUTO CHANGE off: the jump (landed at tick %s) defers nothing: no per-track publish, the switch's "
                  "light Part apply is stock (%d, %d, %d)" % (landed, len(pubs), len(applies), len(skips)))
            continue
        check(landed is not None and 41 <= landed <= 47, "LFO AUTO CHANGE on: cued at tick 41, landed at tick %s" % landed)
        if landed is None:
            return
        expected = {}
        for track, step in trigs:                            # the tick the track's step counter passes the trig's step
            expected[track] = next((t for t in sorted(run) if t > landed and run[t][1][track] == step + 1
                                    and run.get(t - 1, (0, b"\0" * 64))[1][track] != step + 1), None)
        for track in range(16):
            if track not in expected:
                expected[track] = landed + 1                 # no sample trig: the boundary tick
        late = {track: (pubs.get(track), expected[track]) for track in range(16) if pubs.get(track) != [expected[track]]}
        check(not late, "every track published once: T1/T2/T4/T5 at their first trig (ticks %s), the other audio and "
              "every MIDI track on the boundary tick %d%s" % ("/".join(str(expected[t]) for t, _ in trigs), landed + 1,
                                                               "" if not late else "; differs: %s" % late))
        wrong = [(tick, args) for tick, args in applies if tuple(args[:2]) != (0, 1) or [tick] != pubs.get(args[2])]
        check(len(applies) == 8 and not wrong, "each audio track's publish is stock's per-track Part apply (bank A, "
              "Part 2, that track): %d calls%s" % (len(applies), "" if not wrong else ", unexpected %s" % wrong[:3]))
        check(len(skips) == 1 and skips[0] in (landed + 1, landed + 2),
              "the switch's light Part apply skips its per-track part once (dj_lfoq, tick %s)" % skips)


def part_silence(image, symbols):
    """V7.2.2: SILENCE TRACKS on, T3 and T7 START SILENT OFF: stock's note-off for the other six, the tick after the
    landing."""
    with tempfile.TemporaryDirectory(prefix="dj-gate.") as directory:
        port = Port(image, pathlib.Path(directory))
        try:
            unit = port.int(0x400bf0c0)
            shape(port, 1, part=1, silent=((2, 0), (6, 0)))
            check([port.int(track_record(1, t) + 0x53, 1) for t in (0, 1, 3, 4, 5, 7)] == [0xff] * 6,
                  "the other six tracks' START SILENT is the project default (-1)")
            port.poke(SILENCE_DEF, b"\x01")
            toggle(port)
            port.send("watch %d" % NOTE_OFF)
            start(port)
            hits = []
            run = trace(port, unit + symbols["dj_T"], 120, (41, 1), hits=hits)
        finally:
            port.close()
    landed = landed_at(run)
    released = sorted((tick, row[2]) for tick, row in hits if unit <= row[1] < unit + SPAN[0])
    want = [(landed + 1, t) for t in (0, 1, 3, 4, 5, 7)] if landed is not None else None
    check(released == want, "landed at tick %s; the unit released T1, T2, T4, T5, T6, T8 with stock's note-off on tick %s "
          "and nothing else: %s" % (landed, None if landed is None else landed + 1, released))


def part_restart(image, symbols, name, x, y, cue_x=40, dj_on=100, cue_y=114, until=300, window=8):
    """V7.3: [PLAY] on A01 (16 steps, 1x); pattern `x` = (length, master scale byte) cued as a stock change at tick
    `cue_x`; DIRECT JUMP on at `dj_on`; pattern `y` jumped to at `cue_y`. The reference cues y the stock way at
    `cue_x` and turns DIRECT JUMP on at `dj_on`. Ticks: [PLAY] = 1, then one per call of the unit's tick hook
    (dj_land), which runs every tick whatever DJ_MODE and dj_T say."""
    runs, switches, unit = {}, {}, None
    for jump in (False, True):
        with tempfile.TemporaryDirectory(prefix="dj-gate.") as directory:
            port = Port(image, pathlib.Path(directory))
            try:
                unit = port.int(0x400bf0c0)
                for index, (length, scale) in ((1, x), (2, y)):
                    shape(port, index, length=length)
                    port.poke(PAT_BASE + index * PAT_STRIDE + 0x8e54, bytes([scale]))
                land, swres = unit + symbols["dj_land"], SWRES_SITE
                port.send("watch %d,%d" % (land, swres))
                start(port)
                seen, tick, pending, ran = {}, None, [(cue_x, 1 if jump else 2), (dj_on, None)] + ([(cue_y, 2)] if jump else []), []
                while tick is None or tick < until:
                    port.send("run 4")
                    rows = port.records()
                    ran += [(tick, row) for row in rows if row[0] == swres]
                    if tick is None:
                        clock = port.int(unit + symbols["dj_T"])
                        if clock > 0:
                            tick = clock
                    else:
                        tick += sum(row[0] == land for row in rows)
                    if tick is None:
                        continue
                    seen[tick] = (port.int(ACT_PAT, 1), engine(port), port.mem(COND[0], COND[1] - COND[0]))
                    while pending and tick >= pending[0][0]:
                        what = pending.pop(0)[1]
                        if what is None:
                            port.poke(unit + symbols["DJ_MODE"], b"\x00\x00\x00\x01")
                        else:
                            pattern(port, what, 2)
                runs[jump], switches[jump] = seen, ran
            finally:
                port.close()
    reference, run = runs[False], runs[True]
    master = ENGINE[0][1] - ENGINE[0][0]
    changed = lambda r, index: min((t for t, (act, _, _) in r.items() if act == index), default=None)
    switch = changed(reference, 2)
    check(switch is not None and changed(run, 1) == switch and len(switches[False]) == 1 and len(switches[True]) == 1,
          name + ": the stock change lands at tick %s in both runs (A02 in the run, A03 in the reference), and stock's "
          "switch calls COND_RESET through 0x%x once in each (%d, %d): the jump never does" % (
              switch, SWRES_SITE, len(switches[False]), len(switches[True])))
    phase = lambda r, t: int.from_bytes(r[t][1][master:master + 2], "big") if t in r else None
    longest = max(phase(reference, t) for t, (act, _, _) in reference.items() if act == 2) + 1
    check(longest == y[0], name + ": the reference plays the edited A03 (master %d steps)" % longest)
    if x == y:
        check(phase(run, cue_y) == phase(reference, cue_y), name + ": when the jump is cued, A02 and the reference's A03 "
              "are on the same master step (%s, %s): the same pattern length since the same restart" % (
                  phase(run, cue_y), phase(reference, cue_y)))
    landed = min((t for t, (act, _, _) in run.items() if act == 2), default=None)
    check(landed is not None and cue_y <= landed <= cue_y + window,
          name + ": cued at tick %d, landed at tick %s (window %d)" % (cue_y, landed, window))
    if landed is None:
        return
    common = [t for t in sorted(run) if landed < t <= until and t in reference]
    wrong = [t for t in common if run[t][:2] != reference[t][:2]]
    check(len(common) > 150 and not wrong, name + ": %d ticks after the landing equal the reference run (A03's master step "
          "at tick %d: %s, the reference's %s)%s" % (len(common), landed + 1, phase(run, landed + 1), phase(reference, landed + 1),
                                                     "" if not wrong else ", first difference at tick %d" % wrong[0]))
    wrong = [t for t in common if run[t][2] != reference[t][2]]
    counters = sorted({int.from_bytes(run[t][2][4 * k:4 * k + 4], "big") for t in common for k in range(16)})
    check(len(common) > 150 and not wrong and len(counters) > 1,
          name + ": the trig conditions (A:B counters %d..%d, FILL and PRE latches) equal the reference on the same "
          "ticks%s" % (counters[0], counters[-1], "" if not wrong else ", first difference at tick %d" % wrong[0]))


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
    check(facts["SWRES_HOOK"] == SWRES_SITE, "the manifest's switch site is the one part 9 watches (%#x)" % SWRES_SITE)
    for site in ("LAND_HOOK", "NOFA_HOOK", "PTNREL_HOOK", "LFOQ_HOOK", "SWRES_HOOK", "TS_HOOK"):
        length, digest = facts["guards"][site]
        address = facts[site]
        check(hashlib.sha256(stock[at(address):at(address) + length]).hexdigest() == digest, "the original OS matches the guard at %#x" % address)
    slot = facts["PTN_LAYER_YES_PRESS"]
    check(stock[at(slot):at(slot) + 4] == bytes(4), "the original OS's [PTN]-layer YES press slot %#x is NULL" % slot)
    reference, symbols = unit_symbols(facts["REFERENCE"][0])
    SPAN[0] = facts["UNIT_BYTES"]
    check(hashlib.sha256(reference).hexdigest() == facts["REFERENCE"][1] and len(reference) == facts["UNIT_BYTES"],
          "the source links to the manifest's reference (%d bytes)" % facts["UNIT_BYTES"])
    unit = int.from_bytes(image[at(slot):at(slot) + 4], "big")
    for site, opcode, name in (("LAND_HOOK", b"\x4e\xb9", "dj_land"), ("NOFA_HOOK", b"\x4e\xb9", "dj_nofa"),
                               ("PTNREL_HOOK", b"\x4e\xf9", "dj_ptnrel"), ("LFOQ_HOOK", b"\x4e\xb9", "dj_lfoq"),
                               ("SWRES_HOOK", b"\x4e\xb9", "dj_swres")):
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
    part_on(IMAGE, symbols, "16 steps, [FILL] latched", midi=True, fill=True)
    part_on(IMAGE, symbols, "7 steps, Part 2", part=1, length=7)
    part_on(IMAGE, symbols, "PER TRACK 16/7/5/3, scales 1x/2x/3:4x/1:2x, MIDI 5 at 3:2x",
            tracks=((0, 16, 2), (1, 7, 0), (2, 5, 3), (3, 3, 4), (8, 5, 1)), window=24)
    part_on(IMAGE, symbols, "16 steps, cued in the last step", cue_tick=92)
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
    print("7. each track's Part at its first sounding trig")
    part_publish(IMAGE, symbols)
    print("8. SILENCE TRACKS: the silenced tracks released first")
    part_silence(IMAGE, symbols)
    print("9. the last restart: a jump after a stock pattern change")
    part_restart(IMAGE, symbols, "16 -> 12 -> 12 steps at 1x", (12, 2), (12, 2))
    part_restart(IMAGE, symbols, "16 at 1x -> 12 at 2x -> 12 at 3:4x", (12, 0), (12, 3), cue_y=120, until=330, window=10)
    print("%d failed" % len(FAILS) if FAILS else "all passed")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
