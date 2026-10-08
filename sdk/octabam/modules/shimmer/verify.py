#!/usr/bin/env python3
"""Render Shimmer with the shared native assembler and DSP host.

Original OS bytes, memory images and audio stay in --output (the ignored SDK
out directory by default). This local DSP proof does not qualify the ColdFire
parameter publisher or physical hardware. DSP_HOST selects a checkout's host.
"""
from __future__ import annotations

import argparse
import cmath
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess
import sys
from types import SimpleNamespace

FOLDER = Path(__file__).resolve().parent
SDK = FOLDER.parents[1]
SR, FRAMES, FULL = 44100, 16, 8388607


class Harness:
    """Reuse the two-core benchmark's allocator, meter and raw audio format."""

    def __init__(self, sdk: Path, stock: Path, output: Path):
        self.sdk, self.stock, self.output = sdk.resolve(), stock.resolve(), output.resolve()
        self.output.mkdir(parents=True, exist_ok=True)
        if not self.stock.is_file():
            raise FileNotFoundError(f"original local MAIN OS missing: {self.stock}")
        os.chdir(self.sdk)
        sys.path.insert(0, str(self.sdk / "tools"))
        import toolpath  # noqa: F401
        import benchmark_reverbs as bench
        import send_probe
        from remix import registry
        from remix.schema import Remix

        self.bench, self.send_probe = bench, send_probe
        self.mod = registry._load_one(FOLDER / "manifest.py")
        # Select the same native profile the source-package compiler uses.
        registry.remix = lambda _: Remix(name="shimmer-verify", doc="Private DSP render.",
                                         modules=("SHIMMER",), fallback="NONE")
        import build_bus
        import cycle_count
        self.build_bus, self.cycle_count = build_bus, cycle_count
        bench.OUT = self.output
        bench.subprocess = SimpleNamespace(run=lambda command, **kw: subprocess.run(
            command, **{**kw, "timeout": 1800}))
        self.report = {
            "module": "shimmer", "moduleVersion": "0.1.0-experimental",
            "sampleRate": SR, "framesPerBlock": FRAMES,
            "units": "executed DSP instructions; not hardware cycles or utilization",
            "hardware": "not tested", "coldFireParameterPublication": "not tested",
            "complete": False, "checks": [], "loads": [],
            "sources": {name: hashlib.sha256((FOLDER / name).read_bytes()).hexdigest()
                        for name in ("engine.asm", "manifest.py", "verify.py", "measure.py")},
            "stockMainSha256": hashlib.sha256(self.stock.read_bytes()).hexdigest(),
        }
        self.base = [send_probe.dump_mem(self.stock, self.output / f"stock_{c}.mem", c)
                     for c in "AB"]
        source = (FOLDER / "engine.asm").read_text()
        table = tuple(self.mod.dsp.ptable)
        table_base = 0x2000
        if table:
            if source.count("$fab1e0") != 1:
                raise AssertionError("ptable requires exactly one relocatable literal")
            source = source.replace("$fab1e0", f"${table_base:x}")
        words, init, proc = build_bus.assemble(source, table_base + len(table), "SHIMMER")
        words = list(table) + words
        self.report["programWords"] = len(words)
        self.report["programSha256"] = hashlib.sha256(struct.pack("<" + "I" * len(words), *words)).hexdigest()
        self.mems = []
        for c, mem in enumerate(self.base):
            data = mem.read_bytes()
            if data[-9] != 255:
                raise AssertionError("invalid memory image terminator")
            body = data[:-9] + self.chunk(0, table_base, words)
            body += self.chunk(1, send_probe.INIT_TAB + self.mod.menu.fx2_id, [init])
            body += self.chunk(1, send_probe.PROC_TAB + self.mod.menu.fx2_id, [proc])
            path = self.output / f"shimmer_{c}.mem"
            path.write_bytes(body + data[-9:])
            if send_probe.entry_points(path, self.mod.menu.fx2_id) != (init, proc):
                raise AssertionError("candidate dispatch entry was not installed")
            self.mems.append(path)
        self.gate("shared assembler round-trip and both dispatch entries", True,
                  words=len(words), init=init, proc=proc)

    @staticmethod
    def chunk(space, address, data):
        return struct.pack("<BII", space, address, len(data)) + struct.pack("<" + "I" * len(data), *data)

    @staticmethod
    def word(path, space, address):
        data, offset, found = path.read_bytes(), 0, None
        while offset + 9 <= len(data):
            area, start, count = struct.unpack_from("<BII", data, offset)
            offset += 9
            if area == 255:
                break
            if area == space and start <= address < start + count:
                found = struct.unpack_from("<I", data, offset + (address - start) * 4)[0]
            offset += count * 4
        if found is None:
            raise AssertionError(f"missing memory word {space}:{address:x}")
        return found

    def save(self):
        (self.output / "report.json").write_text(json.dumps(self.report, indent=2) + "\n")

    def gate(self, name, ok, **detail):
        self.report["checks"].append({"name": name, "passed": bool(ok), **detail})
        self.save()
        print(("PASS " if ok else "FAIL ") + name + " " + json.dumps(detail), flush=True)
        if not ok:
            raise AssertionError(name)

    def knobs(self, **values):
        result = [p.default or 0 for p in self.mod.params]
        for name, value in values.items():
            result[self.mod.knob_map_all()[name]] = value
        return result

    def run(self, tag, blocks, *, values=None, mems=None, **kw):
        original_knobs = self.bench.knobs
        if values is not None:
            count = kw.get("instances", 8)
            extra = list(kw.pop("extra", ()))
            for n in range(count):
                path = self.output / f"{tag}_p{n}.csv"
                path.write_text("".join(",".join(map(str, [b, *p])) + "\n" for b, p in values))
                extra += ["-paramfile", str(path)]
            kw["extra"] = extra
            # benchmark_reverbs intentionally initializes MIX at 127. A dry
            # arithmetic test must instead initialize at its actual supplied
            # parameters; changing MIX after init would test an active ramp.
            initial = next((p for b, p in values if b == 0), self.knobs())
            self.bench.knobs = lambda mod, block=None, instance=0: (
                list(initial) if block is None else original_knobs(mod, block, instance))
        try:
            row, audio = self.bench.run(self.mod, mems or self.mems, tag, blocks, **kw)
        finally:
            self.bench.knobs = original_knobs
        self.report["loads"].append(row)
        self.save()
        return row, audio

    def guarded(self, tag, expected):
        text = (self.output / f"shimmer_{tag}.log").read_text()
        return text.count("0 stray write regions, 0 CLOBBERING") == expected and "HANG" not in text

    def dirty_scalars(self, fill):
        result = []
        for c, mem in enumerate(self.mems):
            data = mem.read_bytes()
            body = data[:-9]
            for k in range(4):
                body += self.chunk(1, 0x6200 + k * 0x300, [fill] * 0x100)
                # -dirty seeds only Y:1000..BFFF. The third and fourth
                # allocator-owned FX2 rings are in the shared window, so
                # explicitly seed the actual published buffer base as well.
                base = self.word(mem, 1, 0x255 + 1 + k * 2)
                body += self.chunk(2, base, [fill] * 16384)
            path = self.output / f"dirty_{fill:x}_{c}.mem"
            path.write_bytes(body + data[-9:])
            result.append(path)
        return result

    def static(self):
        cc = self.cycle_count
        cc._ASM["engine"] = FOLDER / "engine.asm"
        result = cc.measure("engine")
        self.gate("static cycle markers preserve assembled bytes", cc.verify("engine", result))
        self.report["static"] = {k: result[k] for k in ("words", "cycles", "total_words", "loop_end")}
        self.save()
        return result


