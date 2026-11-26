#!/usr/bin/env python3
"""SCOPE's gate: the built image under the ColdFire port (ot_emu --interactive --mkii).

    python3 modules/scope/verify.py        (from an octabam root)

Reads, and SKIPs without any of them:
  - the image: out/mainos_bus.bin built with SCOPE (SCOPE_IMAGE overrides);
  - the port: out/emu/ot_emu (`make emu-cf`; OT_EMU overrides);
  - a project folder to stage: SCOPE_PROJECT (its .work and .strd files are
    copied; the port runs audio frames only with a project loaded).

The TEMPO detour's jump gives the unit's address; `tstl scope_win` at its
offset 0x0e gives the window word, and the state words follow it in the
unit's data (scope_win, sc_wr, sc_frames, sc_viz). What it checks:
  1. At rest nothing is copied or drawn: scope_win stays 0, sc_wr and
     sc_frames do not move, sc_draw never runs.
  2. TEMPO alone opens stock's tempo window (0x460d16a0 set) and not SCOPE.
  3. DOWN held, then TEMPO: SCOPE's window is created (and the view name's
     toast), stock's tempo window is not, the ring fills from 0 (sc_open
     resets it) and sc_draw runs. --frame runs the frame clock this needs.
  4. UP and DOWN step OSC, XY, ALL and back.
  5. TEMPO, YES and NO each close it: scope_win 0, the window destroyed, and
     the ring and the draw stop again.
  6. TEMPO alone still opens stock's window afterwards.
What it cannot see: the panel's LCD, audio, hardware timing.
"""
import io
import os
import pathlib
import queue
import shutil
import subprocess
import sys
import tempfile
import threading

HERE = pathlib.Path(__file__).absolute().parent
ROOT = pathlib.Path.cwd() if (pathlib.Path.cwd() / "tools/emu").is_dir() else HERE.parents[1]
EMU = pathlib.Path(os.environ.get("OT_EMU", ROOT / "out/emu/ot_emu"))
IMAGE = pathlib.Path(os.environ.get("SCOPE_IMAGE", ROOT / "out/mainos_bus.bin"))
PROJECT = pathlib.Path(os.environ.get("SCOPE_PROJECT", ROOT / "out/_stage_tmpl/OCTABAM/TMPL"))
PY = pathlib.Path(os.environ.get("OT_PY", ROOT / ".venv/bin/python3"))
PY = PY if PY.exists() else pathlib.Path(sys.executable)
BASE = 0x40000400
TEMPO_OPEN = 0x40059EF0
TEMPOWIN, WCREATE, WDESTROY = 0x460D16A0, 0x4005829C, 0x40055DB4
TEMPO_DOWN = 0x0E                    # sc_tempo_down: tstl scope_win
KEYS = {"tempo": 0x18, "down": 0x20, "up": 0x33, "yes": 0x31, "no": 0x32}
FAILS = []
PASSES = []


def check(ok, what):
    print(("[PASS] " if ok else "[FAIL] ") + what, flush=True)
    (PASSES if ok else FAILS).append(what)


def draw_offset():
    """sc_draw's offset in the unit, from the source beside this file."""
    with tempfile.TemporaryDirectory() as tmp:
        obj = pathlib.Path(tmp) / "u.o"
        subprocess.run(["m68k-elf-as", "-mcpu=5475", "-o", str(obj), str(HERE / "unit.s")], check=True)
        out = subprocess.run(["m68k-elf-nm", str(obj)], capture_output=True, text=True, check=True).stdout
    found = {line.split()[2]: int(line.split()[0], 16) for line in out.splitlines() if len(line.split()) == 3}
    if found.get("sc_tempo_down") != TEMPO_DOWN:
        sys.exit("verify scope: sc_tempo_down moved in unit.s; update TEMPO_DOWN")
    return found["sc_draw"]


