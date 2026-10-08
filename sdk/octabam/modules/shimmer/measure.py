#!/usr/bin/env python3
"""Measure Shimmer with existing knob, sound-quality and performance tools.

Native memory images, automation and rendered audio remain in --output.
Commands and unabridged meters are retained beside every render. The helper
never changes an untested hardware/project result into a passing record.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
from types import SimpleNamespace

from verify import FRAMES, FULL, Harness, SDK, SR, band_energy, power_spectrum


def command(h, name, cmd, cwd=None, timeout=1800):
    (h.output / f"{name}.command.json").write_text(json.dumps(list(map(str, cmd)), indent=2) + "\n")
    result = subprocess.run(list(map(str, cmd)), cwd=cwd or h.sdk,
                            capture_output=True, text=True, timeout=timeout)
    text = result.stdout + result.stderr
    (h.output / f"{name}.log").write_text(text)
    print(text, flush=True)
    return result


def knob_census(h):
    from remix import registry
    fixture = registry.fixture
    try:
        # The shared metric imports verify_onebus, whose unused build-profile
        # constant expects a full bus remix. This insert census renders its
        # own private candidate memory; no bus build or bus result is claimed.
        registry.fixture = lambda *args, **kw: "shimmer-verify"
        import verify_knob_clicks as clicks
    finally:
        registry.fixture = fixture
    h.gate("shared knob-click detector self-test", clicks.self_test())
    blocks = clicks.END + h.bench.WARM + 2
    pad = h.bench.WARM * FRAMES
    source = h.bench.raw(h.output / "knobs_tone.raw", [
        round(.3 * FULL * math.sin(2 * math.pi * 438.75 * (n - pad) / SR)) if n >= pad else 0
        for n in range(blocks * FRAMES)])
    observations = []
    for slot, p in enumerate(h.mod.params[:6]):
        name = p.name.decode()
        context = h.knobs(TIME=96, SIZE=96, PTCH=127, SHMR=64, TONE=64, MIX=127)
        def at(value):
            values = list(context)
            values[slot] = value
            return values
        def render(tag, events):
            _, audio = h.run(tag, blocks, instances=1, inputs=[source], values=events)
            return [[v / FULL for v in audio[0][c::2][pad:]] for c in (0, 1)]
        low = render(f"knob_{name}_low", [(0, at(clicks.LO))])
        high = render(f"knob_{name}_high", [(0, at(clicks.HI))])
        events = [(0, at(clicks.LO)), (h.bench.WARM + clicks.J1, at(clicks.HI)),
                  (h.bench.WARM + clicks.J2, at(clicks.LO))]
        events += [(h.bench.WARM + clicks.S0 + 2 * i, at(v))
                   for i, v in enumerate(range(clicks.LO + 1, clicks.HI + 1))]
        moving = render(f"knob_{name}_moving", events)
        metrics = clicks.measure(moving, low, high)
        passed = not clicks.flagged(metrics)
        observations.append({"knob": name, "passed": passed, "windows": metrics})
        # Save every knob, even if a previous one failed, so one run gives a
        # useful repair map. Raise only after the complete census.
        h.report["knobClicks"] = observations
        h.save()
        print(f"{'PASS' if passed else 'FAIL'} {name}: {metrics}", flush=True)
    h.gate("all six continuous controls: shared -70 dBFS knob-click criterion",
           all(row["passed"] for row in observations), observations=observations)


def sound_audit(h, tail=30, unity=False, warmup=None):
    repository = h.sdk.parents[1]
    node = shutil.which("node")
    if node is None:
        raise FileNotFoundError("Node 24 is required: nvm use")
    tool = repository / "scripts/fx-audit.mjs"
    plan_dir, render_dir = h.output / "fx-plan", h.output / "fx-renders"
    render_dir.mkdir(parents=True, exist_ok=True)
    plan_command = [node, tool, "plan", plan_dir, "--tail", str(tail)]
    if warmup is not None:
        plan_command += ["--warmup", str(warmup)]
    result = command(h, "fx-plan", plan_command)
    if result.returncode:
        raise RuntimeError("fx:audit plan failed")
    plan = json.loads((plan_dir / "plan.json").read_text())
    dearest = h.knobs(**h.mod.dear)
    if unity:
        dearest[2] = 64
    for item in [*plan["tones"], plan["idle"]]:
        name = item["file"]
        source = plan_dir / f"{name}.raw"
        blocks = math.ceil(source.stat().st_size / 4 / FRAMES)
        _, audio = h.run("fx_" + name, blocks, instances=1, inputs=[source], values=[(0, dearest)])
        h.bench.raw(render_dir / f"{name}.raw", audio[0])
    result = command(h, "fx-audit", [node, tool, "check", plan_dir, render_dir])
    h.report["fxAudit"] = {"passed": result.returncode == 0, "tailSeconds": tail,
                           "warmupSamples": plan["warmup"],
                           "knobs": {p.name.decode(): dearest[i] for i, p in enumerate(h.mod.params[:6])},
                           "method": "scripts/fx-audit.mjs, default limits; shared DSP host at dearest settings, no external modulation",
                           "log": "fx-audit.log"}
    h.save()
    h.gate("dearest settings: fx:audit aliasing, clipping, DC and idle", result.returncode == 0)


def shift_antialias(h):
    """Probe octave-up folds directly, apart from the generic harmonic mask.

    The positive control is an unfiltered rate-2 read of a sampled sine. Its
    audible fold must be detected; a quiet candidate alone proves nothing.
    Broad residual power also prevents noise from hiding behind a narrow
    suppressed fold band. All audit limits remain their default values.
    """
    blocks = math.ceil(3 * SR / FRAMES)
    nfft = 32768
    observations = []
    for nominal in (14000, 18000):
        m = round(nominal * nfft / SR)
        hz = m * SR / nfft
        folded = abs((2 * hz + SR / 2) % SR - SR / 2)
        source_values = [round(.15 * FULL * math.sin(2 * math.pi * hz * n / SR))
                         for n in range(blocks * FRAMES)]
        source = h.bench.raw(h.output / f"antialias_{nominal}.raw", source_values)
        reference = [v for sample in source_values for v in (sample, sample)]
        input_band = band_energy(reference, hz)
        control = [v for n in range(blocks * FRAMES)
                   for v in (round(.15 * FULL * math.sin(2 * math.pi * hz * 2 * n / SR)),) * 2]
        control_db = 10 * math.log10(max(band_energy(control, folded), 1e-30) / input_band)
        h.gate(f"{nominal} Hz: unfiltered rate-2 positive control exposes Nyquist fold",
               control_db > -3, inputHz=hz, foldedHz=folded, foldRelativeToInputDb=control_db)
        rows = {}
        for pitch, label in ((64, "unity"), (127, "up")):
            _, audio = h.run(f"antialias_{nominal}_{label}", blocks, instances=1, inputs=[source],
                            values=[(0, h.knobs(TIME=127, SIZE=127, PTCH=pitch,
                                               SHMR=127, TONE=127, MIX=127))])
            fold_db = 10 * math.log10(max(band_energy(audio[0], folded), 1e-30) / input_band)
            spectrum = power_spectrum(audio[0])
            # Preserve all bins except the original input carrier, its main
            # lobe, the tested folded band and DC. Other folds/sidebands remain.
            omit = set(range(5))
            for center, width in ((hz, 4 * SR / nfft), (folded, SR / 2048)):
                omit.update(range(max(0, math.floor((center - width) * nfft / SR)),
                                  min(nfft // 2, math.ceil((center + width) * nfft / SR)) + 1))
            residual = sum(value for i, value in enumerate(spectrum) if i not in omit)
            residual_db = 10 * math.log10(max(residual / (nfft * nfft * .375), 1e-30))
            rows[label] = {"foldRelativeToInputDb": fold_db,
                           "residualDbfs": residual_db, "inputHz": hz, "foldedHz": folded}
        h.gate(f"{nominal} Hz actual +12 read: fold and broad residual stay below -60",
               rows["up"]["foldRelativeToInputDb"] <= -60 and rows["up"]["residualDbfs"] <= -60,
               **rows["up"], unityComparison=rows["unity"])
        observations.append({"nominal": nominal, "positiveControlDb": control_db, **rows})
    h.report["shiftAntialias"] = observations
    h.save()


def performance(h, seconds=30, instances_per_core=4):
    h.static()
    positions = list(range(instances_per_core)) + list(range(4, 4 + instances_per_core))
    dearest = [(0, h.knobs(**h.mod.dear))]
    peaks = []
    # The constant endpoint can take a path an asynchronous sweep seldom
    # puts on every instance at once. Exercise all sixteen split positions.
    for split in range(16):
        row, _ = h.run(f"dearest_split{split}", 2048, instances=len(positions), positions=positions,
                       values=dearest, split=[split] * len(positions),
                       inputs=[h.bench.source(2048, k) for k in positions])
        peaks.append(max(c["peak_block"] for c in row["cores"]))
    blocks = max(2048, math.ceil(seconds * SR / FRAMES))
    inputs = [h.bench.source(blocks, k) for k in positions]
    tag = "stress_30s"
    row, _ = h.run(tag, blocks, instances=len(positions), positions=positions, automate=True, inputs=inputs,
                   mems=h.dirty_scalars(56300),
                   split=[[1, 3, 7, 15][k % 4] for k in positions],
                   extra=["-dirty", "56300", "-guard", "16384", "-guard-shared"])
    peaks.append(max(c["peak_block"] for c in row["cores"]))
    passed = h.guarded(tag, len(positions))
    h.report["dspStress"] = {
        "passed": passed, "seconds": blocks * FRAMES / SR,
        "instancesPerCore": instances_per_core, "guard": True, "dirty": True,
        "clobbers": 0 if passed else None, "hangs": 0 if passed else None,
        "method": "benchmark_reverbs.run: private FX2 instances on both cores, all six knobs move every block, split positions 1/3/7/15, dsp_host -guard -dirty; separate dearest fixed endpoint renders cover every split position",
        "projectLfos": "not tested by this DSP render",
        "projectParameterLocks": "not tested by this DSP render",
        "peakInstructionsPerInstanceSample": max(peaks) / FRAMES / instances_per_core,
    }
    h.save()
    h.gate(f"30 seconds: {len(positions)} moving instances with dirty init and buffer guards", passed)


def stock_benchmark(h):
    result = command(h, "stock-benchmark", [sys.executable, h.sdk / "tools/harness/benchmark_stock_dsp.py",
                                            "--blocks", "4096"])
    h.gate("shared stock DSP benchmark", result.returncode == 0)
    source = h.sdk / "out/stock_dsp_bench/results.json"
    data = json.loads(source.read_text())
    dark = next(row for row in data["table"] if row["effect"] == "DARK REV")
    # Match the stock baseline's real X:0 audio, one instance/core, unsplit
    # 4096-block sweep and explicit null-stub subtraction. The larger guarded
    # stress meter includes split calls and must not be mixed into this ratio.
    null = SimpleNamespace(key="NULL STUB", name="null", menu=SimpleNamespace(fx2_id=0),
                           params=[SimpleNamespace(default=0, active=False,
                                                   name=b"", count=128)] * 12)
    inputs = [h.bench.source(4096, k) for k in range(2)]
    args = dict(instances=2, inputs=inputs, positions=[0, 4], extra=["-audio", "0"])
    stub, _ = h.bench.run(null, h.mems, "comparator", 4096, **args)
    fixed, _ = h.run("comparator_fixed", 4096, **args)
    moving, _ = h.run("comparator_moving", 4096, automate=True, **args)
    peak = lambda row: max(core["peak_block"] for core in row["cores"])
    overhead = peak(stub)
    candidate = (max(peak(fixed), peak(moving)) - overhead) / FRAMES
    h.report["stockBenchmark"] = {"comparator": "DARK REV", "comparatorWorst": dark["worst"],
                                  "dearestWorst": max(row["worst"] for row in data["table"]),
                                  "candidateFixed": (peak(fixed) - overhead) / FRAMES,
                                  "candidateMovingWorst": (peak(moving) - overhead) / FRAMES,
                                  "candidateWorst": candidate,
                                  "ratioToDarkRev": candidate / dark["worst"],
                                  "matchedNullStubInstructionsPerBlock": overhead,
                                  "stockSha256": data["stock_sha256"],
                                  "baseline": str(source), "blocks": data["blocks"],
                                  "method": "benchmark_stock_dsp.py conventions for both: real X:0 audio, one instance on each core, 4096 blocks, unsplit, defaults with MIX127 followed by all controls moving each block, measured null-stub overhead subtracted; stock uses pristine original OS"}
    h.save()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sdk", type=Path, default=SDK)
    ap.add_argument("--stock", type=Path, default=SDK / "out/raw/section_3_MAIN_OS.bin")
    ap.add_argument("--output", type=Path, default=SDK / "out/shimmer_measure")
    ap.add_argument("--knobs", action="store_true")
    ap.add_argument("--sound", action="store_true")
    ap.add_argument("--stress", action="store_true")
    ap.add_argument("--stock-benchmark", action="store_true")
    ap.add_argument("--unity", action="store_true", help="sound-audit comparison with PTCH 64")
    ap.add_argument("--shift-aa", action="store_true", help="direct +12 Nyquist-fold and noise probes")
    ap.add_argument("--tail", type=float, default=30)
    ap.add_argument("--warmup", type=float, help="shared fx:audit tone warmup in seconds; default unchanged")
    ap.add_argument("--instances-per-core", type=int, choices=(1, 2, 3, 4), default=4)
    args = ap.parse_args()
    if not any((args.knobs, args.sound, args.stress, args.stock_benchmark, args.shift_aa)):
        ap.error("select --knobs, --sound, --stress, --stock-benchmark and/or --shift-aa")
    h = Harness(args.sdk, args.stock, args.output)
    if args.knobs:
        knob_census(h)
    if args.sound:
        sound_audit(h, args.tail, args.unity, args.warmup)
    if args.shift_aa:
        shift_antialias(h)
    if args.stress:
        performance(h, instances_per_core=args.instances_per_core)
    if args.stock_benchmark:
        stock_benchmark(h)
    h.report["complete"] = True
    h.save()


if __name__ == "__main__":
    main()
