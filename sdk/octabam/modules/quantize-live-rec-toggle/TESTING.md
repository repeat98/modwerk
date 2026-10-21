# Quant Live Rec: tests and measurements

Recorded 12 and 13 October 2026. Version `0.1.0-experimental`.

- Upstream: sambanks/octabam `6e4aeb76695cbb612e4b424c55fd2207facf73ef`, which takes the module from Zac-Kyoti/octatrack-kyoti-fw `77f132f9a60c6afa98ea4486540f6107398bdad3`.
- Native source SHA-256 of this folder (`moduleNativeSourceSha256`): `403c3e4b47e312d78c4ba5a6049d80452efbd63905f33573666c22f281e498b5`. It was `3919857a869087c66907941c64c2ef735f44e32849237a876521f8525fc9a8e1` until 20 October 2026, when only `evidence/performance.json` (part of that hash) took the emulator load and stress figures; `manifest.py`, `patch_qlrec.s` and `verify.py` are unchanged, and the USB package still builds to `026464de…`.
- Tested image: QLRTEST03, a static native octabam build of this module alone with every stock effect kept, from the original OS 1.40C (remix `qlr-stock`, main `b058d41e`): MAIN OS SHA-256 `eb34c12e9c906107fc6a8285ec757eaacf83a39c8dfb42e7bc390421f4189afd`, card file SHA-256 `14b762c7bd50767104c705eb0ae2b6bb101d927d6ec62b1604be40f17979d0c4`. The gate, the captures and the instruction counts below were run on it. **The card image has not run on a unit;** the same source has, over USB (Hardware report). The MKII ran QLRTEST02 from the card (MAIN OS `57a19a4dbd6fa08b38d3dfba507cdf5b5b7d357e03bef20c988360bc355c2e69`, source `50f65395`), whose unit wrote the flip's two words in the other order and called the redraw directly (Source identity).

## Not tested

- An MKI panel in the emulator; a project loaded from a real card; grid recording; MIDI tracks; the gesture with no project loaded.
- Chip timing, and frame-interrupt load or a stress run on a unit: the load and stress figures under Performance are from the emulator.
- Over USB: stock [REC] + [PLAY] behaviour after its removal (see Hardware report). Part and project reload ran on 20 October 2026 (see below).

## Hardware report (MKII, 13 October 2026)

Reported by the user (npp1993) on their Octatrack MKII, flashed from the card with the combined test image OMXATS19: Output Matrix, Analog BD, LOFI2, RING_SC and this module, a static native octabam build. Card file SHA-256 `0da18380f39930a92b3608ae8e8e8d7c459f0bbae268ad093711a13deaf65141`, MAIN OS SHA-256 `fdd3bbed4294e1a7f1a075b24b884534aa5916d21027881707ce3db68dca2c73`. This module's source in it is commit `dd409a4f`, the same instructions as now with **the earlier toast wording** (`QUANT LIVE REC ON` / `OFF`).

What the user reported:

- The first [REC] + [PLAY] started live recording.
- A second tap of [PLAY] flipped the setting.
- The toast disappeared as soon as [REC] was released.
- With [REC] held, a [PLAY] tap after the toast had run out showed the setting again and did not flip it.
- No freeze, no crackle, no dead controls.
- With PROJECT > SYSTEM > PERSONALIZE open on the QUANTIZE LIVE REC row, toggling with the gesture did not update the row until an arrow key was pressed. The author lists this as known: the value is right, the row is not redrawn.

Then, the same day, on the combined test image OMXATS21 (the same modules; card file SHA-256 `525d7e64602e223615d92f39666f25c2f046de50d838ebc00a666b0a6fb7144b`, MAIN OS SHA-256 `5ccbd5b4a4a9114af53f046a9a3a771acde22bf2f27a3e6a7becf3f224e39748`), which carries this module at commit `924e3d7b` with **the current wording**:

- Both toasts, `LIVE REC: QUANTIZED` and `LIVE REC: UNQUANTIZED`, fit on the screen.
- A changed setting survived a power cycle.
- The PERSONALIZE row still did not update on a [REC] + [PLAY] toggle until an arrow key was pressed.

