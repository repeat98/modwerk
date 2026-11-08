# Deja Vu 0.1.0: hardware record

Owner's Octatrack MKII, OS 1.40C, 24 October 2026. Driven over USB by the coding agent with `npm run device -- serve` and `scripts/device-send.py`, following [Driving the Octatrack](../../../../../docs/OCTATRACK_DRIVING.md). The owner did the power cycles. Nothing was saved to the owner's project; the test bank's Part was put back byte for byte and the unit was left on bank A pattern 16, as found.

- USB package: `dejavu/0.1.0-experimental.mwrm`, SHA-256 `95079643d3e11914a9fcea21c3417bd95fe7083333660470147d7e89a1f53260` (ABI 7, module `ede213c6`, 3,600 bytes: 2,784 of code and data, 2,784 of state, nine stock-code sites and six hash-guarded stock copies), built from Modwerk commit `224d11ddfd6172d3cc458cf4f1a93dea38702d51` (the same bytes as from `3bd9cc18`, built first).
- The author's earlier use on their own MKII (beta base `cd39c494`, source `edceb9ab`) is in [TESTING.md](../TESTING.md); that source predates the review fix and is not this package.

## On the flashed beta base (`b5fae2ae`)

The base the owner's unit runs, with no modules installed before the test.

1. Installed and kept the way a tester's sync does it (stage, the base's check of each site's and copy's stock bytes against the running code, trial, Keep): accepted, generation 1, inventory `Deja Vu`.
2. Self-test: passed, module 1/1 intact, longest frame 374 µs, card set saved 1/1.
3. Power cycle by the owner: the base came back with the kept set, inventory `Deja Vu`. Self-test passed again (1/1, longest frame 374 µs).
4. Removal (kept): accepted, inventory empty.

This base answers no development requests, so the panel and RAM tests below ran on a twin.

## On a development twin (`7889c57a`, RAM-booted)

The beta base's flags plus `--dev` (the twin from the Direct Jump record), RAM-booted with `boot` (no flash). The package was installed and kept on the twin and removed at the end; those two Keeps stamp the card's set files with the twin, so the flashed base starts with no modules after the next power cycle, as it had before.

Test bank H, pattern H01, Part 1, whose working copy equalled its saved copy before the test. Track 1, LFO 1, read through its output word at `0x800010ec` (the LFO record `0x800010e8` + 4, which the wave handler writes each frame), with the step counter at `0x800064d0`. 132 BPM, no samples assigned.

- **WAVE list.** In LFO SETUP, WAVE stepped T7, T8, DJV, DJQ, DJC and stopped at DJC. Each of the three showed its label while turning and its own icon after (stepped, a stepped grid, a curve).
- **Locked loop.** DJV, MULT 1X, SPD 127, TRIG FREE, DEP 127, playing: the output held `0x00510000` for 12 reads through two passes of the pattern. The same value as DJC had settled on before the switch: the loop is kept across waves.
- **Fresh values.** SPD 0: a new whole value (a signed byte shifted by 16) at every read, every one or two steps apart.
- **Two slots.** SPD 127, MULT 2X: exactly two values, `0xffe00000` and `0x00470000`, alternating over 16 reads.
- **DJQ.** PTCH, DEP 127, MULT 8X, SPD 127: the output took only `0xffe70000`, `0`, `0x00230000` and `0x003c0000`, that is −25, 0, 35 and 60 knob steps (−5, 0, +7 and +12 semitones at 5 a semitone), and repeated the same values at the same steps on the second pass.
- **DJC.** Before the wave was switched to DJV, playing with DJC at MULT 4X gave a value that changed on every read with no jumps between neighbours (a glide), and settled when stopped.
- **Put back.** The Part's five changed bytes (LFO 1's WAVE and MULT, SPD 1, SPD 2's low byte, DEP 1) were turned back with the encoders: the working copy then equalled the copy read before, and the saved copy never changed. RELOAD did nothing here: the Part had never been saved ([driving guide](../../../../../docs/OCTATRACK_DRIVING.md#the-rules)).
- **Removal.** Accepted; the three dispatch slots read the stock SAW handler again and the WAVE count 19.

## Not tested on hardware

- The HOLD, TRIG, ONE and HALF modes; p-locks, scenes or the crossfader on SPD or DEP; trig conditions, one-shot trigs and microtiming.
- A project with WAVE 19-21 opened without the module (expected: SAW and a wrong WAVE icon).
- Listening: nothing was judged by ear, and the tracks played no samples.
- The card build (USB only), an MKI, the site's review, Keep and Undo pages (the device tool installed and removed the package), Play Modes beside it.
- About 20 minutes of use in all.
