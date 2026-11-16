# Mini Verb 0.2.1-experimental testing

This candidate fixes a confirmed dry/wet mixer defect found while investigating
[report #428](https://github.com/repeat98/modwerk/issues/428). The report describes
noise on a THRU machine around 25% mix, without input routing, other settings,
a project or an audio recording. Its saved configuration lists Mini Verb,
Tape Echo, TapeHead, USB Audio, FM Synth and Sidechain Compressor on MKII OS
1.40C. That selection was reconstructed; it is not a proven copy of the
reporter's image. The reported hardware symptom remains **unconfirmed**.

No physical device was flashed, played or rebooted. On 11 October 2026 the
owner approved this exact experimental release with the limits disclosed and
instructed that **#428 stay open until reporter confirmation**. The separate
0.2.1 source-bound exception waives current hardware, chip timing and complete
runtime memory-bound qualification. It does not verify played automation,
Part/project persistence, physical reboot, maximum load or the reported noise.
The literal approval and exact I428 identities are in
[evidence/owner-release-0.2.1.md](owner-release-0.2.1.md). Historical 0.2.0 results remain in
[evidence/testing-0.2.0.md](testing-0.2.0.md) and the old JSON reports;
they have not been relabelled as current evidence.

## Confirmed mixer regression

The old mixer subtracts dry from the wide wet accumulator, then copies that
difference into a 24-bit multiplier register. That copy limits the difference
before multiplication, even when the final dry/wet mix would fit. Both channels
now divide the wide difference by eight, multiply in 24-bit arithmetic, then
restore the scale in the accumulator before adding dry. The neutral wet
projection is bounded by +/-4 FS and dry by +/-1 FS, so their difference fits
after scaling. Tone's existing limiting and the tank are unchanged. Final
output still limits normally. The change adds four program words and four
executed instructions per stereo sample, without additional state or buffers.

A full-wet render of the old mixer is an invalid oracle for this defect: it also
limits its wet-minus-dry difference. The verifier instead assembles a measured
raw-wet reference, replacing only both mixer bodies with NOPs and the final wet
store. That store itself can limit; those samples are excluded from the affine
comparison and counted separately. All three programs pass the existing
assembler/disassembler round-trip audit.

At 44.1 kHz, 16-sample blocks, default controls except MIX 32 (25%), a 0.9 FS
733 Hz mono input and trigger split 7 reproduce the defect on **both cores**.
After the first second, 167,992 stereo samples have unclipped measured wet
output; 5,952 raw-wet-limited samples are excluded. On eligible samples the old
mix differs from `0.75 * dry + 0.25 * rawWet` by up to **1,737,799.75 LSB**;
the fixed mix differs by at most **468.25 LSB**, below the 512 LSB gate that
allows the existing mix smoother's quantization. Neither mixed render clips
its final output. At 0.24 FS, all 173,944 samples are eligible; old/fixed maxima
are 125 / 125.75 LSB. This proves the intermediate clipping fix, without proving
that it explains the reporter's physical noise.

## Current native DSP results — 11 October 2026

All **53 checks passed**. Exact source hashes, verdicts and measurements are in
[evidence/dsp-regression-0.2.1.json](dsp-regression-0.2.1.json). The exact
published 0.2.0 assembly and manifest are preserved in `upstream/`; both versions
use the same six parameter slots. These are current-source DSP results, not
whole-instrument or hardware qualification.

| Measurement | Result |
| --- | --- |
| Assembled program | 536 words; 0.2.0: 532 |
| Static branch-inclusive sample loop | 415 modeled cycles; 0.2.0: 411 |
| Eight moving instances, four per core, mixed splits | 23,616 executed instructions/core/block; 0.2.0: 23,360; +1.096% |
| Eight neutral instances | 21,348 executed instructions/core/block; 0.2.0: 21,092 |
| TONE 64, moving controls, splits 0/1/7/15 | Maximum 4 LSB difference from 0.2.0, within the 8 LSB quantization bound |
| MIX 0, TONE 0/64/127, bipolar full-range ramp | Bit-exact dry passthrough |
| Dark endpoint, 70 Hz / 4 kHz relative to neutral | -0.10 dB / -18.85 dB |
| Bright endpoint, 70 Hz / 4 kHz relative to neutral | -16.60 dB / -0.34 dB |
| Eight instances vs isolated runs, both cores and skewed scheduling | Bit-identical; no cross-instance influence |
| One excited instance at each of eight positions | Other seven outputs exactly silent |
| Dirty X/Y state and private/shared Y/loaded P guards | Passed |
| 30-second moving, eight-instance guarded render | 82,688 blocks; peak 23,616 instructions/core/block; zero output clipping or guard violations |
| Dark/neutral/bright percussion and full-range Tone jumps | Unclipped, stereo, decaying; smoother bound passed, return to exact neutral state |

The neutral Tone stage is still an exact bypass, but the mixer no longer
promises bit-identical neutral audio to 0.2.0. The eight-instance render drives
parameter events directly; it does not play actual project locks, scenes,
crossfader or LFOs, or eight stock voice engines. Aliasing is not separately
qualified. Raw logs, WAVs, input signals and stock-derived payloads stay private.

Reproduce with this checkout's host source and the developer's private original
MAIN OS:

```sh
DSP_HOST=/absolute/path/to/reviewed/dsp_host \
python3 -B sdk/octabam/modules/miniverb/verify.py \
  --sdk /absolute/path/to/disposable/octabam \
  --stock /absolute/path/to/private/stock-main-os.bin \
  --output /absolute/path/to/private/miniverb-0.2.1-results
```

The offline render image is
`sha256:b16d9f284f8df081c4cec6d1941450e38ab34af129104bfab12ddf8879a1dd0e`.
The DSP host source SHA-256 is
`27257a3ee152d812629dc9880eb9abbb1d05b6df1dfb558f73d0d251bbf2d921`.
It matches this checkout and the vendored host used by the image. Runs have
512 MiB shared memory, 2 CPUs, 4 GiB RAM, no network, read-only sources and only
private output writable. Heavy work uses the repository's machine-wide lock.

## Exact private composition and instrument diagnostics

[evidence/private-composition-0.2.1.json](private-composition-0.2.1.json)
binds both candidate MAIN images and packaged updates to their runtime sources,
module selections and toolchain. Packages were built from authored sources only
with the pinned isolated compiler and imported explicitly as **development**
artifacts; no release approval is asserted. The preparation record describes the pre-approval stage: only Mini Verb's
catalogue version was adjusted in process memory, with generated files and
owner approval untouched. Following the exact owner approval, normal catalogue
generation and composition must reproduce these image hashes. Both
chooser profiles of the exact saved six-module selection also match native
module-owned writes with platform differences masked; there are two builds
and zero mismatches, separate from the 126-selection matrix.

| Private I428 build | MAIN OS SHA-256 | Packaged update SHA-256 |
| --- | --- | --- |
| Mini Verb only | `2a517bc54a92fbf811a3f7366ce27713fdcbdb1aeb2ebbd9bd9c2368ba317cfa` | `f0c5f31449f5b6c16d1a88e6c52f3687f4c8d11b4e4335fac2b365632fa516dc` |
| Saved six-module selection | `af3dddc8263846bcd63e6487e753730d77b1c1c372b893bab143c252c4b0f3b8` | 72dab691058497b1ac2e429aa6e639d2b2887e6ddb57abbe2de539df43467f49 |

Both updates use the normal `ELEKLOADER` container label; Mini Verb has no
separate boot version tag. Identify the candidate by the source/package receipt
and decoded MAIN hash, not that shared display label. Firmware stays private.

The 0.2.0 full-instrument diagnostic reconstructed the six-module selection on
an empty card with the maintained native emulator and actual DSP execution.
THRU received A+B at 0 dB, AMP HOLD INF, Mini Verb defaults except MIX 32.
Manually triggering **TRACK + PLAY** produced nonzero audio on T1 and T5;
incorrect or untriggered silent captures were rejected. Valid T1/T5 outputs had
peaks below 0.018 FS, RMS about -43.6 dBFS, zero output clipping and no crash;
repeated T5 triggers also passed. These moderate-input baseline runs did not
reproduce the reported noise and do not qualify the hot-input candidate.

The exact 0.2.1 six-module candidate subsequently passed separate native
THRU runs on T1/core 1 and T5/core 0 with the same settings. Each produced
88,280 frames (2 seconds) of nonzero audio; four repeated triggers produced
123,591 frames (2.80 seconds). Peaks were 0.01709 / 0.01706 FS, RMS -43.59 /
-43.61 dBFS and output-clipped samples zero on both tracks. Active scalar state
was observed on each core. See
[evidence/thru-diagnostics-0.2.1.json](thru-diagnostics-0.2.1.json).
These are separately booted, moderate-input software runs, without a listening
verdict or a claim that the original hardware noise is fixed. Simultaneous
full-instrument instance isolation and save/reload/reboot remain unverified.

The native emulator uses pinned MC68k
`4a6d0d17a1f2b30077ab726c27fe9bb770fa0456`. For the six-module image only, its
private diagnostic watchdog allows eight stalled windows instead of four:
the actual runtime checksum otherwise falsely trips it at 1.5 million CPU
instructions. The instrument source and firmware are unchanged; the watchdog
remains bounded. The extended emulator SHA-256 is
`3e04ecbfb9f00a45d7f8a832215241f3832443cd485d5cc58b3b5b97cfd7a4f0`;
the unmodified binary is
`908a0f8deb76fc8ab3cc0968b924db68e108d9b4f54145e7a8facfe6cad0732c`.
EMAC and peripheral self-tests passed; other emulator tests were not run.
No actual USB host stream, maximum voice/streaming load, saved project or
hardware noise recording was exercised.

## Software resource bounds

The audited loop is 415 modeled cycles/sample. Two split process calls per
16-sample block cost 6,640 loop cycles, plus twice all 121 outside-loop words,
twice 128 ring-clear stores, 32 initialization stores and a 256-cycle setup,
branch and return allowance: **7,426 modeled cycles**. Round upward to
**8,192 modeled cycles/instance/block**. This conditional software model excludes
chip memory contention and does not turn host instructions into chip timing.

Four instances/core cost 32,768 modeled cycles/block. The inherited stock reserve
is 1,415 cycles/sample, or 22,640/block. Total 55,408 is below octabam's arithmetic
200 MIPS / 44.1 kHz budget of 72,560/core/block by 17,152. The reserve is inherited,
not a new measurement of whole-instrument load, USB, streaming or companion FX.

| Logical reservation | Scope | Words | Bytes |
| --- | --- | ---: | ---: |
| Full inherited X block, including 32 scalar words | instance | 256 × 24 bit | 768 |
| Allocator-owned Y ring | instance | 16,384 × 24 bit | 49,152 |
| Programs on both cores | shared | 1,072 × 24 bit | 3,216 |
| Full hardware system stack capacity on both cores | shared | 64 × 48 bit | 384 |

Per instance: 49,920 bytes. Shared: 3,600 bytes. Eight instances:
**402,960 logical bytes**. X r7+0x20..0x3f is fully cleared; the inherited instance
range is r7..r7+0xff with dispatcher stride 0x300. The ring has modulo 0x3fff,
occupied positions 0..13,749 and progressive clear stride 128, unchanged.
No new ColdFire callback, table, CPU RAM/SDRAM, heap or variable allocation is
introduced. Logical DSP words differ from the emulator's int32 backing.
These reservations and dirty-state guards do not establish complete runtime
lifetime/stack bounds or physical memory canaries.

## Hardware steps for these exact private builds

1. Preserve the original project and identify the I428 image by the hashes above.
   On an MKII with OS 1.40C, first test the Mini Verb-only update, then the saved
   six-module update. Record model, date, image, input routing/level and settings.
2. Assign THRU and Mini Verb FX2 to T1 and T5; route a known input, raise its
   input volume as needed, and trigger each with **TRACK + PLAY**. Compare MIX
   0, 32 and 127 at TONE 64, then 0 and 127; include a hot signal whose input and
   final output meters are not clipping. Capture an audio example if noise remains.
3. Use distinct settings simultaneously on T1/T5 (both DSP cores) and additional
   tracks. Edit, reset or replace one instance and verify the others keep their
   settings and working audio. Include stock FX1 and the saved companions.
4. Exercise played locks, LFOs, scenes, crossfader, bypass and repeated triggers.
   Check Part save/reload and project save/load/reload restore a saved baseline
   after subsequent edits, with usable audio.
5. Physically reboot with only the saved card and battery RAM retained, without
   manually loading a project first. Verify assignments, distinct settings,
   routing and working audio survive. Report failures and untested steps.

No results from these steps have been supplied. Hardware, audio after actual
reload/reboot, played automation, maximum load, chip timing and complete runtime
memory bounds remain unverified. Native/browser verification passed 126 selections: 52 matching images
(18 identical outright, 34 with platform writes masked), 74 matching refusals
and zero mismatches. A modified original is refused. The current record is
`sdk/native-comparisons/miniverb.json`. The in-memory preparation label does
not waive catalogue or publication checks. The owner approval now covers this
exact source. Keep #428 open unless the
owner explicitly authorizes closure despite its unconfirmed symptom; any such
closure must give the released version, these limits and how to reopen.


## Release preparation verification — 11 October 2026

`npm run check -- --base origin/main` passed: all 228 test files and 1,706
app tests, lint, types, bundle, SDK, licences and catalogue checks.
`npm run module:doctor -- miniverb` has every integration point green.
The changed Mini Verb DSP also required regenerating the full Analog BD
companion proof: 212 profiles passed, comprising 162 matching native OS and
GNU bootloader builds, 50 matching refusals and six complete firmware round
trips. This is software compatibility evidence, not hardware qualification.

A clean source-only export of commit
`89d189e53192c76d8d3c5e26495578f61316fdf4` with
`bash scripts/build-modules-isolated.sh` and the pinned compiler image below
passed `scripts/import-module-build.mjs --development --check-only
--verify-existing`. It reproduces all eleven committed package payloads;
only source-commit provenance differs from the preparation export. The
container had no firmware, network or credentials. Compiler image:
`sha256:445effdc2b5446de89bd70ba0f7632222e98cd29e749c3f059668cb246c060a5`.

The bundled Octatrack worker was run headlessly with the private original
update. Both saved full downloads were read back and matched the exact I428
update and MAIN hashes above. Their report names Mini Verb
0.2.1-experimental and compiled source tree
`3726d7c2c4c4d39265eada72f1bc8e1179e923855fbf4dbeb6516d88f1b7f9f0`.
This preparation check is separate from saved live-download verification,
which must follow the owner merge and successful deployment.