Then, the same day, on QLRTEST02, an image with this module alone at commit `50f653953c35801ae6696b91fd87bd6a594b52b4` (the current source, with the PERSONALIZE redraw) and every stock effect still in place: card file SHA-256 `f4d8334c8eb66411fb21c48a15827001d7b38dfc5935d856c384ba9e605a33dc`, MAIN OS SHA-256 `57a19a4dbd6fa08b38d3dfba507cdf5b5b7d357e03bef20c988360bc355c2e69`, packaged with the site's download packager from the user's OS 1.40C update file. The gate passed 36 of 36 on this MAIN OS in the emulator before it was flashed. The user ran every step of the walkthrough and reported that all passed:

- The image flashed from the card and booted.
- With PROJECT > SYSTEM > PERSONALIZE open on QUANTIZE LIVE REC: the show press left the box alone, the flip changed it at once, after [REC] was released the box showed the new value with no arrow key, the flip back worked the same way, and after [STOP] the list still moved with the arrow keys.
- With PROJECT > CONTROL > AUDIO open, the gesture left that page as it was and its cursor still moved.
- From a normal page: live recording started, the second tap flipped, a tap after the toast had run out only showed, and [STOP] ended live recording.
- A changed setting survived a power cycle.
- Afterwards, asked about it in review, the user also flipped the setting while a pop-up was open inside the PROJECT menu, and reported it fine.
- No freeze, screen garbage, crackle or dead controls.

Then, on 15 October 2026, the current source (commit `d7526ad5`, the 188-byte unit) loaded over USB: the package below (SHA-256 `026464deb27c8178d44ad1fd5866b754478b11c114561e73000cdca3b44f86e8`, module `7d0747d4`) on the user's MKII running the flashed beta base `acf91e0a…`, OS 1.40C, driven by another session with `npm run device` through the USB bridge; APPLY SCENE was installed beside it.

- Two trials without Keep (8 s and 3 s): the module ran, then rolled back to the base; the base's refusal counter stayed where it was (4). Undo works.
- A trial kept (`try --accept`): accepted at generation 5; the inventory listed `Quant Live Rec`, module `7d0747d4`.
- The user reported, with it kept: hold [REC] and tap [PLAY] shows the toast and starts live recording; a tap within about a second flips the setting; a tap after the toast has gone only shows it; releasing [REC] closes the toast; with PERSONALIZE open the box follows a flip; a changed setting survives a power cycle.
- After the power cycle the inventory still listed Quant Live Rec beside APPLY SCENE: the kept module came back with the boot. (`npm run device -- status` reads generation 0 after a boot even with kept modules; `npm run device -- do inventory` lists them.)
- Removal (`remove --accept`): accepted at generation 1; the inventory no longer lists it.
- Not checked: that [REC] + [PLAY] behaves as on stock after the removal. The module adds no effect row or project data, so there is no missing-module fallback to see.

Not covered by these reports: how long the tests ran; the redraw beside Output Matrix on a unit (QLRTEST02 has no Output Matrix; that pairing ran in the emulator only); an MKI.

## Source identity

