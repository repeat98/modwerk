#!/usr/bin/env python3
"""Generate a private eight-track Shimmer stress fixture from a local project.

Reuse the stock project writer and validator. Four Shimmers occupy two slots
per core; four stock DARK REV instances keep all tracks active. This creates
input data only. A real native-port or hardware run is required to report a
passing playback, LFO, parameter-lock or ColdFire publication result.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys

SDK = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk", type=Path, default=SDK)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=SDK / "out/shimmer-stress-project")
    args = parser.parse_args()
    sdk, source, dest = args.sdk.resolve(), args.source.resolve(), args.out.resolve()
    if dest.exists():
        parser.error("output exists; choose a fresh private --out directory")
    if not (source / "project.work").is_file() or not (source / "bank01.work").is_file():
        parser.error("source needs a modern local project.work and bank01.work")
    sys.path.insert(0, str(sdk / "tools"))
    import toolpath  # noqa: F401
    import stress_project as shared
    from hw import ot_project as otp
    from remix import registry

    mods = registry.modules()
    fx = ([None] * 8,
          ["SHIMMER", "SHIMMER", "DARK REV", "DARK REV"] * 2)
    probed = (1,)
    # All six Shimmer lanes are locked, along with nine stock track lanes.
    # T2 TIME is reserved for verify_set's CC40 -> DSP publication probe.
    slots = (0, 3, 6, 7, 9, 10, 15, 16, 18, 24, 25, 26, 27, 28, 29)
    shared.lock_slots = lambda track, _: tuple(s for s in slots if track != 1 or s != 24)
    dest.mkdir(parents=True)
    for path in source.iterdir():
        if path.is_file() and path.suffix in (".work", ".strd"):
            shutil.copy2(path, dest / path.name)
    shared.set_project_text(dest)
    shared.set_markers(dest)
    for path in (dest / "project.work", dest / "project.strd"):
        raw, count = re.subn(rb"(\r?\n)MIDI_MODE=\d+", rb"\g<1>MIDI_MODE=0",
                             path.read_bytes(), count=1)
        if count != 1:
            raise AssertionError("project has no MIDI_MODE state")
        path.write_bytes(raw)

    def mutate(data, number):
        shared.mutate_bank(data, number, mods, fx, probed)
        for part in range(otp.NPARTS_ALL):
            base = otp.PART_BASE + part * otp.PART_STRIDE
            for track in range(8):
                # The shared generator targets two FX1 knobs by default.
                # All three LFOs here target active FX2 parameters instead.
                targets = (25, 26, 28) if track == 1 else (24, 25, 28)
                offset = base + otp.LFO_PM_OFF + track * 30
                data[offset:offset + 3] = bytes(targets)
                if fx[1][track] == "DARK REV":
                    # Continuous main controls at maxima; discrete/setup
                    # parameters retain their stock defaults.
                    mod = mods["DARK REV"]
                    values = otp.module_defaults(mod, {
                        i: (param.count or 128) - 1
                        for i, param in enumerate(mod.params[:6]) if param.active})
                    lane = base + otp.P1_OFF + track * otp.TRACK_STRIDE + 6
                    data[lane:lane + 6] = values[:6]
        # Explicit 0/127 lock jumps on every Shimmer control complement
        # the shared moving-control ramps and the active LFOs.
        if number == 1:
            for pattern, count in enumerate((16, 32, 64, 64)):
                for track in (0, 1, 4, 5):
                    offset = otp.trac_off(pattern, track)
                    for step in range(count):
                        record = offset + 0x59 + step * 32
                        for slot in shared.lock_slots(track, probed):
                            if 24 <= slot <= 29:
                                data[record + slot] = 127 if (step + slot) % 2 else 0

    for number in range(1, 17):
        otp._bank_write(dest, number, lambda data, n=number: mutate(data, n), guard=False)
    otp.write_stored(dest)
    trigs, locks = shared.verify(dest, mods, fx, probed)
    sample = dest / shared.SAMPLE_REL
    shared.make_sample(sample)
    for number in range(1, 17):
        for suffix in ("work", "strd"):
            data = (dest / f"bank{number:02d}.{suffix}").read_bytes()
            for part in range(otp.NPARTS_ALL):
                base = otp.PART_BASE + part * otp.PART_STRIDE
                for track in range(8):
                    offset = base + otp.LFO_PM_OFF + track * 30
                    assert all(24 <= target <= 29 for target in data[offset:offset + 3])
                    depth = base + otp.LFO_P1_OFF + track * 24 + 3
                    assert all(data[depth:depth + 3])
    report = {
        "method": "shared stress_project.py writer and validator with explicit 2-per-core layout, active FX2 LFO destinations and six Shimmer lock lanes",
        "hardware": "not tested", "nativePlayback": "not tested by fixture generation",
        "tracks": 8, "lfosPerTrack": 3, "locksPerStep": {"minimum": 14, "maximum": 15},
        "fx1": ["NONE"] * 8, "fx2": fx[1], "tempoBpm": 120,
        "patterns": ["A01: 16 dense steps", "A02: 32 dense steps", "A03: 64 dense steps", "A04: 64 steps with trigless locks"],
        "probeException": "T2 TIME stays unlocked and has no LFO so verify_set can read CC40 back",
        "bankATrigs": trigs, "bankALockBytes": locks,
        "sourceProjectSha256": shared.digest(source / "project.work"),
        "sourceBankSha256": shared.digest(source / "bank01.work"),
        "generatedSampleSha256": shared.digest(sample),
        "generatorSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "bankChecksumsAndTags": "passed on all 16 work/stored bank pairs",
    }
    (dest / "fixture.json").write_text(json.dumps(report, indent=2) + "\n")
    (dest / "STRESS_README.txt").write_text(
        shared.describe(fx, probed) + "\nAll 24 LFOs target active FX2 controls. "
        "Shimmer locks jump between 0 and 127. 15 locks/step, except T2 has 14.\n"
        "Start at A01, 120 BPM. A01–A04 exercise four Parts and dense/trigless locks.\n"
        "This generated fixture does not establish a playback or hardware result.\n")
    print(json.dumps(report, indent=2))
    print(dest)


if __name__ == "__main__":
    main()
