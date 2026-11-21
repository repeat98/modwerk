# Ghost Cut testing

Milestones A (the TAPE engine) and B (the GRAIN engine). Everything below ran on 21 November 2026 on a Mac (Apple silicon), with octabam's DSP56300 tools built locally and the developer's own OS 1.40C extraction. No result here comes from a unit or from ot_emu.

## Render gates (dsp_host): RENDER

`python3 -B modules/ghost-cut/verify.py`, from `sdk/octabam`, builds a scratch image holding only GHOST CUT (fallback NONE), dumps payload A and renders through `dsp_host`. **96 of 96 pass** (21 November 2026, after milestone B and its optimization).

- **Dry:** without a GRAB every frame is bit-exact dry, with four different knob sets and GRAB up to 95. An FX1-sized slot is dry with GRAB held.
- **Against the reference:** the DSP equals [ghost_cut_ref.py](ghost_cut_ref.py) sample for sample (max error 0 LSB) on:
  - AUTO at RATE 0, 20, 50, 80, 110 and 127, each in FWD, REV and PEND;
  - MAN capture, and MAN released before its recording ends;
  - OFF capture;
  - MIX 0, 1, 64 and 126, and MIX moving while looping;
  - 30, 60, 90, 133.33, 174 and 300 BPM at LEN 1/64, 1/16 and 1/4, and no tempo word;
  - GRAB hysteresis (64 holds, 100 does not grab again, 50 does not grab), and a re-grab during the release fade;
  - RATE swept and DIR changed while looping.