`patch_qlrec.s` is the author's file with three changes. First, the two toast strings read `LIVE REC: QUANTIZED` and `LIVE REC: UNQUANTIZED` where his read `QUANT LIVE REC ON` and `QUANT LIVE REC OFF` (the user's choice, 13 October 2026), and the comment above them says so. Second, one instruction is added after a flip: `jsr 0x40064d7c`, the stock routine that redraws the open PROJECT menu page and returns at once when that menu is closed (see PERSONALIZE redraw). With his strings the source links to his 176 bytes (SHA-256 `52c26af67443e470147844a52009d09fa308be5045a1f891c01344dbbaa8670d`), which native octabam confirmed on 12 October before the change. With both changes the unit was 186 bytes, SHA-256 `744a73eb0783e72fb5cbe10930ea9aae109c58f6b7d8e3594c3acb5afa91536c` at `0x400d7400` (180 bytes, `4d98f223…9398`, with the strings alone, which is what the MKII ran in OMXATS21; 186 is what it ran in QLRTEST02). Third, so that no 12 bytes of a USB package repeat a run of stock code (USB package), the flip writes the battery shadow before the setting word and calls the redraw through `%a0` (`lea`, `jsr (%a0)`): the same calls in the same order, nothing reading either word before the checksum. The unit is now 188 bytes, SHA-256 `9ab1d8e56eee486a1844e6d57330888aaf001f532c1d87d0d0e6b95361749518` at `0x400d7400`, `qlr_recrel` at 0x7c; native octabam, in the pinned toolchain container without network, links it there and where it floats and compares on every build. Its build report shows the unit and the two `jmp` detours at `0x40061778` and `0x4004883a`.

The author chose his shorter strings to fit the 128-pixel screen and notes that a 21-character `QUANTIZE LIVE REC OFF` overran it. `LIVE REC: UNQUANTIZED` is also 21 characters; in the emulator its box fits the screen with a few pixels to spare (see the captures), and the user confirmed both toasts fit on an MKII (Hardware report).

The three stock guards in `manifest.py` (both hook sites and the retired site `0x400522ca`) were computed from the author's declared expectations and matched against a local original OS 1.40C MAIN image (SHA-256 `164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`). `patch_qlrec.s` holds no firmware bytes: its comments describe stock routines by address and mnemonic.

## The gate

`verify.py`, run from an octabam root that holds the built image, the original MAIN OS and the ColdFire port:

```sh
OT_EMU=<path to ot_emu> python3 modules/quantize-live-rec-toggle/verify.py
```

Result on the tested image: **36 of 36 checks passed.**

1. The image, byte for byte: `0x400522ca` is as the original OS has it; both hook sites hold a `jmp`, 0x7c apart, into one unit; that unit is the 188 bytes the manifest names.
2. The gesture by the keys (MKII panel, empty card, DSP cores running), on the module image and on the original OS:
   - the first [REC] + [PLAY] starts live recording on both, and leaves the setting alone; the module also opens the toast;
   - a second [PLAY] while the toast is up inverts the setting and its battery copy, and a third puts it back;
   - after the toast has run out, [PLAY] shows it again and does not invert;
   - releasing [REC] clears stock's held flag and closes the toast; [STOP] ends live recording;
   - [PLAY] without [REC] opens no toast and changes nothing;
   - the original OS under the same keys never changes the setting and never opens a toast.
3. With PROJECT > SYSTEM > PERSONALIZE open: an arrow key runs the page's draw routine on both images; the show press does not; a flip and the flip back do on the module image; the original OS under the same keys changes and redraws nothing.
4. A power cycle of the port: the battery RAM of a run that left the setting inverted, booted again, comes up inverted. This is the emulator's battery RAM, not a unit's.

Separately, PERSONALIZE was opened in the emulator before and after one inversion: the QUANTIZE LIVE REC box was ticked while the toast said QUANTIZED (then worded ON) and empty after it said UNQUANTIZED (then OFF), so the toast and the menu agree there. The fresh emulator state has the setting ON.

The emulator used is the user's local build of octabam's `ot_emu` (SHA-256 `23ba6f6cdc6ec4b89b8cf206915e66d3160aec8499b1abfc9b475ac849152b28`). It does not run a real unit's timing, and the author's note that scratch RAM did not survive on hardware while it did in the emulator is the reason this module keeps no state of its own.

## PERSONALIZE redraw

On the MKII the user saw what the author lists as an open item: with PERSONALIZE open, a flip by the gesture left the QUANTIZE LIVE REC box unchanged until an arrow key was pressed. In the emulator the cause is plain: stock redraws a PROJECT menu page only after a key has gone to that page's own handler (its dispatcher ends in the redraw routine `0x40064d7c`), and [REC] and [PLAY] go to the transport handler. A program-counter watch on the PERSONALIZE draw routine showed it running after arrow keys and YES and never after [REC] + [PLAY].