def band_energy(stereo, hz, *, details=False):
    """Energy within one grain-hop sideband of a tone, without FFT libraries.

    The two finite 4096-sample grains overlap at 2048 samples. A steady tone
    therefore has sidebands spaced by SR/2048, and its strongest component
    can sit off the nominal shifted tone. Exact read speed is checked from
    phase arithmetic separately; this band proves actual shifted wet audio.
    """
    channels = [stereo[::2], stereo[1::2]]
    n = min(32768, min(map(len, channels)))
    if n < 4096:
        raise AssertionError("spectral observation is too short")
    energies, bins = [], {}
    half_width = math.ceil((SR / 2048) / (SR / n))
    for channel in channels:
        x = channel[-n:]
        energy = 0.0
        for delta in range(-half_width, half_width + 1):
            w = 2 * math.pi * (hz + delta * SR / n) / SR
            coefficient = 2 * math.cos(w)
            a = b = 0.0
            for i, sample in enumerate(x):
                value = sample / FULL * (0.5 - 0.5 * math.cos(2 * math.pi * i / (n - 1)))
                c = value + coefficient * a - b
                b, a = a, c
            power = (a * a + b * b - coefficient * a * b) / (n * n)
            energy += power
            bins[delta] = bins.get(delta, 0) + power
        energies.append(energy)
    total = sum(energies)
    if details:
        return total, hz + max(bins, key=bins.get) * SR / n
    return total


