# Digi Perform testing

## In Modwerk

Evidence tier: `none`. Nothing here is a filed hardware report; the author's own observations on a unit are listed below as they were reported.

Source: `sdk/digitakt/modules/digiperform/src` at commit `59242a13c568a8220c51ca7a935701eab0d7f537`. Modwerk's pinned toolchain compiled the source twice and produced the source-only packages in `sdk/imports/packages/digiperform/` (no stock bytes: addresses, lengths and SHA-256 guards only). The vendored elekloader builder (kit 0.6.0) then linked core 2.1 and Digi Perform into a local image on each release, with the owner's stock OS files, which stay on the author's computer:

- OS 1.54: core 2.1 and Digi Perform 0.1.0-experimental, built and verified; image SHA-256 `d3b41d1df3588abf8599b8a13801e6883781804dec5d12f32b00f8798a156962`. Digi Perform package SHA-256 `82382250e512e8da09ec11c925dd42299cf65efc8e238b56b24568826c1f353a`.
- OS 1.53: core 2.1 and Digi Perform 0.1.0-experimental, built and verified; image SHA-256 `7892733c56fa05700f3fef0b94afb79362550ed4eaf0c6982514887275254989`. Digi Perform package SHA-256 `c613fe68041206d6faf615e1228822d3b662f85e7de274c741eecc7c429c6901`.

The local images carry the build label `3.0g`. Both are build checks; the author's hardware observations are listed below.

## Resources

- Memory: 18,264 B per release: 17,438 B in `.run`, 806 B in `.bss` and 20 B of table contributions (five core events). No FAST AUDIO bytes. This is the object's size, from the package; it excludes the shared core and linker alignment.
- Load: not measured. The engine hook runs once per audio block and adds up to eight offsets to the smoothed parameter words; the cost has not been timed on a unit or in a cycle-accurate run.

## Combinations

`modules:check` flags the overlaps the manifests declare: Digi Perform and Digi Matrix patch the same render site, so it is declared in `compatibility.conflicts`. Digi Perform and cc-names no longer share a patch site. Pairwise builder check (29 October): Digi Perform 0.1.0-experimental was linked with core 2.1 and, one at a time, every other Digitakt mod in the catalogue that exists for the release, with the mods each of them requires (cc-names, cc-recall, digichain, digieq, digihealth, digimatrix, digimono, digineighbor, digipoly, digislicer, digisophie (1.53 only), digistring, digiutils, euclidean, fx-track and input-prefader (1.54 only), machine-pages, midi-retrig, note-accumulator, ram-machines, sample-tools). Every pair linked on both releases, with the builder reporting no overlap, except Digi Matrix, which the builder refused as declared (both patch `0x40077eb2`). Of the other mods' declared patch sites, only Digi Poly (draw slots of the TRIG page's view, next to ours) and Euclidean (`0x40033076`, which our TRIG wrapper chains into) sit near ours; both were also run in the emulator as described below. This is a link-time check of bytes and declarations: it says nothing about how two mods behave together while running. Note Accumulator claims the audio TRIG page's G and H knobs, and no behavioural check of it beside Digi Perform was made. Combinations of three or more mods, other than Euclidean with cc-names and Digi Poly with DigiChain below, were not built.
Digi Perform beside Digi Poly and DigiChain (build `3.0d` with Digi Poly 2.0, DigiChain 1.6 and core 2.1; emulator only, never hardware evidence). Digi Poly replaces the draw slot of the TRIG page's view, next to the key slot Digi Perform patches. Both releases link into one image with no overlap reported. In the pinned digiemu (OS 1.54 and OS 1.53), with the audio engine off:
- On a track with the stock machine, the TRIG page drew as stock, TRIG pressed again opened the Perform page, and TRIG left it back to the stock TRIG page.
- On a track set to POLY (FUNC + SRC, then POLY), the TRIG page drew Digi Poly's page (NOT1 to NOT4 as a keyboard, LEV, VEL, LEN, PROB, LFO.T). TRIG pressed again opened the Perform page, TRIG left it back to Digi Poly's TRIG page, and opening Perform a second time worked the same way. NO on the Perform page stayed on it, as documented.
- Audio, OS 1.54 only, emulator with its audio recording on (a white-noise sample, trigs on track 1, Perform knob A on T1 FLT.FREQ, negative direction, the assignment written into the kit rather than made with the keys, then knob A turned to 127 and back to 0). Signal RMS in four 3-second phases (knob at 0, at 127, right after returning to 0, then after five more turns toward 0): Digi Perform alone 2050, 98, 2031, 2050; with Digi Poly and DigiChain on a track with the stock machine 2050, 23, 926, 1818; with the same track set to POLY 2050, 75, 1843, 2050. Audio played in every case, and the knob closed the filter to near silence and let it open again. In the Digi Poly image the same turn inputs did not take the knob fully back to 0 (the Perform page showed F.Frequency 121.96 at the start of the last phase on the stock-machine track, against 127.00 for Digi Perform alone), so the sound opened more slowly. The cause was not determined; it may be emulator input timing under the extra load, and it needs a unit to say whether knobs feel slower beside Digi Poly.
- Not tested: POLY's extra notes (NOT2 to NOT4) while the Perform page is open, assignments or pattern changes with Digi Poly active, Digi Poly's other pages, OS 1.53 audio, and any run on a unit.

