#!/usr/bin/env python3
"""The Quadraverb's ColdFire half (runtime/qv_runtime.c): its tables and its assembly, both from the owner's ROM image,
in gen/ and committed under the owner's waiver of 27 November 2026 (FIRMWARE.md).

  python3 -B qvcf.py gen <programs.json> <lfo_dir> [--areas FILE.json]   gen/qv_tables.h: the release programs' stream plans
                                                                           at LAT 3 and their area words (none without
                                                                           --areas: {index: {words, relocs, origin}});
                                                                           gen/qv_names.h: their message box lines
  python3 -B qvcf.py asm                                                   gen/qv_runtime.s, as Midiverb's stream.s:
                                                                           runtime/qv_runtime.c compiled, then qv_entry.s

A program's index is its place in manifest.PROGRAMS, the value PROG stores.
"""
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
DRAFT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(DRAFT))
sys.path.insert(0, str(next(up for up in HERE.parents if (up / "package.json").exists()) / "sdk/octabam/tools"))  # remix, for manifest.py
import qvc  # noqa: E402
import qvk  # noqa: E402
import qvs  # noqa: E402
from manifest import PROGRAMS  # noqa: E402

LAT = 3  # MODWERK_DSP_STREAM_LAG: fill(f) has every out-block up to f - 3
SRC = DRAFT / "runtime" / "qv_runtime.c"
ENTRY = DRAFT / "runtime" / "qv_entry.s"
GEN = DRAFT / "gen"
# Midiverb's (sdk/octatrack/modules/midiverb/generate.mjs CF_FLAGS), warnings as errors.
CF_FLAGS = ["-mcpu=5475", "-msoft-float", "-O2", "-ffreestanding", "-fno-builtin", "-fno-common", "-fno-jump-tables",
            "-fno-asynchronous-unwind-tables", "-fno-ident", "-fomit-frame-pointer", "-Wall", "-Wextra", "-Werror"]


def plans(programs, lfo_dir, knobs=None):
    """Every release program's plan, with its live knobs (qvk: knobs.json beside programs.json unless given)."""
    path = pathlib.Path(knobs or pathlib.Path(programs).with_name("knobs.json"))
    out = []
    for p in PROGRAMS:
        kn = qvk.program(p, path)
        make = lambda: qvs.make_plan(programs, p, lfo_dir, lat=LAT, reserve=qvc.DRY_WORDS,   # the area build's dry scratch
                                     knobs=kn)
        ok = lambda pl: pl.fits and sum(x.W for x in pl.windows) <= qvs.STREAM_IN_MOST
        pl = make()
        if not ok(pl) and kn.sweep:
            # a deeper sweep needs more ring or channel than there is: DEP stops at the deepest that fits
            lo, hi = kn.sweep["d"], 98
            while lo < hi:
                kn.dhi = (lo + hi + 1) // 2
                lo, hi = (kn.dhi, hi) if ok(make()) else (lo, kn.dhi - 1)
            kn.dhi = lo
            pl = make()
        if pl.in_words > qvs.STREAM_IN_MOST:
            raise SystemExit(f"program {p}: {pl.in_words} halfwords a frame in, more than the channel's {qvs.STREAM_IN_MOST}")
        if pl is None or not pl.fits:
            raise SystemExit(f"program {p}: no stream plan that fits")
        out.append(pl)
    return out


def _array(ctype, name, values, per=16):
    values = list(values) or ["0"]   # C has no empty arrays
    rows = [", ".join(values[i:i + per]) for i in range(0, len(values), per)]
    return f"static const {ctype} {name}[] = {{\n    " + ",\n    ".join(rows) + ",\n};\n"