def power_spectrum(stereo):
    """Stereo summed FFT powers; no optional Python packages are required."""
    n = 32768
    powers = [0.0] * (n // 2 + 1)
    for channel in (stereo[::2], stereo[1::2]):
        if len(channel) < n:
            raise AssertionError("not enough audio for an octave FFT")
        data = [complex(v / FULL * (.5 - .5 * math.cos(2 * math.pi * i / (n - 1))))
                for i, v in enumerate(channel[-n:])]
        j = 0
        for i in range(1, n):
            bit = n >> 1
            while j & bit:
                j ^= bit
                bit >>= 1
            j ^= bit
            if i < j:
                data[i], data[j] = data[j], data[i]
        size = 2
        while size <= n:
            half = size // 2
            step = cmath.exp(-2j * math.pi / size)
            for start in range(0, n, size):
                phase = 1 + 0j
                for k in range(half):
                    a, b = start + k, start + k + half
                    value = data[b] * phase
                    data[b], data[a] = data[a] - value, data[a] + value
                    phase *= step
            size *= 2
        for i in range(len(powers)):
            powers[i] += abs(data[i]) ** 2
    return powers


def strongest_component(stereo, nominal):
    """Find the strongest FFT bin in a broad +/-25% octave region.

    The search is deliberately wider than the geometry-derived acceptance
    band, so a wrong read speed cannot pass merely by leaking into that band.
    """
    n = 32768
    powers = power_spectrum(stereo)
    lo = max(1, math.floor(nominal * .75 * n / SR))
    hi = min(n // 2, math.ceil(nominal * 1.25 * n / SR))
    return max(range(lo, hi + 1), key=powers.__getitem__) * SR / n


def behavior(h: Harness):
    names = [p.name.decode() for p in h.mod.params[:6]]
    h.gate("approved MAIN parameter layout", names == ["TIME", "SIZE", "PTCH", "SHMR", "TONE", "MIX"])
    h.gate("all six drawn parameters are continuous and defaults are valid",
           all(p.active and p.count == 128 and 0 <= p.default < 128 for p in h.mod.params[:6]))
    table = tuple(h.mod.dsp.ptable)
    signed = lambda value: (value ^ 0x800000) - 0x800000
    h.gate("original pitch table pins octave down, unity and octave up",
           len(table) == 33 and signed(table[0]) == 524288 and table[16] == 0
           and signed(table[32]) == -1048576)
    h.static()
    # Independent channels include full-scale signs and low-bit arithmetic.
    blocks = 1024
    stereo = []
    for n in range(blocks * FRAMES):
        left = [-8388608, -8388607, -1, 0, 1, 8388607][n % 6]
        right = ((n * 7919) % 16777216) - 8388608
        stereo.extend((left, right))
    source = h.bench.raw(h.output / "signed_stereo.raw", stereo)
    for position in (0, 4):
        for split in (0, 1, 7, 15):
            _, audio = h.run(f"dry_{position}_{split}", blocks, instances=1, positions=[position],
                             inputs=[source], values=[(0, h.knobs())], split=[split], extra=["-stereo"])
            h.gate(f"MIX 0 exact signed stereo, core {position // 4}, split {split}", list(audio[0]) == stereo)
    # A restored/corrupt project can stamp this FX2-only id into FX1. Test
    # the real four small stock allocations on both original DSP payloads.
    # A zero-word guard permits no Y writes, even inside the FX1 allocation;
    # dirty Y makes an accidental clearing store observable.
    fx1_bases = [[h.word(mem, 1, 0x255 + 2 * k) for k in range(4)] for mem in h.mems]
    h.gate("original FX1 allocator bases match the guarded small-buffer pattern",
           fx1_bases == [[0x1000, 0x1c00, 0x2800, 0x3400]] * 2,
           bases=fx1_bases)
    for split in (0, 1, 7, 15):
        tag = f"fx1_guard_split{split}"
        _, audio = h.run(tag, 512, instances=8, automate=True,
                         inputs=[source] * 8, split=[split] * 8,
                         extra=["-stereo", "-alloc", "0,2,4,6,0,2,4,6",
                                "-r7", "1,4,7,10,1,4,7,10", "-dirty", "1234",
                                "-guard", "0", "-guard-shared"])
        expected = stereo[:512 * FRAMES * 2]
        h.gate(f"FX1 allocator guard: all eight small buffers stay exactly dry, split {split}",
               all(list(track) == expected for track in audio) and h.guarded(tag, 8),
               bufferWordsPermittedToChange=0, dirtyY=True, movingControls=6)
    # A steady DC input makes a dry-to-empty-wet initialization discontinuity
    # visible without a sine's own sample-to-sample slope. Loaded MIX 127
    # must fade into the cleared wet path rather than dropping the dry level.
    dc = FULL // 4
    constant = h.bench.raw(h.output / "enable_constant.raw", [dc] * (512 * FRAMES))
    for position in (0, 4):
        _, audio = h.run(f"enable_wet_{position}", 512, instances=1, positions=[position],
                        inputs=[constant], values=[(0, h.knobs(MIX=127))])
        boundary = 128 * FRAMES
        jump = max(abs(channel[n] - channel[n - 1])
                   for channel in (audio[0][::2], audio[0][1::2])
                   for n in range(boundary - FRAMES, boundary + 256))
        h.gate(f"loaded wet effect, core {position // 4}: clearing-to-active fade has no dry drop",
               jump / FULL < .002 and abs(audio[0][(boundary - 1) * 2] - dc) <= 1,
               maxSampleJumpDbfs=20 * math.log10(max(jump / FULL, 1e-30)),
               maximumAllowedJumpDbfs=20 * math.log10(.002),
               clearingSamples=boundary)
    for fill in (0x7fffff, 0x5a5a5a):
        tag = f"dirty_silence_{fill:x}"
        _, audio = h.run(tag, 2048, mems=h.dirty_scalars(fill), automate=True, mask=0,
                         extra=["-dirty", str(fill), "-guard", "16384", "-guard-shared"])
        h.gate(f"dirty scalar and Y silence at {fill:x}: eight instances stay silent",
               not any(v for channel in audio for v in channel) and h.guarded(tag, 8))
    onset = h.bench.raw(h.output / "dirty_onset_tone.raw", [
        round(.25 * FULL * math.sin(2 * math.pi * 438.75 * n / SR))
        for n in range(2048 * FRAMES)])
    settings = [(0, h.knobs(MIX=127))]
    _, clean = h.run("clean_onset", 2048, instances=1, inputs=[onset], values=settings)
    for fill in (0x7fffff, 0x5a5a5a):
        _, dirty = h.run(f"dirty_onset_{fill:x}", 2048, instances=1, inputs=[onset],
                        values=settings, mems=h.dirty_scalars(fill), extra=["-dirty", str(fill)])
        h.gate(f"dirty gain and filter histories at {fill:x}: active onset equals clean init",
               dirty[0] == clean[0])
    blocks, splits = 2048, [1, 3, 7, 15, 15, 7, 3, 1]
    inputs = [h.bench.source(blocks, k) for k in range(8)]
    _, together = h.run("eight_moving", blocks, automate=True, inputs=inputs, split=splits,
                        extra=["-guard", "16384", "-guard-shared"])
    h.gate("eight moving instances respect private, shared and program bounds", h.guarded("eight_moving", 8))
    for k in range(8):
        _, solo = h.run(f"solo_{k}", blocks, instances=1, positions=[k], automate=True,
                       inputs=[inputs[k]], split=[splits[k]])
        h.gate(f"instance {k}: simultaneous output equals isolated output", together[k] == solo[0])
    _, skew = h.run("skew", blocks, automate=True, inputs=inputs, split=splits, extra=["-skew", "97"])
    h.gate("core interleaving preserves all eight outputs", skew == together)
    for k in (0, 3, 4, 7):
        _, audio = h.run(f"onehot_{k}", blocks, automate=True, mask=1 << k, inputs=inputs)
        h.gate(f"instance {k}: only the excited instance produces audio",
               any(audio[k]) and not any(v for j, channel in enumerate(audio) if j != k for v in channel))
    # Measure an actual wet octave, not only a pitch coefficient table.
    blocks = math.ceil(3 * SR / FRAMES)
    fundamental = 438.75
    samples = [round(.15 * FULL * math.sin(2 * math.pi * fundamental * n / SR))
               if n >= 8192 else 0 for n in range(blocks * FRAMES)]
    source = h.bench.raw(h.output / "pitch_tone.raw", samples)
    _, plain = h.run("pitch_plain", blocks, instances=1, inputs=[source],
                     values=[(0, h.knobs(TIME=96, SIZE=96, PTCH=64, SHMR=0, TONE=64, MIX=127))])
    observations = {}
    for pitch, ratio in ((0, .5), (64, 1), (127, 2)):
        trace = h.output / f"pitch_{pitch}_states.txt"
        row, audio = h.run(f"pitch_{pitch}", blocks, instances=1, inputs=[source],
                          values=[(0, h.knobs(TIME=96, SIZE=96, PTCH=pitch, SHMR=127, TONE=64, MIX=127))],
                          extra=["-track", "26,2c,3c", "-trackout", str(trace)])
        states = [[int(value) for value in line.split()] for line in trace.read_text().splitlines()][-64:]
        increment = {0: 524288, 64: 0, 127: -1048576}[pitch]
        step = (increment // 256 * FRAMES) & 0x7fffff
        h.gate(f"PTCH {pitch}: settled target, current and exact grain read speed",
               all(row[1] == (increment & 0xffffff) and row[2] == (increment & 0xffffff) for row in states)
               and all((b[3] - a[3]) & 0x7fffff == step for a, b in zip(states, states[1:])),
               phaseStepPerBlock=step)
        shifted = band_energy(audio[0], fundamental * ratio)
        peak = strongest_component(audio[0], fundamental * ratio)
        h.gate(f"PTCH {pitch}: strongest shifted component matches grain-window bounds",
               abs(peak - fundamental * ratio) <= SR / 2048 + SR / 32768,
               nominalHz=fundamental * ratio, strongestHz=peak,
               halfWidthHz=SR / 2048, fftBinHz=SR / 32768)
        unshifted = band_energy(plain[0], fundamental * ratio)
        gain = 10 * math.log10(max(shifted, 1e-30) / max(unshifted, 1e-30))
        observations[str(pitch)] = {"expectedRatio": ratio, "bandGainOverPlainDb": gain,
                                   "bandDb": 10 * math.log10(max(shifted, 1e-30)),
                                   "strongestComponentHz": peak, "halfWidthHz": SR / 2048,
                                   "centsFromNominal": 1200 * math.log2(peak / (fundamental * ratio))}
        h.gate(f"PTCH {pitch}: actual wet {'unity' if pitch == 64 else 'octave'} energy",
               shifted > 1e-10 and (pitch == 64 or gain > 10) and row["clipped_samples"] == 0,
               **observations[str(pitch)])
    h.report["pitchObservations"] = observations
    h.report["complete"] = True
    h.save()


def parser():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sdk", type=Path, default=SDK)
    ap.add_argument("--stock", type=Path, default=SDK / "out/raw/section_3_MAIN_OS.bin")
    ap.add_argument("--output", type=Path, default=SDK / "out/shimmer_verify")
    return ap


def main():
    args = parser().parse_args()
    behavior(Harness(args.sdk, args.stock, args.output))


if __name__ == "__main__":
    main()
