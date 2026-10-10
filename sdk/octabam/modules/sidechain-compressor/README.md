# Sidechain Compressor

![Sidechain routing and ducked output](presentation/thumbnail.svg)

## Overview

Drive the Octatrack stock **COMPRESSOR** detector from any audio track. A kick on T1 can duck a loop on T5, even though the tracks run on different DSP cores. KEY, KFLT, KGN and MON join RMS on page 2; all seven stock compression controls keep their stock behavior.

Version **0.1.2-experimental** is built by Modwerk's firmware builder together with the other modules you select. A COMPRESSOR saved before the module was installed comes up with its side-chain off (KEY OFF, KFLT and KGN centred, MON OFF), so nothing changes until you set a KEY. Native octabam builds it in every selection compared; the results, the cycle bounds and the exact memory accounting are in [TESTING.md](TESTING.md). The author reported a functional test of this exact image on an MKI.

## Controls

Values below are raw parameter values, rather than milliseconds or ratios. Stock defaults were read locally from the fingerprinted 1.40C descriptor. Native compression parameters stay inherited; the four added defaults are declared in manifest.py.

| Control | Default | Range | Behavior |
| --- | --- | --- | --- |
| ATK | 64 | 0-127 | Stock attack control, raw 0-127; determines how quickly compression engages. Exact time mapping is inherited from stock. |
| REL | 64 | 0-127 | Stock release control, raw 0-127; determines recovery after detector level falls. |
| THRS | 127 | 0-127 | Stock threshold, raw 0-127; lower it until the selected key causes gain reduction. |
| RAT | 0 | 0-127 | Stock compression ratio, raw 0-127; raise it to increase compression. |
| GAIN | 0 | 0-127 | Stock output make-up gain, raw 0-127. This is distinct from KGN, which changes the detector input. |
| MIX | 127 | 0-127 | Stock dry/wet balance, raw 0-127; 127 is fully processed and 0 is dry. |
| RMS | 0 | 0-127 | Stock RMS detector control, raw 0-127; retained on page 2 without changing its implementation. |
| KEY | 0 | OFF, T1-T8 | OFF restores self-keyed stock detection; 1-8 selects absolute T1-T8, including tracks on the other DSP core. |
| KFLT | 64 | 0-127 | 0-63 low-pass; 64 bypass; 65-127 high-pass. LCD shows LP/OFF/HP. One-pole filter uses a 32-entry 40-2200 Hz table and special near-bypass edges; no exact cutoff readout. |
| KGN | 64 | 0-127 | Raw 0-127 about unity at 64. Sixteen 8-value buckets yield -24 to +21 dB in 3 dB steps; the gain is smoothed with a nominal 5 ms block-rate time constant. LCD displays the stock bipolar raw offset, not dB. |
| MON | 0 | OFF / ON | OFF is normal compression; ON plays the processed key on this receiving track instead of its output, after both effects. MON requires a selected KEY. |

Page 1 uses encoders A-F for ATK, REL, THRS, RAT, GAIN and MIX. The SETUP page (page 2) retains RMS and uses C for KEY, D for KFLT, E for KGN and F for MON. The native declaration preserves the stock descriptor fields for slots 0-7; it does not create a new control for the blank slot.

KFLT filters only the detector key. KGN changes the key level, while GAIN changes output make-up gain. KGN's 16 buckets mean the top bucket is +21 dB, despite the approximate +/-24 dB description upstream. The one-pole key filter and gain state reuse stock COMPRESSOR per-instance memory. No exact hardware latency or utilization is claimed.

MON replaces the receiving track's committed output after its whole FX1/FX2 chain. Turn it off for normal listening. With KEY OFF, MON has no processed external key to audition.

## Usage

Select an audio track, hold FUNC and press FX1 or FX2 for SETUP, turn LEVEL to **COMPRESSOR**, then press YES. The effect name and ID remain stock COMPRESSOR, not SIDECHAIN_COMPRESSOR. Press the FX button for the main page; hold FUNC and press it to return to SETUP (page 2), which also contains the chooser. These panel instructions are checked against the actual MKII LCD captures below. The author reports MKI operation; fresh physical testing of this Modwerk build is owner-waived.

