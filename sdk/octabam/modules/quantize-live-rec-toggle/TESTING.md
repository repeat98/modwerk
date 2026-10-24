# Quant Live Rec: tests and measurements

Recorded 23 October 2026. Version `0.1.1-experimental`.

- Source: Zac-Kyoti/octatrack-kyoti-fw `8ffec2b60bf0c309d9f3f2bf8384c8c224141be2` (`modwerk-modules/quantize-live-rec-toggle/`, the author's Modwerk copy of this module): his final source with the flip's two stores in stock-free order (= his commit `3ead7f9`). octabam carries the same module, with the earlier store order, at sambanks/octabam `5c71bc8c` (PR #861).
- Native source SHA-256 of this folder (`moduleNativeSourceSha256`): see `tests.qualification.sourceSha256` in `octamod.module.json`.
- Tested image: a static native octabam build of this module alone with every stock effect kept (`scripts/export-composition-proofs.py --select quantize-live-rec-toggle:true --image-dir`, in the `modwerk-source-tools` container, from Modwerk commit `3ff9dee1`): MAIN OS SHA-256 `3a39f682b372ad1ad962cc3f327893b51db54273ac5a0690918552298a7b9328`. The gate, the captures, the instruction counts and the hardware report below are all on this image. Wrapped for the card with Elektron's firmware tool, OS VERSION `MW_QLR011`: card file SHA-256 `7289fa69bd0a469a6425979672fc9455b2cd123c4653807e786f90c98bae5ae7`.

## Not tested

- On this version: an MKII; the USB package on a unit; grid recording; MIDI tracks; Part and project reload; combined builds with other modules; the gesture with no project loaded.
- Chip timing, and frame-interrupt load or a stress run on a unit. The emulator load and stress figures under Performance are 0.1.0's and were not repeated.

## Hardware report (MKI, 23 October 2026)

The author flashed the card image above on his Octatrack MKI and used it for about five minutes. He reported every step passing:

- Hold [REC] and tap [PLAY]: the toast shows the setting and live recording starts.
- A second tap of [PLAY] while the toast is up flips the setting; another tap flips it back.
- A tap of [PLAY] after the toast has gone only shows the setting.
- Releasing [REC] closes the toast; [STOP] ends live recording.
- With PROJECT > SYSTEM > PERSONALIZE open on QUANTIZE LIVE REC: the show press leaves the box alone, and a flip changes it at once.
- A changed setting survives a power cycle.

## Source identity

`patch_qlrec.s`, `LICENSE` and `upstream/README.md` are the author's files byte for byte (`sdk/imports/quantize-live-rec-toggle-8ffec2b.json` records their Git blobs and SHA-256s). Assembled with `m68k-elf-as -mcpu=5407` and linked at `0x400d7400`, the unit is 196 bytes, SHA-256 `065cafcb0c3896aad746efd0ce9bf022fb6a6d17a7e593bb7f9e889c2861b9e4`, with `qlr_recrel` at 0x84. `manifest.py` names that reference; native octabam links the unit where it floats and compares on every build. In the tested image it floats to `0x400d6b80`.

What differs from 0.1.0's unit (188 bytes, Modwerk's edit of the author's earlier source): the redraw after a flip runs only when PROJECT > SYSTEM > PERSONALIZE is the open menu page (`0x400cbf40` = 12), not on every open PROJECT page, and it is called directly rather than through `%a0`. The flip writes the battery copy before the setting word, as 0.1.0 did: in the other order the two stores and the `jsr` after them are 12 counted bytes of stock's own PERSONALIZE setter (`0x40068ccf`), which the USB package scan refuses. The toast strings are the same.

The three stock guards in `manifest.py` (both hook sites and the retired site `0x400522ca`) are unchanged from 0.1.0. `patch_qlrec.s` holds no firmware bytes: its comments describe stock routines by address and mnemonic.

## The gate

`verify.py`, run from this checkout's `sdk/octabam` with the tested image, the original MAIN OS (SHA-256 `164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`) and the ColdFire port:

```sh
QLR_IMAGE=<MAIN OS> QLR_STOCK=<original MAIN OS> OT_EMU=<path to ot_emu> python3 modules/quantize-live-rec-toggle/verify.py
```

Result on the tested image: **36 of 36 checks passed.**

1. The image, byte for byte: `0x400522ca` is as the original OS has it; both hook sites hold a `jmp`, 0x84 apart, into one unit; that unit is the 196 bytes the manifest names.
2. The gesture by the keys (MKII panel, empty card, DSP cores running), on the module image and on the original OS: the first [REC] + [PLAY] starts live recording on both and leaves the setting alone, and the module also opens the toast; a second [PLAY] while the toast is up inverts the setting and its battery copy, and a third puts it back; after the toast has run out, [PLAY] shows it again and does not invert; releasing [REC] clears stock's held flag and closes the toast; [STOP] ends live recording; [PLAY] without [REC] opens no toast and changes nothing; the original OS under the same keys never changes the setting and never opens a toast.
3. With PROJECT > SYSTEM > PERSONALIZE open: an arrow key runs the page's draw routine on both images; the show press does not; a flip and the flip back do on the module image; the original OS under the same keys changes and redraws nothing.
4. A power cycle of the port: the battery RAM of a run that left the setting inverted, booted again, comes up inverted.

The emulator used is a local build of octabam's `ot_emu` (SHA-256 `21b159be7e918d0cdf211c3a9f8b3966c8ed4a262b29b9fb4c41de10753a14c8`). It does not run a real unit's timing.

## Stock flows compared

Run with and without the module (the gate's second part): starting live recording with [REC] + [PLAY], [PLAY] alone, [STOP], [REC] press and release. One change, listed in the README: the toast on [REC] + [PLAY], and that a [REC] + [PLAY] during live recording shows or inverts the setting where stock does nothing.

## Performance

Executed instructions of the unit on the tested image, counted with the port's program-counter watch on each of its 35 instructions in turn (one boot per instruction, the same key sequence every time):

| Press | Authored instructions |
|---|---:|
| [PLAY] without [REC] | 4 |
| [REC] + [PLAY]: show, live recording starts | 17 |
| [PLAY] after the toast has gone, live recording running: show | 17 |
| [PLAY]: invert while live recording runs | 26 |
| PERSONALIZE open, [REC] + [PLAY]: show | 18 |
| PERSONALIZE open, [PLAY]: invert and redraw | 26 |
| [REC] release with a toast up | 5 |

The longest path in the source is 28 instructions (invert with PERSONALIZE open and live recording stopped, then stock's [PLAY] path). `evidence/performance.json` prices an instruction at 16 core cycles, the conservative V4 envelope Mute Modes' TESTING.md derives from the MCF54455 manual: 448 static, 416 measured, against one 362.8 µs frame at 264 MHz (95,778) taken as a generous deadline for a key handler. These are not chip timings. The stock routines the unit calls (the project gate, the checksum, the menu redraw, opening and closing the notification) are stock cost and are not counted.

**Load and stress (emulator, 0.1.0, 20 October 2026; not repeated).** `evidence/performance.json` keeps 0.1.0's ot_emu figures: under a MIDI flood of about 1,000 messages a second with clock at 240 BPM and the gesture about every 1.1 s, the longest frame interrupt was the stock image's (149.6 µs stock, 149.5 µs with the module) and idle fell by 0.3 points; a 62 s stress run had no stuck note, no hang and no dropped message; MIDI transport never entered the [PLAY] key handler. The unit runs only on a [PLAY] press or [REC] release, and 0.1.1 changes only the flip.

## Memory

196 bytes of ROM for the unit (code and two strings; position independent, so the same anywhere) and two six-byte detours over stock instructions: 208 bytes. No RAM of its own, no DSP memory, no heap. It reads stock's [REC]-held and live-recording flags, the notification handle and the current PROJECT menu page, and writes the stock setting word and its battery copy, then calls stock's checksum routine as the PERSONALIZE menu does.

## Native comparison

`npm run module:verify -- quantize-live-rec-toggle --os <OS 1.40C update file>` on this branch (record: `sdk/native-comparisons/quantize-live-rec-toggle.json`):

- **146 selections: 70 built and matching native octabam (24 identical outright, 46 outside the platform writes), 76 matching refusals, 0 mismatches.** Native pair checks: 28 modules, 378 pairs in 3 contexts, 10 refused.
- The run also moves POLY8's entry in `src/engine/assets/chooser-metadata.json` (no entry changed); that reorder is not part of this update and was dropped, as for Mini Verb 0.2.3.

## USB package

Built from this source with `module_packages.build` alone (as Mini Verb 0.2.3 was; `sdk/machines/octatrack/elekloader/module_packages.py`, the Elekloader checkout from `npm run upstream:tools`), the same entry as 0.1.0: ABI 7, module id `7d0747d4`, two stock-code sites (the `jmp` detours at `0x40061778` and `0x4004883a` with the manifest's guard hashes). 364 bytes, SHA-256 `297f79efa4259486a6df7ce95efa29947b457597cb8f2d2794a214699d7f87fe`, published as `public/octatrack-modules/quantize-live-rec-toggle/0.1.1-experimental.mwrm`. The same driver rebuilds 0.1.0's published package byte for byte from main.

- Both strict stock-free scans pass: `module_packages.runs` finds no shared run (the author's earlier store order scores 12 and fails), and `check_stock_free.stock_runs` (16 bytes) finds none.
- Not run on a unit (Not tested).

## Captures

`media/capture.json` records the plan, the image and emulator hashes and each PNG's hash. Made with `scripts/capture-module-ui.py --key-ms 100` on the tested image, with 0.1.0's plan. Every picture was opened and checked: the two toasts over the main screen, and PERSONALIZE with QUANTIZE LIVE REC selected and its box empty after the switch to UNQUANTIZED. The three PNGs are pixel for pixel 0.1.0's.

## Earlier versions

0.1.0 (Modwerk's edit of the author's earlier source; its TESTING.md is in Git history at Modwerk `c8fcb805`) ran on an MKII: from the card in combined test images and alone (13 October 2026), and over USB on the beta base (15 October 2026, trial, Keep and removal), with Part and project reload on 20 October 2026. The author reports, for his own standalone builds on an MKI: the show-then-invert gesture (25 September 2026), a changed setting surviving a power cycle (30 September 2026), and the LIVE REC toasts with the PERSONALIZE redraw (22 October 2026). An earlier version of his patch, which hooked the engine frame handler at `0x400522ca`, hard-crashed that MKI; this module does not touch that site, and the gate checks it.
