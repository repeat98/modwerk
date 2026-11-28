#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""CX OSC hardware load/stress (optimization-PR style): fixed knob presets, N instances, readback.

Requires `npm run device -- serve` and a cx-osc trial already accepted or rolling (device:test /
device:qualify). Transport stopped, Part working copy equals saved (docs/OCTATRACK_DRIVING.md).
Trigs on every track you will use.

  npm run device:cx-stress -- [--socket PATH] [--out FILE.json] [--preset NAME|all]

Presets live in sdk/octatrack/modules/cx-osc/load-scenarios.json. The script places CX OSC on T1..TN,
drives PLAYBACK then SRC SETUP (capture-plan.json) to the preset bytes, verifies Part readback,
plays for 8 s, and records stats, gap, guarded render peaks and refusals. Part reload at the end."""
from __future__ import annotations

import argparse
import datetime
import importlib.util
import json
import os
import pathlib
import re
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCENARIOS = ROOT / "sdk/octatrack/modules/cx-osc/load-scenarios.json"
FRAME_US = 362.8
PATTERN_STRIDE = 0x8ED8
TRACK_STRIDE = 0x91A
# CX machine column in the Part (machine.s PB_OFF 0x8edaa, SETUP_GAP 0x1b0).
PB_OFF, SETUP_GAP = 0x2A, 0x1B0


def load_qualify():
    spec = importlib.util.spec_from_file_location("octatrack_qualify", ROOT / "scripts/octatrack-qualify.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    timeout = int(os.environ.get("MODWERK_QUALIFY_TIMEOUT", "180"))

    def send(sequence):
        mod.log(">", sequence)
        s = mod.session_socket(mod.SOCKET)
        s.settimeout(timeout)
        s.connect(mod.session_address(mod.SOCKET))
        s.sendall((sequence + "\n").encode())
        reply = s.makefile().read()
        if "error:" in reply:
            raise RuntimeError(sequence + ": " + reply.strip())
        return reply

    mod.send = send
    return mod


def part_base(q, part: int) -> int:
    return q.u32(q.BANK) + 0x8ED80 + part * 6322


def pattern_index(q):
    return q.mem(0x800065BD, 2)[1]


def track_trig_steps(q, track: int) -> list[int]:
    """Steps 1-16 with a trig on this track in the current pattern (audio mask, first 16 bytes)."""
    pat = pattern_index(q)
    base = q.u32(q.BANK) + pat * PATTERN_STRIDE + 0x6 + track * TRACK_STRIDE
    mask = q.mem(base, 16)
    steps = []
    for step in range(16):
        if mask[step]:
            steps.append(step + 1)
    return steps


def require_trigs(q, tracks: list[int]) -> None:
    missing = {t + 1: track_trig_steps(q, t) for t in tracks if not track_trig_steps(q, t)}
    if missing:
        raise RuntimeError(
            "CX OSC renders only on pattern trigs: no trigs on "
            + ", ".join("T%d" % t for t in missing)
            + ". Use a pattern with trigs on every stressed track (steps 1/5/9/13 is enough), or --arm-trigs."
        )


def arm_trigs(q, tracks: list[int]) -> None:
    """Grid record: per track, REC on, TRIG 1/5/9/13, REC off (OCTATRACK_DRIVING.md)."""
    q.send("STOP w300 PATTERN w400")
    for track in tracks:
        t = track + 1
        steps = " ".join("TRIG%d w80" % s for s in (1, 5, 9, 13))
        q.send("T%d w300 REC w400 %s REC w300" % (t, steps))


def playback_offset(q, part: int, track: int) -> int:
    base = part_base(q, part)
    mach = q.mem(base + 0x22 + track, 1)[0]
    return PB_OFF + 6 * mach + 30 * track


def open_playback(q, track: int) -> None:
    """USB has no PLAYBACK key: double-tap the track (OCTATRACK_DRIVING.md machine list)."""
    t = track + 1
    q.send("T%d w80 T%d w400" % (t, t))


def open_setup(q, track: int) -> None:
    t = track + 1
    q.send("T%d FUNC+SRC w500" % t)


def track_params(q, part: int, track: int) -> dict:
    base = part_base(q, part)
    off = playback_offset(q, part, track)
    return {
        "playback": list(q.mem(base + off, 6)),
        "setup": list(q.mem(base + off + SETUP_GAP, 6)),
        "sig": list(q.mem(base + 0x3C + 30 * track, 3)),
        "machine": q.mem(base + 0x22 + track, 1)[0],
    }


def gap_us(q) -> int:
    return int(re.search(r"gap (\d+) counts", q.send("gap")).group(1)) // 132


def cpu_settle(q, seconds: int) -> None:
    """Quiet the mean cpu_played judgment before placing many CX instances (status.c)."""
    if seconds <= 0:
        return
    q.send("reload w400")
    q.send("PLAY w%d STOP w1000" % (seconds * 1000))


def enc_sweep(enc: str, steps: int, sign: str = "+") -> str:
    return " ".join("enc%s%s16 w80" % (enc, sign) for _ in range(max(1, steps)))


def drive_byte(q, t: int, enc: str, current: int, target: int) -> None:
    diff = target - current
    if diff == 0:
        return
    sign = "+" if diff > 0 else "-"
    q.send(enc_sweep(enc, (abs(diff) + 15) // 16, sign))


def apply_preset(q, machines, m, part: int, track: int, preset: dict) -> dict:
    """Place CX on `track`, encoder-sweep to `preset`, return readback + deltas."""
    pb = preset["playback"]
    sb = preset["setup"]
    machines.place(track, m)
    time.sleep(0.4)
    init = track_params(q, part, track)
    t = track + 1
    deltas = []
    open_playback(q, track)
    for enc, target, current in zip("ABCDEF", pb, init["playback"]):
        drive_byte(q, t, enc, current, target)
        if target != current:
            deltas.append(dict(page="playback", enc=enc, from_=current, to=target))
    open_setup(q, track)
    init = track_params(q, part, track)
    for enc, target, current in zip("ABCDEF", sb, init["setup"]):
        drive_byte(q, t, enc, current, target)
        if target != current:
            deltas.append(dict(page="setup", enc=enc, from_=current, to=target))
    q.send("NO w200")
    readback = track_params(q, part, track)
    mismatch = []
    for key, want in (("playback", pb), ("setup", sb)):
        got = readback[key]
        for i, (g, w) in enumerate(zip(got, want)):
            if abs(g - w) > 2:
                mismatch.append("%s[%d]=%d want %d" % (key, i, g, w))
    return dict(deltas=deltas, readback=readback, mismatch=mismatch)


def run_case(q, machines, m, part: int, preset_name: str, preset: dict, n: int, seconds: int, cap: int) -> dict:
    case = dict(preset=preset_name, instances=n, label=preset.get("label", preset_name),
                playback=list(preset["playback"]), setup=list(preset["setup"]))
    placed, failures = [], []
    for track in range(n):
        try:
            cfg = apply_preset(q, machines, m, part, track, preset)
            placed.append(dict(track=track + 1, **cfg))
            if cfg["mismatch"]:
                failures.append("T%d params: %s" % (track + 1, "; ".join(cfg["mismatch"])))
        except RuntimeError as e:
            failures.append("T%d: %s" % (track + 1, e))
            break
    refused = None
    if n == cap and cap < 8 and len(placed) == n:
        try:
            apply_preset(q, machines, m, part, n, preset)
            failures.append("T%d admitted past the %d-track cap" % (n + 1, cap))
        except RuntimeError as e:
            refused = str(e)
    q.send("gap")
    q.send("PLAY w500")
    stats = q.meters(max(2, seconds // 2))
    mean_irq = None
    try:
        q.send("w%d guard" % max(2000, seconds * 1000 - 2500))
        readings = re.findall(r"in the frame interrupt ([\d.]+) % over (\d+) frames", q.send("guard"))
        if readings and int(readings[-1][1]):
            mean_irq = float(readings[-1][0])
            stats["frame_interrupt_mean_percent"] = round(mean_irq, 1)
    except (RuntimeError, ValueError):
        pass
    peaks = q.renders()
    longest = gap_us(q)
    q.send("STOP w500")
    case.update(
        placed=placed,
        refused_next_track=refused,
        stats=stats,
        guarded_render_peak_percent=peaks,
        longest_frame_us=longest,
        past_frame_budget=longest > FRAME_US * 1.05,
        failures=failures,
        ok=not failures,
    )
    return case


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--socket", default=os.environ.get("MODWERK_DEV_SOCKET", "/tmp/modwerk-dev.sock"),
                    help="device serve socket (same as npm run device -- serve)")
    ap.add_argument("--out", type=pathlib.Path, default=ROOT / "sdk/octatrack/modules/cx-osc/evidence/stress-hardware.json")
    ap.add_argument("--preset", default="all", help="preset key or all")
    ap.add_argument("--seconds", type=int, default=0, help="override measureSecondsPlaying")
    ap.add_argument("mwrm", nargs="?", help="cx-osc.mwrm (default: newest under $TMPDIR/modwerk-dev/)")
    ap.add_argument("--counts", help="override instance sweep, e.g. 1,2,4")
    ap.add_argument("--arm-trigs", action="store_true", help="toggle trigs on steps 1-16 for each stressed track (mutates the pattern)")
    ap.add_argument("--cpu-settle", type=int, default=12,
                    help="seconds of PLAY on a clean Part before n>=4 (0 = skip; default 12)")
    args = ap.parse_args()
    os.environ["MODWERK_DEV_SOCKET"] = args.socket
    q = load_qualify()
    if "stopped" not in q.send("state"):
        raise SystemExit("Stop the transport first.")
    if not q.part_saved_equal():
        raise SystemExit("Save the Part first (working must match saved).")
    doc = json.loads(SCENARIOS.read_text())
    pkg_path = pathlib.Path(args.mwrm) if args.mwrm else None
    if not pkg_path or not pkg_path.is_file():
        candidates = sorted(pathlib.Path(os.environ.get("TMPDIR", "/tmp")).glob("modwerk-dev/cx-osc.mwrm"),
                            key=lambda p: p.stat().st_mtime, reverse=True)
        pkg_path = candidates[0] if candidates else None
    if not pkg_path or not pkg_path.is_file():
        raise SystemExit("Pass cx-osc.mwrm or build one (npm run module:dev -- cx-osc --build-only).")
    pkgs = [q.package(str(pkg_path))]
    if not any(p["machine"] for p in pkgs):
        raise SystemExit("Not a machine package.")
    machines = q.Machines(pkgs)
    m = pkgs[0]["machine"]
    if not m:
        raise SystemExit("Not a machine package.")
    part = q.mem(q.PART, 1)[0]
    saved = q.part_copy(part, saved=True)
    q.save_part(part, saved)
    seconds = args.seconds or doc.get("measureSecondsPlaying", 8)
    names = doc["instanceCounts"].keys() if args.preset == "all" else [args.preset]
    for name in names:
        if name not in doc["presets"]:
            raise SystemExit("Unknown preset %s" % name)
    pattern_before = None
    if args.arm_trigs:
        pat = pattern_index(q)
        pattern_before = q.mem(q.u32(q.BANK) + pat * PATTERN_STRIDE, PATTERN_STRIDE)
    result = dict(
        schema="cx-osc-stress-run-v1",
        module="cx-osc",
        date=datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat(),
        frameUsNominal=doc["frameUsNominal"],
        package=pkgs[0]["sha256"],
        socket=args.socket,
        scenarios=[],
    )
    try:
        for preset_name in names:
            preset = doc["presets"][preset_name]
            counts = ([int(x) for x in args.counts.split(",")] if args.counts
                      else doc["instanceCounts"][preset_name])
            cap = (doc["morphHeavyMaxTracks"] if preset_name == "morph_heavy_all"
                   else doc["mlFmMax"])
            for n in counts:
                q.send("reload w400")
                if n >= 4:
                    cpu_settle(q, args.cpu_settle)
                else:
                    q.send("PLAY w5000 STOP w500")
                tracks = list(range(n))
                if args.arm_trigs:
                    arm_trigs(q, tracks)
                else:
                    require_trigs(q, tracks)
                case = run_case(q, machines, m, part, preset_name, preset, n, seconds, cap)
                case["trig_steps"] = {t + 1: track_trig_steps(q, t) for t in tracks}
                result["scenarios"].append(case)
                print(json.dumps(case, indent=1), file=sys.stderr)
    finally:
        q.send("STOP w300")
        q.restore_part(part, saved, machines)
        if pattern_before is not None:
            pat = pattern_index(q)
            # Pattern bytes are not restored by Part reload; re-arm is optional recovery only.
            pass
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=1))
    bad = [c for c in result["scenarios"] if c.get("failures") or c.get("past_frame_budget")]
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()