## Emulator checks (author)

Run in the pinned digiemu (revision `c1b5735835923e328f8b4950d6ba927875e5b669`, patched Unicorn) with the audio engine on, in a network-denied container, with the same panel inputs as a unit would receive. These are emulator results, never hardware evidence.

- Both releases: the page opens from the TRIG page, draws its eight knobs, accepts Perform Quick Assign and Perform Edit, and stores the assignments in the pattern's kit. OS 1.54 was exercised throughout; on OS 1.53 only the page, the pattern-change release and the metronome and scale screens were run.
- The engine's smoothed parameter words move by the knob's offset and return when the page is left, the pattern is reloaded or NO is pressed.
- FUNC and turn lands on the parameter's snap values, and the lock after each snap matches the same clicks on a stock page; the track and parameter choosers step like the SAMP selector.
- Pattern change: stopped, the offsets reload at once; playing, they hold at the selection and release when the engine switches pattern.
- Stock screens: FUNC + TRK, FUNC + PTN, FUNC + PAGE, and a held step with an arrow show the stock screens, the same as stock without the module. The stock firmware itself keeps the metronome and scale pages open after the keys are released and closes the metronome on a second FUNC + PTN; the Perform page leaves first, so those behaviours are the stock ones.

Storage and entry changes (build `3.0a`, emulator and host only; none of it is hardware evidence; builds `3.0c` and `3.0d` differ only in the decode described under "Overbridge delay"):