def tables(plans, areas):
    """The header qv_runtime.c includes: per program (by index) its rings and windows as qvs.ColdFire sizes and reads
    them, and its area. areas: {index: dict(words=[24-bit], relocs=[word index], origin=P address)}; missing: empty."""
    progs, lines, wins, words, relocs, rings, moving, sizes, knobs = [], [], [], [], [], [], [], [], []
    for i, pl in enumerate(plans):
        ring = qvs.ColdFire(pl).ring
        line0, at, where = len(lines), 0, {}
        for w in pl.streamed:
            where[w] = len(lines)
            lines.append(f"{{{at}, {len(ring[w]) - 1}}}")
            at += len(ring[w])
        win0, mv = len(wins), 0
        for x in pl.windows:
            if x.kind == "static":
                kg = x.knob["group"] if getattr(x, "knob", None) else -1
                wins.append(f"{{{x.dmin}, {where[x.line]}, {x.W}, 0, -1, {kg}}}")
            else:
                wins.append(f"{{{x.Bmin + x.lo - x.h - 15}, {where[x.line]}, {x.W}, {x.U0}, {mv}, -1}}")
                mv += 1
        knobs.append(knob_record(pl, i))
        a = areas.get(i) or dict(words=[], relocs=[], origin=0)
        if len(a["words"]) > 2048 or any(not 0 <= v < 1 << 24 for v in a["words"]) or \
                any(not 0 <= r < len(a["words"]) for r in a["relocs"]):
            raise ValueError(f"index {i}: an area of at most 2048 24-bit words, relocations inside it")
        progs.append(f"{{{len(pl.streamed)}, {line0}, {len(pl.windows)}, {win0}, {mv}, {pl.in_words}, {at}, "
                     f"{len(words)}, {len(a['words'])}, {len(relocs)}, {len(a['relocs'])}, {a['origin']}}}, "
                     f"/* {i}: program {PROGRAMS[i]} */")
        words += a["words"]
        relocs += a["relocs"]
        rings.append(at)
        moving.append(mv)
        sizes.append(len(a["words"]))
    vocab = sorted(set(words))       # the areas as indices into their distinct words: a third smaller than 3 bytes each
    if len(vocab) > 1 << 16:
        raise ValueError("more distinct area words than a uint16_t index")
    at = {v: j for j, v in enumerate(vocab)}
    _, (rate, H, K) = qvk.load(qvk_path(plans))
    return ("/* Generated by engine/qvcf.py gen from the owner's ROM image; committed under the owner's waiver of 27 November 2026 (FIRMWARE.md). */\n"
            f"#define QV_PROGRAMS {len(plans)}\n"
            f"#define QV_STREAM_IN {max(pl.in_words for pl in plans)}\n"
            f"#define QV_STREAM_OUT {max(pl.out_words for pl in plans) + 2}\n"
            f"#define QV_PROGRAM_WORDS {max(sizes)}\n"
            f"#define QV_RING_MAX {max(rings)}\n"
            f"#define QV_MOVING_MAX {max(moving + [1])}\n"
            "static const struct qv_prog qv_progs[QV_PROGRAMS] = {\n    " + "\n    ".join(progs) + "\n};\n"
            + _array("struct qv_line", "qv_lines", lines, 4)
            + _array("struct qv_window", "qv_windows", wins, 4)
            + _array("uint8_t", "qv_dict", [f"0x{b:02x}" for v in vocab for b in v.to_bytes(3, "big")], 24)
            + _array("uint16_t", "qv_area", [str(at[v]) for v in words], 24)
            + _array("uint16_t", "qv_relocs", [str(r) for r in relocs])
            + "static const struct qv_knob qv_knobs[QV_PROGRAMS] = {\n    " + "\n    ".join(knobs) + "\n};\n"
            # the curves (qvk): DECAY's coefficient, and the sweep's rate and depth as the firmware's routine gives them
            + _array("uint16_t", "qv_decay", [str(qvk.decay_c(v)) for v in range(100)])
            + _array("uint8_t", "qv_rate", [str(v) for v in rate[:99]], 24)
            + _array("uint8_t", "qv_depth_h", [str(v) for v in H], 24)
            + _array("uint8_t", "qv_depth_k", [str(v) for v in K], 24))


def qvk_path(plans):
    return next((pl.knobs.path for pl in plans if pl.knobs), qvk.KNOBS)


KIND = {"len": None, "rate": 3, "depth": 4, "centre": 5}


