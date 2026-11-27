#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""CX OSC LCD captures over USB (~10 s once the dev twin is up and cx-osc is trialed).

  MODWERK_DEV_SOCKET=/tmp/modwerk-share.sock python3 scripts/cx-osc-ui-capture.py \\
    --package /tmp/modwerk-dev/cx-osc.mwrm --out sdk/octatrack/modules/cx-osc/media

  --boot DIR   only when the unit is on the flashed base after a power cycle (minutes, not seconds).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
TWIN_PREFIX = "46c30886a7e8f3f6"


def env_with_socket():
    env = os.environ.copy()
    env.setdefault("MODWERK_DEV_SOCKET", "/tmp/modwerk-dev.sock")
    # device-send goes through the share socket while `serve` holds the USB link; skip unit-queue.
    env.setdefault("MODWERK_UNIT", "served")
    return env


def load_qualify():
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "octatrack_qualify", ROOT / "scripts/octatrack-qualify.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    def send(sequence):
        proc = subprocess.run(
            [sys.executable, "-B", str(ROOT / "scripts/device-send.py"), sequence],
            env=env_with_socket(),
            capture_output=True,
            text=True,
            timeout=int(os.environ.get("MODWERK_CAPTURE_STEP_TIMEOUT", "120")),
        )
        if proc.returncode:
            raise RuntimeError(sequence[:100] + ": " + (proc.stderr or proc.stdout or "")[-1500:])
        return proc.stdout

    mod.send = send
    return mod


def part_base(q, part: int) -> int:
    return q.u32(q.BANK) + 0x8ED80 + part * 6322


def base_prefix(q) -> str:
    line = q.send("state").strip().splitlines()[-1]
    # "MKII, base 46c30886a7e8f3f6…"
    for token in line.replace(",", " ").split():
        if token.startswith("base "):
            return token[5:23]
        if len(token) == 16 + len("…") and token.endswith("…"):
            return token[:16]
    if "base " in line:
        idx = line.index("base ") + 5
        return line[idx : idx + 16]
    return ""


def try_package(pkg: pathlib.Path, seconds: int) -> None:
    proc = subprocess.run(
        ["npm", "run", "device", "--", "try", str(pkg), "--seconds", str(seconds)],
        env=env_with_socket(),
        capture_output=True,
        text=True,
        timeout=seconds + 120,
        cwd=ROOT,
    )
    if proc.returncode:
        raise RuntimeError("try failed: " + (proc.stderr or proc.stdout or "")[-1500:])


def boot_twin(boot: pathlib.Path) -> None:
    proc = subprocess.run(
        [sys.executable, "-B", str(ROOT / "scripts/device-send.py"), f"boot {boot} 4096"],
        env=env_with_socket(),
        capture_output=True,
        text=True,
        timeout=420,
    )
    if proc.returncode:
        raise RuntimeError("boot failed: " + (proc.stderr or proc.stdout or "")[-1500:])
    sock = os.environ.get("MODWERK_DEV_SOCKET", "/tmp/modwerk-share.sock")
    for _ in range(90):
        if pathlib.Path(sock).exists():
            time.sleep(2)
            return
        time.sleep(2)
    raise RuntimeError("serve did not come back after boot; restart the serve loop")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", type=pathlib.Path, required=True)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    parser.add_argument("--boot", type=pathlib.Path, help="RAM-boot after power cycle only")
    parser.add_argument("--part", type=int, default=2)
    parser.add_argument("--track", type=int, default=0)
    parser.add_argument("--trial-seconds", type=int, default=600)
    parser.add_argument("--try-always", action="store_true", help="Stage cx-osc even if already on the twin")
    args = parser.parse_args()

    q = load_qualify()
    pkg = args.package.resolve()
    pkgs = [q.package(str(pkg))]
    m = pkgs[0]["machine"]
    if not m:
        raise SystemExit("Not a machine package.")

    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    loc, setup, playback = out / "ot-location.png", out / "ot-src-setup.png", out / "ot-playback.png"

    if args.boot:
        print("boot (slow path after power cycle)...", flush=True)
        boot_twin(args.boot.expanduser().resolve())
        q.send("w500 YES w300")

    inv = q.send("inventory").lower()
    if args.boot is None and "development requests" in q.send("state").lower():
        raise SystemExit("Flashed base: run once with --boot ~/Documents/modwerk-dev-twin-cxosc after power cycle.")

    q.send("YES w300")
    if args.try_always or "cx osc" not in inv and "cx-osc" not in inv:
        print("try cx-osc...", flush=True)
        try_package(pkg, args.trial_seconds)

    q.send("STOP w200 part%d w300" % args.part)
    saved = q.part_copy(q.mem(q.PART, 1)[0])
    machines = q.Machines(pkgs)
    row = 5 + next(k for k, r in enumerate(machines.rows) if r is m)
    t = args.track + 1
    q.send("T%d FUNC+SRC w300 UP*%d w100 DOWN*%d w300 png:%s" % (t, 6 + len(machines.rows), row, loc))
    machines.place(args.track, m)
    q.send("png:%s" % setup)
    q.send("T%d w80 T%d w400 png:%s" % (t, t, playback))
    if machines.row_of(q.part_copy(q.mem(q.PART, 1)[0]), args.track) != row:
        raise RuntimeError("CX OSC did not stick on T%d (see png if pick was refused)" % t)
    q.send("NO w200")
    data = pkg.read_bytes()
    sig = list(q.mem(part_base(q, args.part) + 0x3C + 30 * args.track, 3))
    prov = {
        "schema": 1,
        "module": "cx-osc",
        "captureType": "hardware",
        "firmware": "1.40C",
        "imageSha256": json.loads((ROOT / "sdk/octatrack/modules/cx-osc/evidence/local-image.json").read_text())["imageSha256"],
        "packageSha256": hashlib.sha256(data).hexdigest(),
        "track": t,
        "part": args.part,
        "machineSignature": sig,
        "screenshots": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (loc, setup, playback)},
        "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    (out / "capture-hardware.json").write_text(json.dumps(prov, indent=2) + "\n")
    q.restore_part(args.part, saved, machines)
    print("done", loc.name, setup.name, playback.name, flush=True)


if __name__ == "__main__":
    main()