Keep levels low while auditioning the key. Restore self-keying with KEY OFF and MON OFF. Use MIX 0 for a dry comparison or select NONE to remove the effect. Returning to stock firmware removes these four controls; don't rely on saved sidechain values surviving a different composition. Back up projects before switching builds. With Keep stock FX2 effects on, SPRING REV gives up its code space for this module; reassign any slot that used it.

### Quick tutorial: duck T5 from a T1 kick

1. Back up the project, work on a disposable copy, and put a kick on T1 and a sustained sample or loop on T5. Build with Modwerk; with Keep stock FX2 effects on, SPRING REV gives up its code space, so reassign any track that used it.
2. Select T5, hold FUNC and press FX1, turn LEVEL to COMPRESSOR and press YES. Press FX1 for the main page; hold FUNC and press FX1 to return to SETUP with the key controls.
3. Set KEY to T1, KFLT to 64, KGN to 64 and MON to OFF. On the main page, keep MIX at 127, raise RAT and lower THRS until the T5 signal dips when the T1 kick plays; adjust ATK and REL for the desired envelope.
4. Briefly set MON to ON on page 2 to hear the processed T1 key on T5, then return MON to OFF. Try KFLT below 64 to focus on bass, or above 64 to remove bass from the detector.
5. Return KEY to OFF and MON to OFF to restore self-keyed stock compression. Set MIX to 0 for the dry signal or select NONE to remove this effect; stop transport before saving the disposable project.

## Compatibility and limitations

It takes COMPRESSOR's row on FX1 and in the FX2 chooser, keeps stock COMPRESSOR's dispatch and carries its code in three guarded hooks per core, so it sits beside other effects without a row of its own. Native octabam and the Modwerk composer were compared on every selection that contains it, with and without the stock FX2 effects.

### Using it with other modules

- **Every other module, and every pair.** Among the nine visible modules other than Analog BD it builds beside each one (18 of 18 selections) and each pair (72 of 72).
- **Most larger selections.** 786 of the 1,024 selections of those nine modules that contain it build. The others run out of effect-menu space once its descriptor and ColdFire unit are added, mostly selections holding Euclid or Scale Quantizer with at least two more modules. 0.1.2's larger ColdFire unit refuses 12 selections that 0.1.1 built, each holding Euclid with Scale Quantizer or eight or more modules. The selection checker tells you which applies; removing one module resolves it.
- **Analog BD and MIDI Scenes are not compatible.** Analog BD currently runs with the original effects only, so it is refused beside every custom DSP module, this one included. MIDI Scenes is standalone firmware.
- **The paused modules.** Spectrum, Modulation and Character are not offered; with them the module needs more of core A's DSP code space than is left in many larger selections.
- **Stock FX2.** With Keep stock FX2 effects on, SPRING REV gives up its code space for this module; PLATE and DARK REV stay. With it off, every stock FX2 effect leaves the FX2 chooser and the stock FX1 effects stay.

Every download carries Modwerk's core logger; the module's pages are identical with and without it.

### Limitations

- Original OS **1.40C**, Octatrack MKI/MKII; the captured panel is MKII.
- Its core-private keybus and cross-core window overlap BusDelay and BusVerb, which Modwerk does not carry; the native resource ledger refuses them beside it.
- No MUTE_MODES module is imported. The upstream muted-key report concerns a combined image with its matching MUTE_MODES variant; do not infer the same behavior under every mute mode.
- Both-core timing/rate locking, simultaneous instances sharing one KEY, detector state transitions, stale MON behavior on effect changes, maximum load and recovery remain qualification cases. Part and project reload and a power cycle were reported working with two instances.
- A COMPRESSOR whose KEY holds a value above T8 is treated as never set up and reset to the side-chain defaults. Only stock firmware leaves such a value; a KEY of OFF or T1..T8 is never changed.
- Cycle bounds describe this module's own contribution and are not summed with other modules selected on the same core. No stress, audio or ducking run was made on a mixed image.
- Firmware, private project/card state and extracted stock bytes stay local.