The unit now calls that same routine after a flip, before it opens the toast. The routine tests the menu's window handle first and returns when the menu is closed, and stock calls it from fifteen places, key handlers among them. In the emulator, with PERSONALIZE open, a flip and the flip back each run the draw routine, the toast sits over the redrawn list, and after [REC] is released the box shows the new value with no arrow key (looked at as LCD captures, not committed). Beside Output Matrix, which replaces two entries of the page table that routine reads (the CONTROL > AUDIO page), a static native build of both was tried in the emulator: with CONTROL > AUDIO open, two flips left that page pixel for pixel as it was, its cursor still moved afterwards, and this gate passed 36 of 36 on that image. On an MKII with QLRTEST02, this module alone, the user saw the box follow each flip without an arrow key (Hardware report). Beside Output Matrix it has run in the emulator only.

## Stock flows compared

Run with and without the module (the gate's second part): starting live recording with [REC] + [PLAY], [PLAY] alone, [STOP], [REC] press and release. One change, listed in the README: the toast on [REC] + [PLAY], and that a [REC] + [PLAY] during live recording shows or inverts the setting where stock does nothing. Flows not run are under Not tested.

## Performance

Executed instructions of the unit, counted with the port's program-counter watch on every instruction of it:

| Press | Authored instructions |
|---|---:|
| [PLAY] without [REC] | 4 |
| [REC] + [PLAY]: show, live recording starts | 17 |
| [PLAY]: invert while live recording runs | 25 |
| [PLAY]: invert, live recording stopped (then stock's [PLAY] path) | 25 |
| [REC] release with a toast up | 5 |
| [REC] release without | 4 |

Counted on QLRTEST03's MAIN OS; each invert executes one instruction more than in QLRTEST02 (24), the `lea` before the redraw. In the invert-while-recording run the watch reported the instruction at offset 0x26 twice in a row, as it does when an interrupt is taken at that instruction, so that run executed 25 distinct instructions. The longest path in the source is 26 instructions. `evidence/performance.json` prices an instruction at 16 core cycles, the conservative V4 envelope Mute Modes' TESTING.md derives from the MCF54455 manual: 416 static, 400 measured, against one 362.8 µs frame at 264 MHz (95,778) taken as a generous deadline for a key handler. These are not chip timings. The stock routines the unit calls (the project gate, the checksum, the menu redraw, opening and closing the notification) are stock cost and are not counted.

### Load and stress (emulator, 20 October 2026)

Not run on the unit. Everything below is ot_emu (`--mkii --dsp`, frame engine on, the ColdFire port built from the `upstream:tools` Octabam checkout 67e5ea37, the binary Apply Scene's measurements used) and does not count as hardware evidence. The port prices every instruction at one step of its own clock, so its microseconds are not the unit's time. The method is Apply Scene's (its TESTING.md, Performance), with this module's gesture in place of SCENE + YES.

Setup: two native static-stock images built in a private copy of this source's `sdk/octabam`, one with CF METER + CF METER IDLE (upstream Octabam's probe; not in Modwerk) and the stock effects, one with this module added (its unit linked at `0x400d6d00`, the two `jmp` sites as in every build); Apply Scene's perf fixture project (T8 FX2 = CF METER); transport playing, crossfader 64. The flood is one three-byte MIDI message per ms (note on, note off 4 ms later and CCs on channels 1-8 and 11, about 1,000 a second) plus clock at 240 BPM. The gesture: hold [REC], tap [PLAY], tap [PLAY] again, release [REC]; the same keys on the stock image. Handler entries of the MIDI thread, the [PLAY] handler `0x40061778`, the [REC] release `0x4004883a`, the notification `0x4005a2b8` and every instruction of the unit were counted with the port's PC watch.

`npm run perf:audit -- check sdk/octabam/modules/quantize-live-rec-toggle/evidence/performance.json`:

| row | result |
|---|---|
| cycles | ✓ worst event 400 of 95,778 cycles (0%) |
| stock benchmark | ✓ the longest frame interrupt grows by -0.1 us (-0.0% of the 362.8 us frame), idle falls by 0.3 points vs stock |
| stress | ✓ 1000 messages/s at 240 BPM for 62 s, no stuck note, no hang, 0 dropped |

- **Load (10 s per run, `cfmeter.py --dump`, five 2 s cycles each).** The flood alone: longest frame interrupt 129.3 us on the stock image, 129.2 us with the module; idle 62.38 % on both. The flood plus the gesture about every 1.1 s (10 gestures, 10 flips on the module's image; the first one starts live recording on both): 149.6 us and 60.46 % on the stock image, 149.5 us and 60.19 % with the module. The rise from 129 to 150 us is the same on both images: live recording and the key handling are stock's. CF METER IDLE reads 0 % on both images (the port fast-forwards main's idle park), so idle is the port's own share: 100 × (1 − executed instructions / (3,990 instructions per sample × elapsed samples)).
- **Stress (62 s, the module's image; the same run on the stock image for comparison).** 62,068 messages and 5,960 clocks; STOP with a note held at 7, 22, 37 and 52 s (which also ends live recording), then Part 2, PLAY, Part 1 (by calling stock's own selection routine `0x4004a8a4`, as Apply Scene did: PART + TRIG did not change the Part in the port's panel script; once the port refused the call while main was busy and it went through 50 ms later); the gesture every 2.5 s between, 24 times, 24 flips. No handler saw fewer entries than messages sent (a few types up to three more, one or two on the stock image: the watch counting an entry twice). Nothing went to MIDI OUT; the per-channel note bookkeeping at the end equals the stock image's. No samples are loaded and no MIDI track plays notes in this project, so an audible stuck note could not occur here. Frames ran to the end and a gesture after the last STOP reached the [PLAY] handler and opened the toast.
- **Instructions per event under the flood.** Over the 115 events of these runs the unit executed 4 ([PLAY] alone), 17 (show), 18 (show while live recording runs, swallowed as stock does nothing), 24 or 25 (flip) and 5 ([REC] release with a toast): the measured worst case above (25) stands.
- **MIDI transport.** With CLOCK RECEIVE and transport receive on, three rounds of MIDI START, STOP, CONTINUE and STOP each ran their own handler past its receive gate (START posted to the sequencer queue) and never entered the [PLAY] key handler `0x40061778` or the unit: 0 entries, against 1 for a panel [PLAY] tap. So a MIDI flood or MIDI transport does not run this module's code; only the panel keys do.

## Memory

188 bytes of ROM for the unit (code and two strings; position independent, so the same anywhere) and two six-byte detours over stock instructions: 200 bytes. No RAM of its own, no DSP memory, no heap. It reads stock's [REC]-held and live-recording flags and the notification handle, and writes the stock setting word and its battery copy, then calls stock's checksum routine as the PERSONALIZE menu does.

## Native comparison and listing

Recorded on 20 October 2026 on main `e370b78e` with the module listed: packages built in the isolated toolchain container and imported, then `npm run module:verify -- quantize-live-rec-toggle --os <OS 1.40C update file>` (record: `sdk/native-comparisons/quantize-live-rec-toggle.json`).

- **130 selections: 46 built and identical to native octabam (20 outright, 26 outside the platform writes), 84 matching refusals, 0 mismatches.** Native pair checks: 25 modules, 300 pairs in 3 contexts, 10 refused.
- Shared-code changes the listing needs: this module in the hard-coded lists of `scripts/build-module-packages.py` and `src/engine/compose-os.ts`, its ROM unit placed after the utility and replacing modules in `src/engine/requested-modules.ts` (`LATE_ROM`), and this module in the release-scope and module-set tests. Recorder Loop Fix's floating cave keeps main's overflow fallback, which native follows since repeat98/modwerk#682.
- `module:verify` adds this module to `src/engine/assets/chooser-metadata.json`, which the Octatrack base hashes as a build input, so the committed beta base is rebuilt with it (`24b25c39`, lease symbols unchanged) and the base-bound packages name it; their bytes are unchanged.
- `npm run module:doctor -- quantize-live-rec-toggle`: every line passes, the performance rows with the emulator figures above.

What listing still needs:

1. The owner's word on the hardware record binding the USB package `026464de…` that ran on the MKII, rather than a card image: the card image QLRTEST03 has not run on a unit.
2. The owner's decision on whether the emulator load and stress rows (Performance, above) stand in for a unit's; `evidence/performance.json` asks for a waiver.

## USB package (15 October 2026)

Built from this source on main `b058d41e` with `sdk/runtime/loader/build.py --octabam quantize-live-rec-toggle --name "Quant Live Rec"` from a scratch tree with this folder placed under `sdk/octabam/modules/` (nothing committed): ABI 7, module id `7d0747d4`, 188 bytes of code and data, no relocations, hooks or stock copies, and two stock-code sites, the `jmp` detours at `0x40061778` and `0x4004883a` with the manifest's guard hashes; `0x400522ca` is not touched. 356 bytes, SHA-256 `026464deb27c8178d44ad1fd5866b754478b11c114561e73000cdca3b44f86e8`. The same build with `--stock` (the guards checked against the original OS 1.40C) gives the same bytes. Neither site meets one of the beta base's sites or a site of `sdk/machines/octatrack/events.json`. `npm run octatrack:module-packages` builds the same bytes from this source on main `e370b78e`; they are published as `public/octatrack-modules/quantize-live-rec-toggle/0.1.0-experimental.mwrm`.

- Both strict stock-free scans pass: `module_packages.runs` finds no run of 12 seed bytes shared with stock (it refused the 186-byte unit's package on two 12-byte runs: the setting's store followed by its battery copy, and the checksum call followed by the redraw call), and `check_stock_free.stock_runs` (16 bytes) finds none.
- Emulator, the beta base built for a RAM boot (`npm run octatrack:base` with the beta options and `--out`, on main `86e0dfb8`; it matches the committed base): `scripts/octatrack-emulator/run-sites.sh` passed (both sites hold the module's jumps while it is live, and their earlier bytes once it is removed), and a trial rolled back without Keep (Undo) left both sites as they were before. The emulator was `scripts/octatrack-emulator/build.py` against upstream Octabam at the pinned `67e5ea3`; the local Octabam checkout's emulator stopped at the base's boot gate (`unrecognised spin`), which the pinned one passes.
- `sdk/tests/test_runtime_loader.py`: 15 tests pass, one opt-in skip.
- The module is named Quant Live Rec (15 October 2026, the user's choice), the name the package carries, so the published package can take it from the catalogue.
- On the user's MKII (Hardware report): trials undone, kept, the gesture, persistence across a power cycle and removal. Not tested: stock behaviour after its removal.
- Part and project reload, same MKII, 20 October 2026 (flashed beta base `6650236a`, package `026464de` kept beside Output Matrix, Analog BD, Apply Scene, LOFI2 and one private module): after a flip with [REC] + [PLAY], RELOAD PART and a project reload each left the LIVE REC setting unchanged, as expected for a PERSONALIZE setting that neither a Part nor the project stores. Whether the gesture was used again after each reload was not recorded.

## Captures

`media/capture.json` records the plan, the image and emulator hashes and each PNG's hash. Made with `scripts/capture-module-ui.py --key-ms 100` on the tested image, after the wording change. Every picture was opened and checked: the two toasts over the main screen, and PERSONALIZE with QUANTIZE LIVE REC selected and its box empty after the switch to UNQUANTIZED.

## Upstream hardware reports

The author reports, for his own standalone build of this source on an MKI: the show-then-invert gesture working with the tick hook removed (25 September 2026), and a changed setting surviving a power cycle (30 September 2026). He also records that an earlier version, which hooked the engine frame handler at `0x400522ca`, hard-crashed that MKI; this version does not touch that site, and the gate checks it. These are reports about his image, not tests of this build.
