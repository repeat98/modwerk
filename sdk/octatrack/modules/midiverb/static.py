"""Midiverb's static bound: executed instructions a sample for each program, counted from engine.asm, not run.

Each handler's longest path (every conditional add taken), k read pairs before a unit's operation 2k, over the
program's units, plus frame B (its prologue stores the input), frame A (the input average and the interpolated
output), END and MIX while a fade runs, averaged over the two frames of a program sample (the program runs every
second frame). An LFO program adds its tick every program sample and its LFO update (mvqLFOU, its longest path) once
every eighth. Per-call work (the stream's loader, the ring clear, the loop's set-up) is outside the sample loop and
left out; dsp_host's meter counts it (verify.py, stress.py). The counts follow engine.asm as written: change them
with it.
"""
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
HANDLERS = ["run", "st", "stc", "stn", "stnc", "outR", "outRc", "outL", "outLc", "end", "tick", "sh"]
SLOT, READS = 24, 7
COST = {"run": 3, "st": 7, "stc": 7, "stn": 8, "stnc": 8, "outR": 6, "outRc": 6, "outL": 6, "outLc": 6, "end": 4,
        "tick": 7, "sh": 4}
FRAME_A, FRAME_B, MIX = 21, 33, 18
# The update's longest path, the tick's taken branch and the next unit's fetch included, for two triangles (mode 0)
# or two sines (1, 2): the tick's due part 4, mvqLFOU 11, each LFO (53 a triangle, 104 a sine), the end 14.
UPDATE = {0: 135, 1: 237, 2: 237}


def units(words):
    """The executed instructions of one program sample's units (words[0] the header, words[1] the input's offset)."""
    i, total = 2, 0
    while True:
        kind = HANDLERS[words[i] // SLOT]
        k = 0 if kind in ("end", "tick") else READS - (words[i] % SLOT) // 2
        total += 2 * k + COST[kind]
        i += 1 + k + (0 if kind in ("run", "end") else 1)
        if kind == "end":
            return total


def lfo(words):
    """An LFO program's update, less the tick it replaces, a program sample (one in eight)."""
    if HANDLERS[words[2] // SLOT] != "tick":
        return 0
    return (UPDATE[words[1 + words[3]]] - 4 - COST["tick"]) / 8


def sample_cost(words):
    return ((FRAME_A + MIX) + (FRAME_B + units(words) + lfo(words) + MIX)) / 2


def main():
    programs = json.loads((HERE / "programs.json").read_text())["programs"]
    rows = sorted((sample_cost(p["words"]), p["bank"], p["number"]) for p in programs)
    per, bank, number = rows[-1]
    print(f"static: {per:.1f} executed instructions a sample at most, {bank} #{number}; 4 a core: {4 * per:.1f} of 3,120")
    lfos = [r for r in rows if r[1] == "MV2" and 50 <= r[2] <= 69]
    if lfos:
        print(f"  the chorus and flange programs: {lfos[0][0]:.1f} to {lfos[-1][0]:.1f}")


if __name__ == "__main__":
    main()
