#!/usr/bin/env python3
"""The live knobs (ENGINE.md, "Live knobs"): B LEN, C TIME, D SPD and E DEP, from knobs.json (extract_knobs.mjs, derived
from the ROM: it stays in ~/.cache/modwerk-local/quadraverb/engine/).

  B LEN    DECAY (0-99) on a reverb program; FEEDBACK (0-99 %) on a delay-led one, L and R together
  C TIME   PRE-DELAY (1-140 ms) on a reverb program; DELAY TIME on a delay-led one, R keeping its ratio to L
  D SPD    the sweep's SPEED (0-98), E DEP its DEPTH (0-98): every program with a sweep
"Delay-led": no reverb in the program (configurations 2 and 3), or the delay mixed louder than the reverb. Reverse
programs (reverb type 4) keep LEN and TIME as they are. Every knob is relative to the program's factory value: 64 is
the factory program exactly, 0 and 127 the ends of the original's range (value()).
"""
import json
import math
import pathlib

KNOBS = pathlib.Path.home() / ".cache/modwerk-local/quadraverb/engine/knobs.json"
CENTRE = 64
SAMPLES_MS = 42          # the firmware's own conversion
NAMES = {1: "LEN", 2: "TIME", 3: "SPD", 4: "DEP"}


def decay_c(v):
    return math.floor(1991 * math.sin(math.pi * v / 198) + 0.5 + 1e-9)


