"""Midiverb's static bound: executed instructions a sample for each program, counted from engine.asm, not run.

Each handler's longest path (every conditional add taken), k read pairs before a unit's operation 2k, over the
program's units, plus frame B (its prologue stores the input), frame A (the input average and the interpolated
output), END and MIX while a fade runs, averaged over the two frames of a program sample (the program runs every
second frame). Per-call work (the stream's loader, the ring clear, the loop's set-up) is outside the sample loop and
left out; dsp_host's meter counts it (verify.py, stress.py). The counts follow engine.asm as written: change them
with it.
"""
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
HANDLERS = ["run", "st", "stc", "stn", "stnc", "outR", "outRc", "outL", "outLc", "end"]
SLOT, READS = 24, 7
COST = {"run": 3, "st": 8, "stc": 8, "stn": 9, "stnc": 9, "outR": 6, "outRc": 6, "outL": 6, "outLc": 6, "end": 4}
FRAME_A, FRAME_B, MIX = 21, 34, 18


def units(words):
    """The executed instructions of one program sample's units (words[0] the header, words[1] the input's offset)."""
    i, total = 2, 0
    while True:
        kind = HANDLERS[words[i] // SLOT]
        k = 0 if kind == "end" else READS - (words[i] % SLOT) // 2
        total += 2 * k + COST[kind]
        i += 1 + k + (0 if kind in ("run", "end") else 1)
        if kind == "end":
            return total


def sample_cost(words):
    return ((FRAME_A + MIX) + (FRAME_B + units(words) + MIX)) / 2


def main():
    programs = json.loads((HERE / "programs.json").read_text())["programs"]
    rows = sorted((sample_cost(p["words"]), p["bank"], p["number"]) for p in programs)
    per, bank, number = rows[-1]
    print(f"static: {per:.1f} executed instructions a sample at most, {bank} #{number}; 4 a core: {4 * per:.1f} of 3,120")


if __name__ == "__main__":
    main()