def stage(work):
    proj = work / "SCFIX"
    proj.mkdir()
    for f in PROJECT.iterdir():
        if f.is_file() and f.suffix.lower() in (".work", ".strd"):
            shutil.copy2(f, proj / f.name)
    card = work / "card.img"
    r = subprocess.run([str(PY), str(ROOT / "tools/emu/ot_emu/stage_card.py"), str(proj), "SCOPE", "SCFIX",
                        "--tree", str(work / "tree"), "--out", str(card)], capture_output=True, text=True, cwd=ROOT)
    if r.returncode:
        sys.exit(f"verify scope: stage_card failed:\n{r.stdout[-800:]}{r.stderr[-800:]}")
    return card


class Emu:
    """`ot_emu --interactive`: one command line out, one reply line back."""

    def __init__(self, card, log):
        argv = [str(EMU), "--image", str(IMAGE), "--card", str(card), "--interactive", "--mount", "--set", "SCOPE",
                "--project", "SCFIX", "--internal-clock", "--mkii", "--frame"]
        self.err = open(log, "wb")
        self.p = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.err, bufsize=0)
        self.q = queue.Queue()
        self.rows = {}
        threading.Thread(target=self._rd, daemon=True).start()
        while True:
            line = self.q.get(timeout=900)
            if line is None:
                raise RuntimeError(f"ot_emu died before ready ({log})")
            if line.startswith("ready"):
                break

    def _rd(self):
        f = io.BufferedReader(self.p.stdout, buffer_size=1 << 16)
        for raw in iter(f.readline, b""):
            self.q.put(raw.decode("ascii", "replace").rstrip())
        self.q.put(None)

    def cmd(self, line, expect="ok"):
        self.p.stdin.write(line.encode() + b"\n")
        self.p.stdin.flush()
        while True:
            r = self.q.get(timeout=900)
            if r is None:
                raise RuntimeError("ot_emu died on " + line)
            head = r.split(" ", 1)[0]
            if head == expect:
                return r
            if head == "err":
                raise RuntimeError(r)

    def run(self, ms):
        self.cmd(f"run {ms}")

    def u32(self, a):
        return int(self.cmd(f"peek {a:#x} 4", "peek")[5:], 16)

    def key(self, name, down):
        code = KEYS[name]
        row = 0x20 | (code >> 3)
        cur = self.rows.get(row, 0)
        cur = cur | (1 << (code & 7)) if down else cur & ~(1 << (code & 7))
        self.rows[row] = cur
        self.cmd(f"key {row:#x} {cur:#x}")

    def tap(self, name, after=400):
        self.key(name, True)
        self.run(80)
        self.key(name, False)
        self.run(after)

    def chord(self, held, name, after=600):
        self.key(held, True)
        self.run(150)
        self.tap(name, after=150)
        self.key(held, False)
        self.run(after)

    def watch(self, addrs):
        self.cmd("watch " + ",".join(hex(a) for a in addrs))
        self.hits()

    def hits(self):
        return [tuple(int(x, 16) for x in h.split(":")) for h in self.cmd("hits", "hits").split()[2:]]

    def quit(self):
        try:
            self.cmd("quit")
        except Exception:
            pass
        self.p.wait(timeout=60)
        self.err.close()