- The assignments now live in tracks 5 to 8's spare sound bits with a version of their own and a marker in parameter slot 49 of those tracks. A host test of the packing code taken from `src/perf.c` ran 20,000 random pools: every entry (all-tracks flag, track, parameter, direction) read back as written, the two reserved bits were left as they were, only the pool's 92 own bits changed (no other byte or bit of the sound, tracks 1 to 4 untouched), the 92 stream bits are 92 distinct bits, and a pool without version 1 reads as empty.
- All eight rows of Perform Edit were set to different tracks and parameters, and the Perform page and the edit list read every one back, including rows G and H, which sit across the track 7 and 8 boundary of the pool; earlier rows did not change when later ones were set. A negative direction read back. The all-tracks setting was not reached in the emulator run.
- Pattern A01 and A02 kept their own assignments across a pattern switch, and copying A01 to A03 carried both.
- With Euclidean 1.1.5 and cc-names 2.1.1 in the same image (dt-support 1.0.1), the elekloader builder reports no overlaps on both releases. Euclidean's page (hold FUNC + AMP), the Perform page (TRIG twice) and Euclidean again all opened in turn on OS 1.54 in the emulator. On a MIDI track the second TRIG press opened the Perform page, as it did before the MIDI hooks were removed.
- Not run: a project save and reload (the capture tool's card is write-protected, and a plan with my own harness landed on the wrong screens), loading a sound onto tracks 5 to 8 or onto tracks 1 to 4, saving a track 5 to 8 sound to the pool, the same checks on OS 1.53, and any hardware run of the new layout.

## TRIG tap and hold (builds 3.0f and 3.0g)

The author reported (OS 1.54, hardware, after build 3.0d): on the Perform page, holding TRIG shows the values, but letting go with no copy or paste dismissed the page; and holding TRIG on the TRIG page opened the Perform page at once, so the TRIG page's own values, copy, paste and clear could not be reached. Build 3.0f separates a tap from a hold: the Perform page opens when TRIG is released within half a second with no other key pressed, and a longer hold, or any key pressed with TRIG, leaves the page where it is.

Emulator only (digiemu, OS 1.54, build 3.0f; never hardware evidence). Build 3.0d reproduced both reports: a release after a hold left the Perform page, and a hold on the TRIG page opened it. Build 3.0f: a tap on the TRIG page opens the Perform page; a hold on the Perform page and release keeps it (labels again); a tap there goes back; a hold on the TRIG page shows its stock values (VEL 100, LEN 1/16, LEV 100) and keeps the page; TRIG + REC on the TRIG page gives the stock COPY PAGE TRIG; TRIG + REC and TRIG + STOP on the Perform page give COPY PAGE PERF and PASTE PAGE PERF. Build 3.0g adds the stock page's short delay before a held TRIG shows the values (the author's request). Read from the OS 1.54 code: the stock TRIG page sets its show-values flag when a key event of the held TRIG arrives that is no fresh press (the key's first repeat), not at the press; the module now waits for the same event. Emulator only: stock showed the values between 400 and 430 ms of holding (names at 400 ms, values at 430 ms); a debug build received that first repeat after 12 UI ticks; build 3.0g on the Perform page with knob A assigned to track 1 TUNE (audio running) showed the label at 380 ms and the value under the knob at 430 ms. Not run: OS 1.53 for this change, hardware, a slow tap (longer than half a second counts as a hold and changes nothing).

## Overbridge delay (builds 3.0c and 3.0d)

Build 3.0a decoded all eight assignments bit by bit on every audio block. The author reported (OS 1.54, Digitakt connected to Overbridge, after switching patterns) a noticeable delay between turning an assigned knob and the parameter changing, not seen on the earlier submitted version and not seen with Overbridge disconnected. Build 3.0c decoded the pool only when its 92 bits had changed; the author reported "very much improved" (OS 1.54 with Overbridge; reported, not timed). The author then reported that the delay when switching patterns, and the value indicators showing the current values, had come back, less than before but still noticeable. Build 3.0d keeps a separate decoded copy for the UI and for the audio hook (3.0c shared one, which could be overwritten by the other side while a pattern change was pending) and syncs once per audio block. A host test compared the new decode with the old bit-by-bit decode on 200,000 random states, cache reused, and found no difference; it says nothing about speed or timing. The cost per block was not measured on a unit or in a cycle-accurate run, and no build was run side by side with another on one unit. 3.0d was not exercised in the emulator beyond the page drawing and a pattern switch while playing.

Known limitation, reported by the author: the knob labels on the Perform page are the stock parameter names. When a mod such as Digi Mono changes the SRC page's names for its machines, the Perform page follows the values but keeps the stock names; the author plans to pick the names up on the fly in the next release. Not tested beyond that report.

Known limitation, reported by the author: when a new pattern starts to play, the value indicators briefly show the previous pattern's value and then update to the new pattern's. The cause is not confirmed; the engine's smoothed parameter words probably still run from the old sound to the new one when the knobs pick them up. A build that read the new sound's stored value instead (3.0e) made, in the author's words, "not much difference", and was dropped. The flash could not be reproduced in the emulator.

## Author's hardware observations

Reported by the author (ROMsets) while testing local builds on a unit, build labels in brackets. These builds (2.x) kept the assignments in other bytes of the kit than the current layout (tracks 5 to 8's spare bits, build 3.0a), so none of this, except the first item (3.0a), covers the storage as it now is. Recorded as reported. The author says most of this testing was on OS 1.54; the per-item OS release was not recorded, and none of it is a version-matched hardware report.

- Build 3.0a on OS 1.54, the checklist given for this update (assign, save and power-cycle, pattern switch and copy, sound loads onto tracks 5 to 8 and 1 to 4, a MIDI track's TRIG page, the Euclidean and cc-names image): the author reported "everything seems good" apart from the Overbridge delay under "Overbridge delay" above. Reported as a whole; the individual steps were not itemised. Build 3.0d on OS 1.53, a smoke test of the same functions on a unit: the author reported "I think we're good to go". Reported as a whole; the individual steps and the pass or fail of each were not itemised. Build 3.0d on OS 1.54 was tested by the author with Overbridge connected (see "Overbridge delay").
- FUNC and turn snapped much more sensitively than a stock page (before the lock fix), then "a load better" after it (2.2a).
- Track and parameter chooser resolution "right for both" after matching the SAMP selector (2.2b).
- Selecting a pattern while it plays: the parameters did not reset to the pattern's values at first (2.2d), then "that works now" (2.2e).
- Chord setup, metronome, scale, microtiming and retrig screens "look good" (2.3c).
- Overall, "hardware looks pretty good"; a slight delay in the knob indicators after a pattern change was reported, and a change to show the new values at the switch followed (2.3a, not re-reported).
- OS 1.53: a final smoke test on a unit (build 2.3c) that the author describes as covering a good part of the main functionality: the page opening, Perform Quick Assign, setting and editing assignments in Perform Edit, and changing assigned parameter values with the knobs. Not a full pass.

Not tested on a unit, or not reported step by step: the current storage layout's checklist above was reported only as a whole, so each step (power-cycle persistence, sound loads onto tracks 5 to 8 and 1 to 4, the all-tracks setting) has no item of its own; a project saved with assignments loaded on a build without the module; CPU load (never timed), every combination with other mods, and the stock flows compared side by side beyond the screens above.

## Category checklist (system)

- Put the setting where it belongs: PERFORM EDIT is a row in SETTINGS; the page is the second page of TRIG. Done.
- A way to turn it off that restores stock: leaving the page puts every parameter back; not installing the module restores stock. Compared on the emulator for the screens above only.
- Defaults are stock behaviour: no assignment exists in a new project, so nothing moves until one is made. Emulator only.
- Persistence: stored in the sound records' spare bytes. Pattern and kit copy carry it in the emulator; power-cycle survival is not tested.
- A project with assignments loaded without the module: not tested.
- Affected: the original Digitakt on OS 1.53 and 1.54, audio tracks 1–8; existing projects are unchanged until an assignment is made.

## Documentation capture — 28 October 2026

Documentation version: `0.1.0-experimental`. Source revision: `ef0a333cf01282ecd0ae896abb878cf71b38bf9a` (`sdk/digitakt/modules/digiperform`). The OS 1.54 image above was captured through real panel inputs in the pinned digiemu with firmware-native drawing (`hle=False`) and a disposable first-boot project. The capture script runs without the audio engine, so the knobs show their assignment but not live values. Only complete, unmodified LCD frames were kept at 6× integer scale, and every image was opened for review. The record is [capture.json](media/capture.json); the plan is [capture-plan.txt](media/capture-plan.txt).

- The Perform page with eight empty knobs.
- Perform Quick Assign: choosing the track for knob A.
- Knob A assigned to track 1's TUNE.
- SETTINGS > PERFORM EDIT.
- Perform Edit with row A set.

UI-only documentation; no hardware, audio, timing, persistence or stress qualification. Reproduce with your own OS file, keeping firmware and emulator outputs outside the checkout:

```sh
python3 scripts/capture-digi-module-ui.py \
  --emulator /path/to/pinned/digiemu \
  --firmware /private/capture/custom.syx \
  --plan sdk/digitakt/modules/digiperform/media/capture-plan.txt \
  --out /private/capture/new-session
```

Run that inside the isolated sandbox described in [MODULE_UI_CAPTURES.md](../../../../docs/MODULE_UI_CAPTURES.md).
