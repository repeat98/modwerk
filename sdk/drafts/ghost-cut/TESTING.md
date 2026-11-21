# Ghost Cut testing

Milestone A, the TAPE engine. Everything below ran on 21 November 2026 on a Mac (Apple silicon), with octabam's DSP56300 tools built locally and the developer's own OS 1.40C extraction. No result here comes from a unit or from ot_emu.

## Render gates (dsp_host): RENDER

`python3 -B modules/ghost-cut/verify.py`, from `sdk/octabam`, builds a scratch image holding only GHOST CUT (fallback NONE), dumps payload A and renders through `dsp_host`. **67 of 67 pass.**

- **Dry:** without a GRAB every frame is bit-exact dry, with four different knob sets and GRAB up to 95. An FX1-sized slot is dry with GRAB held.
- **Against the reference:** the DSP equals [ghost_cut_ref.py](ghost_cut_ref.py) sample for sample (max error 0 LSB) on:
  - AUTO at RATE 0, 20, 50, 80, 110 and 127, each in FWD, REV and PEND;
  - MAN capture, and MAN released before its recording ends;
  - OFF capture;
  - MIX 0, 1, 64 and 126, and MIX moving while looping;
  - 30, 60, 90, 133.33, 174 and 300 BPM at LEN 1/64, 1/16 and 1/4, and no tempo word;
  - GRAB hysteresis (64 holds, 100 does not grab again, 50 does not grab), and a re-grab during the release fade;
  - RATE swept and DIR changed while looping.
- **The loop itself** (not leaning on the reference): at 1 x the output is the recorded mono sum, within 2 LSB, at the period LEN and the tempo give. Checked at 120 BPM 1/16 (5,512 samples), 90 BPM 3/64 (5,512), 174 BPM 1/8 (7,603) and 60 BPM 1/4 (44,100, halved twice to 11,025).
- **Release:** exact dry from 256 samples after GRAB falls.
- **Seam:** a looped 220 Hz sine never steps more than 1.5 x the sine's own largest step (FWD and REV 141,006 against 131,462; PEND 131,463).
- **Dirty memory:** with Y memory full of garbage (`-dirty`), a grab straight after the clear loops only silence and fresh audio.
- **Guard:** `-guard 0x4000 -guard-shared` at the dearest settings sees no stray write, on track 1's FX2 and on track 3's FX2 (the block with Sidechain Compressor's key window).
- **Instances:** four FX2 instances on one core, each bit-identical to one alone.
- **Every knob** at 0 and 127, past every select's count, renders without dsp_host dying.

`ghost_cut_ref.py` itself is also checked without firmware by [test_ghost_cut_ref.py](test_ghost_cut_ref.py).

## Performance

- **Static:** `tools/build/cycle_count.py --verify` gives **188 cycles a sample** on the worst path: the DIR fork's dispatch (8 words) plus its worst arm (28), with the seam's second read. That is about 73 % of stock SPRING REV's 257.5 instructions a sample, as `benchmark_stock_dsp.py` measures it on the original image. Not modelled: memory-contention stalls.
- **Measured** (`perf.py bench` / `stress`), `evidence/performance.json` and the CPU price on a unit: **not measured yet.**
- Memory: 15,870 Y words of the FX2 slot's own buffer, 28 state words in the r7 block (`$00..$1b`), 49 P table words. The USB package is 587 DSP words.

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

## In the emulator

Not tested yet.

## On the unit

Not tested.

## Stock flows

Not tested. The module adds a row to the FX2 chooser through the base and takes no key, screen or stock site (`uiClaims: []`).