def main():
    for what, path in (("image", IMAGE), ("port", EMU), ("project", PROJECT)):
        if not path.exists():
            print(f"verify scope: SKIP (no {what}: {path})")
            return 0
    img = IMAGE.read_bytes()
    at = TEMPO_OPEN - BASE
    if img[at:at + 2] != b"\x4e\xf9":
        print(f"verify scope: SKIP ({IMAGE} has no SCOPE detour at {TEMPO_OPEN:#x})")
        return 0
    hook = int.from_bytes(img[at + 2:at + 6], "big")
    draw = hook + draw_offset()
    work = pathlib.Path(tempfile.mkdtemp(prefix="scope_verify_"))
    e = Emu(stage(work), work / "emu.log")
    try:
        e.run(3000)
        e.tap("yes", after=1500)                       # the clock dialog, if any
        if e.u32(TEMPOWIN):
            e.tap("no", after=600)
        lead = e.u32(hook + TEMPO_DOWN)
        if lead >> 16 != 0x4AB9:
            sys.exit(f"verify scope: no tstl at {hook + TEMPO_DOWN:#x} ({lead:#010x}); the unit is not where the detour points")
        win = int(e.cmd(f"peek {hook + TEMPO_DOWN + 2:#x} 4", "peek")[5:], 16)
        wr, frames, viz = win + 4, win + 8, win + 12
        print(f"verify scope: unit {hook:#x}, scope_win {win:#x}, sc_draw {draw:#x}")

        def quiet(name):
            before = (e.u32(wr), e.u32(frames))
            e.watch([draw])
            e.run(1500)
            drawn = [h for h in e.hits() if h[1] == draw]
            after = (e.u32(wr), e.u32(frames))
            check(e.u32(win) == 0 and before == after and not drawn,
                  f"{name}: closed, ring {before} -> {after}, sc_draw ran {len(drawn)} times")

        quiet("at rest")

        e.watch([WCREATE])
        e.tap("tempo", after=600)
        made = [h for h in e.hits() if h[1] == WCREATE]
        check(e.u32(TEMPOWIN) != 0 and e.u32(win) == 0,
              f"TEMPO alone: stock tempo window {e.u32(TEMPOWIN):#x}, scope_win {e.u32(win):#x}, {len(made)} window(s) created")
        e.tap("no", after=600)
        check(e.u32(TEMPOWIN) == 0, "NO closes stock's tempo window")

        def open_scope(name):
            e.watch([WCREATE, draw])
            e.chord("down", "tempo", after=1500)
            h = e.hits()
            made = [x for x in h if x[1] == WCREATE]
            drawn = [x for x in h if x[1] == draw]
            check(e.u32(win) != 0 and e.u32(TEMPOWIN) == 0 and 1 <= len(made) <= 2 and e.u32(wr) > 0 and drawn,
                  f"{name}: scope_win {e.u32(win):#x}, stock tempo window {e.u32(TEMPOWIN):#x}, "
                  f"{len(made)} window(s) created, ring filled to {e.u32(wr)} from 0, sc_draw ran {len(drawn)} times")

        def close_scope(how):
            e.watch([WDESTROY])
            e.tap(how, after=600)
            gone = [x for x in e.hits() if x[1] == WDESTROY]
            check(e.u32(win) == 0 and e.u32(TEMPOWIN) == 0 and gone,
                  f"{how.upper()} closes SCOPE: scope_win {e.u32(win):#x}, stock tempo window {e.u32(TEMPOWIN):#x}, "
                  f"{len(gone)} window(s) destroyed")
            quiet(f"after {how.upper()}")

        open_scope("DOWN then TEMPO")
        seen = [e.u32(viz)]
        for k in ("up", "up", "up", "down"):
            e.tap(k, after=500)
            seen.append(e.u32(viz))
        check(seen == [0, 1, 2, 0, 2], f"UP and DOWN step the views: {seen} (0 OSC, 1 XY, 2 ALL)")
        close_scope("tempo")
        open_scope("DOWN then TEMPO again")
        close_scope("yes")
        open_scope("and again")
        close_scope("no")

        e.tap("tempo", after=600)
        check(e.u32(TEMPOWIN) != 0 and e.u32(win) == 0, "TEMPO alone still opens stock's tempo window")
        e.tap("no", after=600)
    finally:
        e.quit()
    if FAILS:
        print(f"verify scope: {len(FAILS)} of {len(FAILS) + len(PASSES)} checks failed (log {work / 'emu.log'})")
        return 1
    print(f"verify scope: {len(PASSES)} checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
