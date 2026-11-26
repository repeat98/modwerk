"""Midiverb's static bound: executed instructions a sample for each program, counted from engine.asm, not run.

Each handler's longest path (every conditional add taken), a run of k reads 6 + 2k, over the program's units, plus
frame B's prologue and phase test, frame A (the input average and the interpolated output), and MIX while a fade
runs, averaged over the two frames of a program sample (the program runs every second frame). Per-call work (the
stream's loader, the ring clear) is outside the sample loop and left out; dsp_host's meter counts it (verify.py,
stress.py). The counts follow engine.asm as written: change them with it.
"""
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
HANDLERS = ["run", "st", "ld", "stn", "in", "outR", "outL", "stR", "stL", "stnR", "stnL", "end"]
SLOT = 16
COST = {"st": 9, "ld": 4, "stn": 10, "in": 5, "outR": 6, "outL": 6, "stR": 15, "stL": 15, "stnR": 18, "stnL": 18, "end": 13}
FRAME_A, FRAME_B, MIX = 21, 33, 24


def units(words):
    i, total = 1, 0
    while True:
        kind, arg = HANDLERS[words[i] // SLOT], words[i + 1]
        i += 2
        if kind == "run":
            total += 6 + 2 * arg
            i += arg
        else:
            total += COST[kind]
        if kind == "end":
            return total


def main():
    programs = json.loads((HERE / "programs.json").read_text())["programs"]
    rows = sorted((((FRAME_A + MIX) + (FRAME_B + units(p["words"]) + MIX)) / 2, p["bank"], p["number"]) for p in programs)
    per, bank, number = rows[-1]
    print(f"static: {per:.1f} executed instructions a sample at most, {bank} #{number}; 4 a core: {4 * per:.1f} of 3,120")


if __name__ == "__main__":
    main()
