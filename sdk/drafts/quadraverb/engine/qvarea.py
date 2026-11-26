#!/usr/bin/env python3
"""The release package's DSP side: the shell (the package's own DSP code, no Alesis program in it) and each program's
area (the code the base writes into one of the slot's program areas at a pick, compiled from the ROM).

  python3 -B qvarea.py shell                              write ../shell.asm (no ROM data: committed)
  python3 -B qvarea.py areas <programs.json> <lfo_dir>    every release program's area: gen/areas.json (ROM-derived)

The shell's proc runs the area its slot's record names (X:$7fb0 + 4 * ((r7 >> 8) & 15), word 0), or leaves the block
dry while there is none; its init keeps the slot's buffer base and clears the signature, so the first area to run sets
itself up. An area is qvs.generate(plan, area=...): a unit build with the stream named by the slot's record (qvc
ASTATE). Its code is assembled at two origins; the words that differ by exactly the origins' distance are the ones
code() relocates (qv_runtime.c adds at - origin). Every other word must be equal, which area() checks.
"""
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
DRAFT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(DRAFT))
import qvc  # noqa: E402
import qvcf  # noqa: E402
import qvs  # noqa: E402
import verify as V  # noqa: E402

G = V.G
ORIGINS = (0x3000, 0x3800)
SHELL = DRAFT / "shell.asm"


def sig_of(index):
    """The area's signature (r7 + sig): its own for each program, so a switch sets the next one up afresh."""
    return 0x51A000 | index


def tag_of(index):
    """The out-block's first word (qv_runtime.c): the program the DSP runs."""
    return 0x5100 | index


def shell_text():
    S = qvc.STATE
    return f"""; Quadraverb's shell, the release package's DSP part (engine/qvarea.py writes it; no Alesis program in it).
; The base writes the picked program's code into one of the slot's two program areas and names it in word 0 of the
; slot's record, X:$7fb0 + 4 ((r7 >> 8) & 15) (docs/OCTATRACK_API.md, "Program areas"). proc runs that area with the
; dispatcher's registers as it got them (a1 the frame flag, r0, n7, r6, r7), or leaves the block dry while there is none.
; init keeps the slot's buffer base and clears the signature: the first area to run sets itself up (qvc ASTATE).

init:
        move    #>$ffffff,m4
        move    x:>$213,r4
        move    x:(r4),b
        move    b,x:(r7+${S['base']:02x})
        clr     b
        move    b,x:(r7+${S['sig']:02x})
        rts

proc:
        move    r7,b
        lsr     #6,b
        and     #>$00003c,b
        add     #>${qvc_records():06x},b
        move    b1,r1
        nop
        move    x:(r1),b
        tst     b
        beq     qsDRY
        move    b1,r1
        nop
        jsr     (r1)
qsDRY:
        rts
"""


def qvc_records():
    return 0x7FB0


def area(plan, index, work, prefix="qv"):
    """(text, info, dict(words, relocs, origin)) of the program's area."""
    text, info = qvs.generate(plan, prefix, area=dict(sig=sig_of(index), tag=tag_of(index)))
    asms = [G.assemble(text, work, org=o, name=f"qa{index}_{o:x}") for o in ORIGINS]
    a, b = asms
    if a.syms["proc"] != ORIGINS[0] or len(a.words) != len(b.words):
        raise ValueError(f"index {index}: the area does not start at proc, or its length moves with the origin")
    d = ORIGINS[1] - ORIGINS[0]
    relocs = []
    for i, (u, v) in enumerate(zip(a.words, b.words)):
        if u == v:
            continue
        if (v - u) & 0xFFFFFF != d:
            raise ValueError(f"index {index}: word {i} moves with the origin but not by its distance")
        relocs.append(i)
    if a.syms.get(f"{prefix}DATA") != ORIGINS[0] + len(a.words):
        raise ValueError(f"index {index}: the tables do not follow the code")
    return text, info, dict(words=a.words + [v & 0xFFFFFF for v in info["data"]], relocs=relocs, origin=ORIGINS[0])


def relocate(ar, at):
    """What qv_runtime.c's code() writes for P address at."""
    out = list(ar["words"])
    for i in ar["relocs"]:
        out[i] = (out[i] + at - ar["origin"]) & 0xFFFFFF
    return out


def main(argv):
    if argv[0] == "shell":
        SHELL.write_text(shell_text())
        print(f"wrote {SHELL}")
        return
    programs, lfo_dir = argv[1], argv[2]
    gen = DRAFT / "gen"
    gen.mkdir(exist_ok=True)
    out = gen / "areas.json"
    if subprocess.run(["git", "-C", str(DRAFT), "check-ignore", "-q", str(out)]).returncode:
        sys.exit(f"{out} is not ignored by git: it carries Alesis programs")
    tmp = G.workdir("qv-area-")
    work = pathlib.Path(tmp.name)
    areas = {}
    for index, plan in enumerate(qvcf.plans(programs, lfo_dir)):
        _, info, ar = area(plan, index, work)
        areas[index] = ar
        print(f"{index:2d} program {qvcf.REVERBS[index]:2d}: {len(ar['words'])} words, {len(ar['relocs'])} relocated; "
              f"ring {plan.size}, in {plan.in_words}, out {plan.out_words}")
    out.write_text(json.dumps(areas))
    print(f"wrote {out}; the longest area {max(len(a['words']) for a in areas.values())} words")


if __name__ == "__main__":
    main(sys.argv[1:])
