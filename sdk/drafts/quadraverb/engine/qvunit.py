#!/usr/bin/env python3
"""The Quadraverb development builds: one factory program compiled into a module's engine, and its package.

  python3 -B qvunit.py gen <programs.json> <program> [--lfo DIR] [--realtime]   write the program's engine.asm
  python3 -B qvunit.py build <program> [--cycles N] [--state N]                    its .mwrm, through npm run module:dev

A development build only, for measuring the compiled engine on a unit and listening to it (TESTING.md): one program
built in, MIX on knob F, nothing else. Never published.

The generated engine carries an Alesis program (its steps, coefficients and LFO), so it never enters the repository,
by construction: `gen` writes it to ~/.cache/modwerk-local/quadraverb/engine/pkg/<program>/ and copies it into the draft's
gen/ folder, where the draft's .gitignore ignores it (staged copies of the draft carry that .gitignore with them). `build`
then runs `npm run module:dev -- quadraverb --build-only`, whose package goes to
~/.cache/modwerk-local/quadraverb/pkg/qv-dev-<program>.mwrm, outside the checkout too.

The engine is qvc.generate(unit=True): the prototype's code (bit-exact in dsp_host, verify.py) with what a unit needs
around it (qvc.USTATE). verify_unit.py holds the generated file to the integer model.
"""
import json
import os
import pathlib
import shutil
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
DRAFT = HERE.parent
ROOT = next(up for up in HERE.parents if (up / "package.json").exists())
sys.path.insert(0, str(HERE))
import qvc  # noqa: E402

CACHE = pathlib.Path.home() / ".cache/modwerk-local/quadraverb"
LFO_DIR = CACHE / "engine/lfo"
GEN = DRAFT / "gen"
# The programs these builds were made for: they fit the FX2 buffer without the SDRAM stream.
PROGRAMS = (5, 40, 56)


def compile_program(path, p, lfo_dir=LFO_DIR, realtime=False):
    """(name, asm text, info, model inputs) of program p as a unit build."""
    name, steps, static = qvc.load(path, p)
    if static:
        addr, size = qvc.relocate(steps)
        text, info = qvc.generate(steps, addr, size, unit=True)
        return name, text, info, dict(static=True, steps=steps, addr=addr, size=size)
    row, fade = qvc.load_lfo(pathlib.Path(lfo_dir) / "lfo.json", p)
    if row is None:
        sys.exit(f"program {p} moves, and {lfo_dir}/lfo.json does not have it (engine/extract_lfo.mjs)")
    steps = row["steps"]
    lfo = qvc.Lfo(row)
    lfo.fade = fade
    moving = lfo.moves(steps)
    addr, size, off = qvc.relocate(steps, qvc.FX2_WORDS, moving)
    timing = qvc.tick_timing(row, realtime)
    mod = dict(lfo=lfo, moving=moving, off=off, timing=timing, fade=fade)
    text, info = qvc.generate(steps, addr, size, mod=mod, unit=True)
    return row["name"], text, info, dict(static=False, steps=steps, addr=addr, size=size,
                                         mv=dict(row=row, fade=fade, off=off, timing=timing))


def out_dir(p):
    return CACHE / "engine/pkg" / str(p)


def gen(argv):
    path, p = argv[0], int(argv[1])
    lfo_dir = argv[argv.index("--lfo") + 1] if "--lfo" in argv else LFO_DIR
    name, text, info, _ = compile_program(path, p, lfo_dir, "--realtime" in argv)
    out = out_dir(p)
    out.mkdir(parents=True, exist_ok=True)
    (out / "engine.asm").write_text(text + "\n")
    meta = dict(program=p, name=" ".join(name.split()), ring=info["size"], products=info["products"],
                accesses=info["accesses"], distances=len(info["dist"]), body=info["words"],
                moving=bool(info.get("mod")), realtime="--realtime" in argv)
    (out / "program.json").write_text(json.dumps(meta, indent=1) + "\n")
    # The draft's copy, which the package builder reads (the draft's .gitignore ignores these two; the release's gen/ is committed)
    assert {"gen/engine.asm", "gen/program.json"} <= set((DRAFT / ".gitignore").read_text().splitlines()), "the draft's .gitignore must ignore the development engine"
    GEN.mkdir(exist_ok=True)
    for f in ("engine.asm", "program.json"):
        shutil.copyfile(out / f, GEN / f)
    ignored = subprocess.run(["git", "-C", str(ROOT), "check-ignore", "-q", str(GEN / "engine.asm")]).returncode == 0
    assert ignored, "gen/engine.asm is not ignored by git"
    print(f"program {p} {meta['name']}: ring {info['size']} words, {info['words']} instructions a sample; "
          f"{out / 'engine.asm'} (and {GEN / 'engine.asm'}, ignored)")


def build(argv):
    """The package of the program gen last wrote, through npm run module:dev (as Midiverb's TESTING.md builds it)."""
    p = int(argv[0])
    meta = json.loads((GEN / "program.json").read_text())
    if meta["program"] != p:
        sys.exit(f"gen/ holds program {meta['program']}, not {p}: run gen first")
    cycles = argv[argv.index("--cycles") + 1] if "--cycles" in argv else "300"
    state = argv[argv.index("--state") + 1] if "--state" in argv else str(qvc.R7_END)
    out = CACHE / "pkg" / f"qv-dev-{p}.mwrm"
    out.parent.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    env.setdefault("ELEKLOADER_DSP_ASM",
                   str(pathlib.Path.home() / ".cache/modwerk-upstream/octabam/vendor/dsp56300/build/source/dsp_host/dsp_asm"))
    cmd = ["npm", "run", "module:dev", "--", "quadraverb", "--build-only", "--out", str(out), "--slots", "fx2",
           "--cycles", cycles, "--cycles-kind", "modeled", "--state", state, "--buffer", str(qvc.FX2_WORDS)]
    print(" ".join(cmd))
    r = subprocess.run(cmd, cwd=ROOT, env=env)
    if r.returncode:
        sys.exit(r.returncode)
    import hashlib
    print(f"{out}  sha256 {hashlib.sha256(out.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    {"gen": gen, "build": build}[sys.argv[1]](sys.argv[2:])