def slopes(f, lo, hi):
    """(M below 64, M from 64): value(k) = f + floor((k - 64) M / 128), exact at 0, 64 and 127."""
    return 2 * (f - lo), -(-(hi - f) * 128 // 63)


def value(k, f, lo, hi):
    """The parameter a knob position 0-127 asks for: the factory value at 64, lo at 0 and hi at 127, linear between."""
    k = max(0, min(127, k))
    m = slopes(f, lo, hi)[k >= CENTRE]
    return f + ((k - CENTRE) * m >> 7)


def fit_hk(depth):
    """H, K with (H[x] K[s]) >> 8 == depth[s][x] for every speed s and depth x 0-98 (the firmware's curves, as run)."""
    S = X = range(99)
    H = [(depth[0][x] * 256 + 254) // 255 for x in X]
    for _ in range(4):
        K = [next(k for k in range(257) if all((H[x] * k) >> 8 == depth[s][x] for x in X)) for s in S]
        H = [next(h for h in range(256) if all((h * K[s]) >> 8 == depth[s][x] for s in S)) for x in X]
    assert all((H[x] * K[s]) >> 8 == depth[s][x] for s in S for x in X), "the depth curve is not H x K"
    return H, K


class Program:
    """One program's knobs. len_: [(steps, f, lo, hi, formula)] (decay: one group; feedback: L, then R), time_:
    [(steps, f, lo, hi, side)] (side 'L' or 'R': R follows L at its factory ratio), sweep: dict or None."""

    def __init__(self, row, tables, steps=None):
        self.row, self.p = row, row["p"]
        self.dhi = 98      # DEP's top: lower only where the stream has no room for a deeper sweep (qvcf.plans)
        P = {k: v for k, v in row["params"].items() if not v["bad"]}
        self.reverse = row["type"] == 4 and row["cfg"] in (0, 1, 4)
        self.delay_led = row["cfg"] in (2, 3) or (row["cfg"] in (0, 1) and row["delayLevel"] > row["reverbLevel"])
        g = lambda k: (P[k]["steps"], P[k]["f"], P[k]["lo"], P[k]["hi"])
        self.len_, self.time_, self.len_kind, self.time_kind = [], [], None, None
        if not self.reverse and self.delay_led and "fbL" in P:
            self.len_kind = "fb"
            self.len_ = [g("fbL") + ("fb",)] + ([g("fbR") + ("fb",)] if "fbR" in P and row["dtype"] == 1 else [])
        elif not self.reverse and not self.delay_led and "decay" in P:
            self.len_kind, self.len_ = "decay", [g("decay") + ("decay",)]
        if not self.reverse and self.delay_led and "dtimeL" in P:
            self.time_kind = "delay"
            self.time_ = [g("dtimeL") + ("L",)] + ([g("dtimeR") + ("R",)] if "dtimeR" in P and row["dtype"] == 1 else [])
        elif not self.reverse and not self.delay_led and "predelay" in P:
            self.time_kind, self.time_ = "pre", [g("predelay") + ("L",)]
        if steps:      # a tap nothing hears (no coefficient, latch or output) moves nothing: TIME is absent
            kc = {s for gr in self.len_ for s in gr[0]}
            heard = lambda s: steps[s]["c"] > 0 or s in kc or steps[s]["op"] & 4 or s in (0, 0x5F)
            self.time_ = [gr for gr in self.time_ if any(heard(s) and not steps[s]["op"] & 8 for s in gr[0])]
            self.time_kind = self.time_kind if self.time_ else None
        lfo = row.get("lfo")
        self.sweep = lfo if lfo and lfo["B"] and lfo["rateOk"] and lfo["centreOf"] in ("fixed", "depth") else None
        if self.sweep:     # the firmware takes speed and depth up to 98
            self.sweep = dict(self.sweep, s=min(self.sweep["s"], 98), d=min(self.sweep["d"], 98))
        self.R, self.H, self.K = tables

    # ---- what the knobs ask for -------------------------------------------------------------------------------
    def len_values(self, k):
        """Per LEN group its parameter value."""
        return [value(k, f, lo, hi) for _, f, lo, hi, _ in self.len_]

    def coef(self, group, v):
        return decay_c(v) if self.len_[group][4] == "decay" else 16 * v

    def time_values(self, k):
        """Per TIME group its milliseconds: L from the knob, R at L's factory ratio (rounded, within its range)."""
        if not self.time_:
            return []
        _, fL, lo, hi, _ = self.time_[0]
        L = value(k, fL, lo, hi)
        out = [L]
        for _, f, lo2, hi2, _ in self.time_[1:]:
            out.append(max(lo2, min(hi2, (L * f + fL // 2) // fL)))
        return out

    def sweep_values(self, kD, kE):
        """(speed, depth parameter, LFO rate, LFO depth, LFO centre)."""
        sw = self.sweep
        s = value(kD, sw["s"], 0, 98)
        d = value(kE, sw["d"], 0, self.dhi)
        dep = (self.H[d // sw["B"]] * self.K[s]) >> 8
        centre = sw["c0"] + dep if sw["centreOf"] == "depth" else sw["centre"]
        return s, d, self.R[s], dep, centre

    def program_at(self, steps, kB=CENTRE, kC=CENTRE):
        """The program's steps (a list of {a, c, op}) with LEN and TIME at these knobs: the firmware's words for those
        parameter values (extract_knobs.mjs holds the formulas to them)."""
        out = [dict(s) for s in steps]
        for gi, v in enumerate(self.len_values(kB)):
            for s in self.len_[gi][0]:
                out[s]["c"] = self.coef(gi, v)
        for gi, ms in enumerate(self.time_values(kC)):
            st, f = self.time_[gi][0], self.time_[gi][1]
            for s in st:
                out[s]["a"] = (steps[s]["a"] + SAMPLES_MS * (ms - f)) & 0xFFFF
        return out

    def oracle(self, kind, group, v):
        """The firmware's own field for each step of a group at parameter value v (extract_knobs.mjs, the edit page)."""
        name = {("len", "decay"): "decay", ("len", "fb"): ("fbL", "fbR")[group], ("time", "pre"): "predelay",
                ("time", "delay"): ("dtimeL", "dtimeR")[group]}[kind, self.len_kind if kind == "len" else self.time_kind]
        return self.row["params"][name]["values"][str(v)]

    # ---- the message box ----------------------------------------------------------------------------------------
    def text(self, slot, k):
        """Stock's message box line (19 characters at most) when knob slot (1-4: B-E) turns to k on this program."""
        if slot == 1:
            if not self.len_:
                return "NO DECAY ON REVERSE" if self.reverse else "NO DECAY HERE"
            v = self.len_values(k)
            return f"DECAY {v[0]}" if self.len_kind == "decay" else f"FBK {v[0]} %"
        if slot == 2:
            if not self.time_:
                return "NO PRE ON REVERSE" if self.reverse else "NO DELAY HERE" if self.delay_led else "NO PRE-DELAY HERE"
            ms = self.time_values(k)
            if self.time_kind == "pre":
                return f"PRE {ms[0]} MS"
            return f"DELAY {ms[0]} MS" if len(ms) == 1 else f"DELAY {ms[0]}/{ms[1]} MS"
        if not self.sweep:
            return "NO SWEEP HERE"
        s, d = self.sweep_values(k, CENTRE)[0], self.sweep_values(CENTRE, k)[1]
        return f"SPEED {s}" if slot == 3 else f"DEPTH {d}"


_cache = {}


def load(path=KNOBS):
    """{program: Program} and the tables (rate, H, K)."""
    key = str(path)
    if key not in _cache:
        data = json.loads(pathlib.Path(path).read_text())
        tables = (data["rate"],) + fit_hk(data["depth"])
        progs = pathlib.Path(path).with_name("programs.json")
        steps = {r["p"]: r["steps"] for r in json.loads(progs.read_text())} if progs.exists() else {}
        _cache[key] = ({r["p"]: Program(r, tables, steps.get(r["p"])) for r in data["programs"]}, tables)
        for k in _cache[key][0].values():
            k.path = pathlib.Path(path)
    return _cache[key]


def program(p, path=KNOBS):
    return load(path)[0][p]


if __name__ == "__main__":
    progs, _ = load()
    for p, k in sorted(progs.items()):
        print(f"{p:2d} {k.row['name']:15s} LEN {k.len_kind or '-':5s} TIME {k.time_kind or '-':5s} "
              f"SPD/DEP {'yes' if k.sweep else '-':3s} | " + " | ".join(k.text(s, 127) for s in range(1, 5)))