## Tests and measurements

[TESTING.md](TESTING.md) and [evidence/common-builder.json](evidence/common-builder.json) give the source, tool and image identities and the actual results. The 338-byte ColdFire unit (KEY/KFLT formatters, the KEY list widget and `sc_norm`) matches its author reference; `sc_norm` is reached by two guarded `jsr` detours over the first instruction of the page-2 copiers. Both cores place 340 DSP code words and 48 identical table words; only the two documented table-load substitutions differ from the author's instructions, and the module's bytes in Modwerk's image equal those in the author-form image.

Exact accounting for sixteen instances is **23,520 logical bytes**, including inherited instance/scratch/stack capacities and all authored code/tables, Y windows, descriptor, chooser and extra ColdFire caller stack. No new heap, SDRAM or delay buffer is allocated. The conditional DSP bound is **69,496 cycles/core/block** against **72,560**, including stock reserve and a 2× instruction-model allowance. `sc_norm`'s static ColdFire bound is **8,192 cycles per 362.8 µs frame** against a **9,577**-cycle allowance (10% of the frame). These are software bounds under stated assumptions; silicon timing and current-build hardware canaries are unmeasured.

On 10 October 2026 the author flashed this exact image on an MKI and reported every check passing: a stock-saved COMPRESSOR came up with its side-chain off, two instances across both DSP cores ducked independently, MON auditioned the key, and both survived Part and project reload and a power cycle ([evidence/hardware.md](evidence/hardware.md)). Duration was not reported and no stress or maximum-load test was made.

## Authorship and licences

Zac Kyoti (@Zac-Kyoti) and the OT Kyoti FW contributors wrote the sidechain source, table generator and standalone build. Sam Banks (@sambanks) integrated it into octabam. This import pins octabam 922878234b22221a1c298b3c7e0b3bdeffb468a9 and author 329b801cf90f32cbca97c6699a908908968e4df6.

[LICENSE](LICENSE) and [upstream/LICENSE](upstream/LICENSE) preserve the full MIT terms, copyright and exclusions. Modwerk's original documentation/thumbnail uses MIT. The author assembly and table generator remain byte-identical; the native manifest changes only paths, replaces stock expectation literals with lazy fingerprinted local reads, and declares the module's stock-DSP hooks, replaced row, raw descriptor words, the two guarded `sc_norm` detours and DSP data ranges. Per-file provenance and transforms are in [the import record](../../../imports/sidechain-compressor-9228782.json).

No Elektron firmware or private project/card is part of this source distribution. LCD captures have a separate rights declaration; underlying Elektron rights remain reserved.

## Screens and audio

These reviewed, unedited MKII framebuffer captures, taken on Modwerk's build of the module, show selection/SETUP, the main page and KEY T2 chosen with encoder C. The complete composed image, with the core logger, draws the same three frames pixel for pixel. [Capture provenance](media/capture.json) preserves the exact panel plan, source/image/emulator/card hashes and setup. [Media rights](media/LICENSE.md) reserves underlying Elektron rights. The T1-to-T5 tutorial is a source-described audio exercise, not a result from this stopped capture session. No audio is included.

![COMPRESSOR selected with default key controls in FX1 SETUP](media/ot-compressor-selection.png)

![Stock COMPRESSOR main page](media/ot-compressor-main.png)

![KEY T2 selected on FX1 SETUP](media/ot-sidechain-key-selected.png)

The original routing thumbnail above is an illustration, not OT UI evidence.

## Developer build

Modwerk builds the module with the rest of its firmware: `scripts/build-module-packages.py` compiles the authored source in the pinned container (`sdk/build/Dockerfile`), and the browser rebuilds the guarded stock fields from the visitor's own 1.40C. To compare it with native octabam yourself, put your own original MAIN OS in a private copy of `sdk/octabam`, run `scripts/export-composition-proofs.py --suite sidechain` (or `sidechain-visible`), and run `node scripts/verify-sidechain-native.mjs` on your 1.40C update; TESTING.md has the steps. Keep out/ images and every generated firmware container private.