- **GRAIN against the reference**, also sample for sample (max error 0 LSB): PTCH -24, -12, -24 clamped (0), 0, +12, +24 and +63 clamped; PTCH +12 at RATE -64, -32, +36 and +63; GRN 0, 64 and 127; FWD, REV and PEND; 1/64 at 300 BPM (grains capped at a quarter of the loop); MAN capture; PTCH swept while looping; ENG switched TAPE to GRAIN and back while looping; ENG switched during a release fade.
- **GRAIN parts pitch from speed** (not leaning on the reference): a 500 Hz sine plays at 1,003 Hz at PTCH +12, 248 Hz at -12, 502 Hz at RATE -32, and 1,011 Hz at PTCH +12 with RATE +36 (each within 3 %, median zero-crossing period). TAPE at RATE -32 and +32 plays 250.0 and 1,000.0 Hz.
- **The duck:** ENG switched while looping never steps past the steady output's own largest step.
- **The loop itself** (not leaning on the reference): at 1 x the output is the recorded mono sum, within 2 LSB, at the period LEN and the tempo give. Checked at 120 BPM 1/16 (5,512 samples), 90 BPM 3/64 (5,512), 174 BPM 1/8 (7,603) and 60 BPM 1/4 (44,100, halved twice to 11,025).
- **Release:** exact dry from 256 samples after GRAB falls.
- **Seam:** a looped 220 Hz sine never steps more than 1.5 x the sine's own largest step (FWD and REV 141,006 against 131,462; PEND 131,463).
- **Dirty memory:** with Y memory full of garbage (`-dirty`), a grab straight after the clear loops only silence and fresh audio.
- **Guard:** `-guard 0x4000 -guard-shared` at the dearest settings sees no stray write, on track 1's FX2 and on track 3's FX2 (the block with Sidechain Compressor's key window).
- **Instances:** four FX2 instances on one core, each bit-identical to one alone.
- **Every knob** at 0 and 127, past every select's count, renders without dsp_host dying.

`ghost_cut_ref.py` itself is also checked without firmware by [test_ghost_cut_ref.py](test_ghost_cut_ref.py).

## Performance

- **Static:** `tools/build/cycle_count.py --verify` gives **266 cycles a sample** on the worst path, GRAIN. That is the fork's dispatch (11 words), the GRAIN arm (152, both grains), two calls of `gcRD` (18 words each, plus the call), and the envelope, MIX run and output that every sample runs. TAPE's worst path is 148. Against stock SPRING REV's 257.5 instructions a sample (`benchmark_stock_dsp.py` on the original image), GRAIN is about 1.03 times and TAPE about 0.57 times. Not modelled: memory-contention stalls.
- **History:** milestone A (TAPE only) counted 188. Milestone B first counted 390 on GRAIN, when every grain read also crossfaded over the seam. Baking the seam into the ring at GRAB took that work out of the sample loop. A fork whose arms are record, TAPE and GRAIN made the count see that only one runs. Capping grains at a quarter of the loop halved the wrap.
- **Executed** (`dsp_host -meter`, one instance on track 1 FX2, dispatch included, steady looping at LEN 1/4, RATE +63, PTCH +63, GRN 127, MIX 127, 120 BPM; worst block / 16):

  | Path | Before the optimization | After |
  |---|---|---|
  | Idle | 68.6 | 65.6 |
  | TAPE FWD / REV / PEND | 141.2 / 144.2 / 115.4 | 105.3 / 108.3 / 111.3 |
  | GRAIN FWD / REV / PEND | 265.2 / 268.2 / 271.2 | 194.2 / 197.2 / 200.2 |

  The seven bake blocks after a GRAB run at 81.4 a sample. The block where baking ends and the loop starts peaks at 222.0.
- **Not measured yet:** the benchmark against stock in the same harness (`perf.py bench` / `stress`), `evidence/performance.json`, and the CPU price on a unit.
- Memory: 15,870 Y words of the FX2 slot's own buffer, 45 state words in the r7 block (`$00..$2c`), and a 99-word P table. Milestone A's package was 585 DSP words; milestone B's, optimized, is 997 (`module:dev --build-only --slots fx2 --cycles 266 --cycles-kind modeled --state 45 --buffer 15870`, SHA-256 `3fd3d8cbbfee9274…`). It is larger than before because the DIR code runs in both loop arms, but faster.

## Sound quality

`npm run fx:audit` (plan, render, check), rendered through `dsp_host` with GRAB held from block 474 at 1 x, 120 BPM, LEN 1/16, MIX 127. The audit's model is a steady tone in and the same tone out, and a looper does not fit it, so read these figures as follows:

| signal | out dBFS | harmonics | aliasing | residual | DC dBFS | rails |
| --- | --- | --- | --- | --- | --- | --- |
| 1,100 Hz -12 dB | -13.0 | -60.4 | -31.4 | -6.5 | -71.2 | 0 |
| 1,100 Hz -1 dB | -2.0 | -60.4 | -31.4 | -6.5 | -60.2 | 0 |
| 2,701 Hz -12 dB | -13.0 | -70.3 | -22.2 | -6.6 | -81.6 | 0 |
| 2,701 Hz -1 dB | -2.0 | -70.3 | -22.2 | -6.6 | -70.6 | 0 |
| 5,301 Hz -12 dB | -13.0 | -73.9 | -39.7 | -6.5 | -86.0 | 0 |
| 5,301 Hz -1 dB | -2.0 | -73.9 | -39.7 | -6.5 | -75.0 | 0 |
| 9,102 Hz -12 dB | -13.0 | -75.8 | -31.3 | -6.6 | -95.3 | 0 |
| 9,102 Hz -1 dB | -2.0 | -75.8 | -31.3 | -6.6 | -84.4 | 0 |

- **Every tone row fails the audit's aliasing limit (-60 dBc), and the residual is -6.5 dBc.** At 1 x the interpolation is exact (the fraction stays 0), and nothing is clipped (0 samples on the rails). The off-fundamental energy is the loop's own spectrum: a 5,512-sample loop repeats about 8 times a second, so a looped tone sits on a grid of multiples of 8 Hz around its pitch, not on the pitch's own bin.
- **The idle row fails** (-6 dBFS after the tail): a held loop keeps playing after its input stops, by design. Released, the output is exact dry (the release gate above).
- **Not tested:** aliasing when RATE is above 1 x. With linear interpolation and no anti-alias filter, high content is expected to alias when sped up. It needs a measurement this audit cannot make, and is listed as a limitation.
- **Not tested:** `fx:audit compare` on knob ends.

## In the emulator (not hardware evidence), 21 November 2026, milestone A

`npm run device:emulator -- --image MAIN.raw --emulator ot_emu [--dsp] -- npm run test:procedure -- ghost-cut --package gc-a.mwrm`.

- **Package:** `gc-a.mwrm`, SHA-256 `c5544c10568c690c85d5f29ad78b72c7982e511ba98c4b2d388bfa94e66605e0`, from commit `27f0d6917`, built by `npm run module:dev -- ghost-cut --build-only --slots fx2 --cycles 188 --cycles-kind modeled --state 28 --buffer 15870`.
- **Base:** a development twin from `build_core.py --dsp-loader --dev --usb-midi --packaged-usb-audio --site-events --table-owners … --resident-stock-hooks --resident-on-demand --cached-modules --module-sets --sample-editor --module-ui-roots --part-menu`, base `d24c5acbe674f701…`. That is the beta base's flags without the controller trust rows.
- **Emulator:** Octabam's `ot_emu`, rebuilt by `scripts/octatrack-emulator/build.py`.

| Step | Result |
|---|---|
| 1 Software checks, 3 name the build, 4 DSP cost model | passed |
| 6 Read the emulator | passed |
| 7 Scripted pass (`device:test`) | **failed**, for a reason the emulator causes (below) |
| 8–12 | not run (stopped at 7) |

- **Placeholder figures are refused.** The first run used the builder's placeholder figures for a draft (600 modeled cycles, buffer 0). The base refused it at verify with loader refusal 6, RUNTIME_CYCLES. With Ghost Cut's own figures the base accepted it, and it installed as a trial in RAM.
- **Every pick was refused.** The CPU FULL box read "GHOST CUT, CPU 100 %, UNIT IS BUSY", on T1 FX2 and T5 FX2, alone and all at once. The emulator's CPU meter read 1000 per mille from boot, with and without `--dsp`. The base refuses every module effect pick while the meter is at 85 % or more (docs/MODULE_PERFORMANCE.md).
- **The control was refused the same way.** Vibrato's listed package (`f311dd62…`) on the same twin and emulator gave the same result: T1 and T5 refused, CPU 1000. So the refusal is the emulator's, not Ghost Cut's.
- **Part switches:** 12 of 12 ran their own effects.
- **Rollback:** the self-test did not start, the rollback reported "needs-recovery", and the inventory at the end differed from the start. Vibrato's control run did all three in the same way.
- **Not run:** the frame checks, the queued bank change and the crash test.

**Edge cases**

| Case | Why this change makes it a risk | How run | Result |
|---|---|---|---|
| Two instances, FX2 of T1 and T5 (both cores) | an instance's state and ring | `device:test`'s picks | not run: the emulator refuses every module effect pick (CPU meter 100 %); dsp_host: four instances on one core pass |
| T3 FX2, the block with Sidechain's key window | the ring ends at +$3DFD | dsp_host `-guard -guard-shared` | dsp_host pass; emulator and unit not run |
| Picked on FX1 | the slot is too small: it must pass dry and write nothing past it | dsp_host | dsp_host pass (dry); unit not run |
| A Part or pattern change while a loop plays | runtime state across the change | — | not run: no pick is admitted in the emulator |
| Knobs swept, selects past their counts | the clamps | dsp_host | dsp_host pass; unit not run |
| The trial ends while a loop is held | rollback in the middle of a loop | — | not run |
| A tempo change while looping | LEN reads the tempo every block | dsp_host (per-tempo renders) | dsp_host pass for a fixed tempo per render; a live change not run |

Nothing here is hardware evidence. Ghost Cut has not run on a track in the emulator: only dsp_host has run its DSP.

## On the unit

Not tested.

## Stock flows

Not tested. The module adds a row to the FX2 chooser through the base and takes no key, screen or stock site (`uiClaims: []`).