def knob_record(pl, i):
    """struct qv_knob for program index i (qvk.Program, qvs.knob_words)."""
    kn = pl.knobs
    if kn is None:
        return f"{{0}}, /* {i} */"
    lk = {None: 0, "decay": 1, "fb": 2}[kn.len_kind] or (3 if kn.reverse else 0)
    tk = {None: 0, "pre": 1, "delay": 2}[kn.time_kind] or (3 if kn.reverse else 0 if kn.delay_led else 4)
    assert all(g[2] == 0 for g in kn.len_) and all(g[2] == 1 for g in kn.time_), "LEN from 0, TIME from 1 ms"
    two = lambda gs, k: ", ".join(str(gs[j][k] if j < len(gs) else 0) for j in range(2))
    sw = kn.sweep if pl.ksweep else None
    B = (sw["B"] | (0x80 if sw["centreOf"] == "depth" else 0)) if sw else 0
    kinds = [1 + w[1] if w[0] == "len" else KIND[w[0]] for w in pl.kwords]
    assert len(kinds) <= 6
    c0 = (sw["c0"] if sw["centreOf"] == "depth" else sw["centre"]) if sw else 0
    return (f"{{{lk}, {tk}, {len(kn.len_)}, {len(kn.time_)}, {{{two(kn.len_, 1)}}}, {{{two(kn.len_, 3)}}}, "
            f"{{{two(kn.time_, 1)}}}, {{{two(kn.time_, 3)}}}, {B}, {sw['s'] if sw else 0}, {sw['d'] if sw else 0}, "
            f"{1 + len(kinds) if kinds else 0}, {{{', '.join(str(k) for k in kinds) or '0'}}}, {c0}, {kn.dhi}}}, "
            f"/* {i}: program {PROGRAMS[i]}{', tables' if pl.ktables else ''} */")


def unit(*defs):
    """gen/qv_runtime.s: runtime/qv_runtime.c compiled for the ColdFire, then qv_entry.s. The first line is a comment:
    gas does not strip comments from a file that starts with gcc's #NO_APP, and qv_entry.s has them."""
    asm = subprocess.run(["m68k-elf-gcc", *CF_FLAGS, *defs, "-S", "-o", "-", str(SRC)], check=True,
                         stdout=subprocess.PIPE, text=True).stdout
    return ("| Generated by engine/qvcf.py asm from runtime/qv_runtime.c, gen/qv_tables.h, gen/qv_names.h and"
            " runtime/qv_entry.s; ROM-derived, committed under the owner's waiver of 27 November 2026 (FIRMWARE.md).\n"
            + asm + "\n" + ENTRY.read_text())


def short_name(number, name):
    """Stock's message box line when PROG turns (19 characters at most, as Midiverb's generate.mjs shortName): the
    program's number on the original, as the dial shows it, then its name upper-cased."""
    return ("%02d %s" % (number, " ".join(name.upper().split())))[:19].rstrip()


def names(programs):
    """gen/qv_names.h: each release program's message box line, by index (qv_runtime.c qv_name)."""
    by = {p["p"]: p["name"] for p in json.loads(pathlib.Path(programs).read_text())}
    lines = [short_name(p, by[p]) for p in PROGRAMS]
    if not all(" " <= c <= "~" and c not in '"\\' for s in lines for c in s):
        raise ValueError("a program name that is not plain printable ASCII")
    return ("/* Generated by engine/qvcf.py gen from the owner's ROM image (the factory programs' names); committed under"
            " the owner's waiver of 27 November 2026 (FIRMWARE.md). */\n"
            f"#define QV_NAMES_COUNT {len(lines)}\n"
            "static const char qv_names[QV_NAMES_COUNT][20] = {\n"
            + "".join(f'    "{s}", /* {i} */\n' for i, s in enumerate(lines)) + "};\n")


def main(argv):
    if argv[:1] == ["gen"] and len(argv) >= 3:
        areas = {}
        if "--areas" in argv:
            areas = {int(k): v for k, v in json.loads(pathlib.Path(argv[argv.index("--areas") + 1]).read_text()).items()}
        GEN.mkdir(exist_ok=True)
        (GEN / "qv_tables.h").write_text(tables(plans(argv[1], argv[2]), areas))
        (GEN / "qv_names.h").write_text(names(argv[1]))
        print("wrote", GEN / "qv_tables.h", "and", GEN / "qv_names.h")
    elif argv[:1] == ["asm"]:
        (GEN / "qv_runtime.s").write_text(unit())
        print("wrote", GEN / "qv_runtime.s")
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
