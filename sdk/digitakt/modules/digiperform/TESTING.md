# Digi Perform testing

## In Modwerk

Evidence tier: `author-hardware` for 0.1.4-experimental: the author's report is [evidence/hardware-testing.json](evidence/hardware-testing.json), bound to the source by [evidence/source-identity.json](evidence/source-identity.json). The author's observations on a unit are listed below as they were reported.

Source: `sdk/digitakt/modules/digiperform/src` at commit `d9c785fea1de7934ab3ad75a3a9e7cf085e67c4b`. Modwerk's pinned toolchain compiled the source twice and produced the source-only packages in `sdk/imports/packages/digiperform/` (no stock bytes: addresses, lengths and SHA-256 guards only). The vendored elekloader builder (kit 0.7.0) then linked core 2.1 and Digi Perform into a local image on each release, with the owner's stock OS files, which stay on the author's computer:

- OS 1.54: core 2.1 and Digi Perform 0.1.4-experimental, built and verified; Digi Perform package SHA-256 `1a6a5fe353b2d35e16e5a7370457564b2f21724b26b28f8bba9384a197164062`.
- OS 1.53: core 2.1 and Digi Perform 0.1.4-experimental, built and verified; Digi Perform package SHA-256 `f3700850477ecf52dd821e0a601a9425bf1ea21a8daf5c7827077ea12c4e0cc6`.

The images the author tested on a unit (build `5.0f`, alone and beside CC Names) were linked from packages whose code, sites and relocations are the same as these; they differ only in the version text, the description and two added claim names (compared on both releases).

Both are build checks; the author's hardware observations are listed below.

## Resources

- Memory: 30,220 B per release: 24,934 B in `.run`, 5,266 B in `.bss` and 20 B of table contributions (five core events); 26,776 B in 0.1.3-experimental. The MIDI CC knobs add about 3 KB, of it a 512 B cache of CC slot names. No FAST AUDIO bytes. This is the object's size, from the package; it excludes the shared core and linker alignment.
- Load, reported by the author on a unit (OS 1.54, build `4.3h` with DigiChain 1.6, Digi Mono 0.13.3 and digihealth 1.0; digihealth's SYSTEM INFO DSP reading, FAST AUDIO unticked after boot, samples loaded, Overbridge connected, a MONO ENS note playing): stock page 96%, Perform page while turning an assigned knob 97%, no delay. Readings vary by a few points; they are read off the screen, not timed. The audio hook returns at once while no knob is moved; with one moved it adds and clamps a list of parameter words the UI prepares. Emulator per-block cost (never hardware evidence) is under "SRC names and Overbridge load (0.1.3)".

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

Fixed in 0.1.3: the knob labels on SRC slots now follow the track's machine (see "SRC names and Overbridge load (0.1.3)").

Known limitation, reported by the author: when a new pattern starts to play, the value indicators briefly show the previous pattern's value and then update to the new pattern's. The cause is not confirmed; the engine's smoothed parameter words probably still run from the old sound to the new one when the knobs pick them up. A build that read the new sound's stored value instead (3.0e) made, in the author's words, "not much difference", and was dropped. The flash could not be reproduced in the emulator.

## Filter page 2 slot order (0.1.1)

Found by the author on a unit: FLT.BASE moved the filter width and FLT.WDTH moved nothing. Emulator (digiemu, OS 1.54, build 3.0g; never hardware evidence): turning each knob of the stock Filter 2/2 page and watching the smoothed parameter words showed the sound's slots 33 to 37 are BASE, WDTH, DEL, SRR and ROUT; the module had DEL, BASE, WDTH. The same check on LFO 1, LFO 2, SRC, Filter 1/2 and AMP found their slots in the module's order. Fixed in 0.1.1; a saved assignment keeps its slot number, so one that played as width and was named BASE now shows as WDTH.

Reported by the author (ROMsets): build `3.0h` tested on a unit on OS 1.54 and on OS 1.53, and the fix works ("good to roll out"). The reports give no further step-by-step detail, so the pass is recorded only as that.

## Screen saver (0.1.2)

Found by the author on a unit: when the screen saver turned the display off while the Perform page was open, the stock header went but the Perform page stayed drawn. Read from the OS 1.54 code (static, never run on a unit): the saver is not a view. The application object keeps an idle counter and a state (0 awake, 1 dimmed after 5 minutes, 2 off after 60 minutes, thresholds as in the user manual); the dim is only a brightness command to the display, and at state 2 the firmware blanks its own screen. The page kept drawing into the frame and set the view's dirty flag on every tick, so it painted over the blank screen. Fixed in 0.1.2: while the state is 2 the page neither draws nor asks for a frame. The state's address was found for OS 1.54; the OS 1.53 address was found by the same code pattern in the raw image and has not been checked by reading the 1.53 code.

Emulator (digiemu, OS 1.54, never hardware evidence): with the unfixed build `3.0h`, after 66 emulated minutes idle on the Perform page the stock header was gone and the Perform page was still drawn, and after a FUNC press the page returned without its header. With a debug variant of the fixed logic (same code plus debug text, not the 3.0i image itself) at the same point the frame was black, and after a FUNC press the page and header returned. The emulator does not draw the 5-minute dim.

Reported by the author (ROMsets): build `3.0i` tested on a unit on OS 1.54 and on OS 1.53, and the fix works ("That works"). On OS 1.53 the author saw the stock TRIG page after waking, not the Perform page; on OS 1.54 the author tested the wake and did not notice that. The idle time, and TRIG hold and the knobs after it, were not reported in detail, so the pass is recorded only as that. Known minor issue, reported by the author: on OS 1.53, waking from the saver may show the TRIG page instead of the Perform page. Not investigated.

## SRC names and Overbridge load (0.1.3)

What changed: a knob on an SRC slot takes the track's machine's own short and long name, value text, range and step from the stock SRC page's routines, asked for the knob's track with interrupts off while that track is made the active one, and cached per track and machine. Those routines are reached through stock call sites that CC Names (0x40030daa), Digi Mono (0x40030daa, 0x40032d36, 0x40032d16), DigiChain and DIGISLICER (0x4000f534) patch; Digi Perform calls them and patches none of them, so on its own it gets the stock answers. A knob on a slot the machine does not have is unassigned. The audio hook works only while a knob is moved, frames are asked for only when the page's content changes, and the TRIG page's body is not drawn under the Perform page (new site 0x400368e0, a `jsr` in the TRIG view's draw on both releases, claimed in `platform.claims`; one forced frame redraws the TRIG page when the Perform page is left).

Reported by the author (ROMsets) on a unit, OS 1.53 and 1.54, about 2 hours in all, with test images of these sets: alone, mono (DigiChain 1.6, Digi Mono 0.13.3), monohealth (the same with digihealth 1.0), neighbor (Digi Neighbor 0.6), poly (DigiChain 1.6, Digi Poly 2.0), ram (Machine Pages 1.2, RAM Machines 1.3.1), slicer (DIGISLICER 2.1), sophie (Digi Sophie 1.1.13) and string (Machine Pages 1.2, STRING 0.9.0):

- Build 4.3h, the checklist given for this version: knobs moving the sound including an ALL and a negative knob, FUNC and push resetting a knob, a pattern change letting the knobs go, assigning and clearing while playing, fast turns against the SRC page, knob G push and turn, machine-menu scrolling, leaving the page every way (TRIG, SRC, FLTR, AMP, LFO, menus, FUNC chords) with the stock page drawn in full, and a pass with each set above, Digi Poly's LEV display on a POLY track included. The author reported it good ("I'm happy with the testing"). Reported as a whole; the steps were not itemised.
- Overbridge delay: the author found a delay between a turn and the sound with Overbridge connected and Digi Mono's ENS, VO or POLY SIN playing, on the Perform page only. With the earlier builds the DSP reading reached 100% while turning on the Perform page. Build 4.3h: stock page 96%, Perform page while turning 97%, no delay (conditions under Resources). With digihealth's FAST AUDIO on, an earlier build (4.3g) read stock 88%, Perform idle 79%, turning about 90%.
- Not reported separately: which checks ran on which OS release (the DSP readings are OS 1.54), and combinations other than the sets above.

Emulator (pinned digiemu, OS 1.54, audio engine on; never hardware evidence): per audio block, normalised to the render's own call count, an idle Perform page cost the same as the SRC page, and a turning knob added 0.0285 against 0.0348 for a turn on the stock SRC page. The engine's parameter word for a turned knob followed the turns and returned to its stored value on leaving. After leaving the Perform page by the emulator plan's routes, the stock pages drew in full in the mono and poly sets.

## Saved project and power cycle (0.1.3, fixed in 0.1.4)

Reported by the author (ROMsets) on a unit, 11 November 2026, build 4.3h (this source) and the published 0.1.2-experimental package (image label 012a, core 2.1 only):

- Assign knobs, SAVE PROJECT, power cycle: the assignments are not there ("I save the project after assigning knobs, restart the device and the knob assignments are no longer there").
- Then LOAD PROJECT of the same project: "load project brings them back".
- A stock edit before the power cycle does not keep them: "stock edit does not keep".
- SAVE PROJECT, load a different project, load this one back: the assignments come back.
- 0.1.2-experimental: "the save behaviour is the same in 0.1.2".

So the saved project holds the assignments, and only the state the unit starts from at power-on lacks them. The storage is unchanged since 0.1.2-experimental. Emulator (never hardware evidence): after SAVE PROJECT a cold boot from the same card came back with all the sound records' spare bytes cleared, a stock parameter written directly into the kit lost too, while LOAD PROJECT right after the save kept them. Not fixed in 0.1.3; fixed in 0.1.4 (see "Power cycle (0.1.4)").

## Power cycle (0.1.4)

What changed: each change of the assignment pool is also copied into the working image, the serialized copy of the project in RAM that the Digitakt writes to the +Drive at power-off and starts from (OS 1.54 `0x406490e8`, OS 1.53 `0x406480e8`; only the pool's own bits of tracks 5–8's spare bytes). No new patch site, and no stock call.

Reported by the author (ROMsets) on a unit:
- Build 014b (this fix alone, Digi Mono set): "Smoke test is all good", with assignments made without saving and kept through a power cycle.
- Build 5.0f, OS 1.53, part of the 0.1.4 checklist: assignments kept through a power cycle without saving, and SAVE PROJECT then LOAD PROJECT brought the saved ones back. Reported as a whole ("Everything seems good", "I have performed all those tests on 1.53").

Emulator (pinned digiemu, OS 1.54 and 1.53; never hardware evidence): with the working image written to the +Drive's power-off sector and a cold boot from that card, this build kept all twelve pool bytes and 0.1.2-experimental lost them.

## MIDI CC knobs (0.1.4)

What changed: parameters 46–53 are a MIDI track's CC VAL 1–8 (no storage change; older versions read them as empty). Quick Assign and Perform Edit list 1–8, ALL, then the MIDI tracks 9–16 that have a CC VAL slot turned on, and on those only the slots turned on. A CC knob reads the stored CC VAL, sends stored value plus offset through the stock CC send queue (OS 1.54 `0x400e0b94`, OS 1.53 `0x400e096c`, called from the UI task only) and sends the stored value again when it lets go. Its label comes from the stock short-label call, asked with the MIDI track's view, so CC Names' names show.

Reported by the author (ROMsets) on a unit, build 5.0f:
- "the midi cc knobs send fine to my synth" (with CC Names in the image).
- On OS 1.53, as part of the checklist: the stored value comes back when the knob lets go (leaving the page, NO, pattern change), an LFO on a CC VAL, and Overbridge; reported as a whole. Sequencer trigs on the MIDI track: "a recorded CC trig value always superceeds the perform mode value" (documented as a limitation).
- A paste failure was reported and then withdrawn: the CC slots had not been turned on in that pattern ("My mistake the midi CCs werent assigned on the midi page"). The README says a pasted CC knob stays only where its slot is on.
- OS 1.54: smoke test ("I have already smoke tested 1.54"); the steps were not itemised.

Emulator (pinned digiemu with its MIDI output recorded; never hardware evidence), OS 1.54 and 1.53, alone and with CC Names: a CC knob on MIDI track 16 VAL1 (stored 3) sent `b0 00 05`/`06` while turned and `b0 00 03` on leaving; a CC Names name showed under the knob and in the header; Perform Edit stepped T1 .. ALL .. T9–T16 and their slots; a MIDI track with every VAL off was skipped in both lists; turning VAL1 off on its page left the knob empty when Perform was opened again; the assignment survived the simulated power cycle and still sent.

Not tested: a CC knob beside other MIDI mods (MIDI Retrig, cc-recall, FX Track), and the ALL target (it never includes MIDI tracks).

## Labels beside CC Names (0.1.4)

Reported by the author on a unit (5.0e, CC Names set): an SRC knob's label read ERR; the CC knobs' labels were right. Cause: CC Names' hook at the short-label call (0x40030daa) reads the parameter id from register d2, and Digi Perform called that site for SRC labels as plain C, so d2 held what was left there. 0.1.3-experimental has the same fault beside CC Names. Fix: the SRC labels are asked with d2 and a4 set as at the stock call. Emulator: 5.0e shows ERR and 5.0f shows TUNE, on OS 1.54 and 1.53. Author on a unit, 5.0f: "ERR is gone, names show correctly now". The other modules patching the sites Digi Perform calls (Digi Mono, DigiChain, DIGISLICER, Digi Sophie 1.1.13, Machine Pages) read the stack or a0/a2, which Digi Perform sets.

## Beside Crossfader and Live Looper (emulator, 0.1.4)

OS 1.54, core 2.1, Machine Pages 1.2, Crossfader 0.1.0-experimental and Live Looper 0.1.0-experimental with this source, linked without overlap (never hardware evidence): SETTINGS lists PERFORM EDIT and CROSSFADER; with Crossfader's FADER ON on track 1, LEVEL on the Perform page moves the fader, while LEVEL in Quick Assign and in Perform Edit (its row cursor) leaves it alone; a LOOPER track's SRC parameters list by name in Quick Assign. Audio was not run.

## Author's hardware observations

Reported by the author (ROMsets) while testing local builds on a unit, build labels in brackets. These builds (2.x) kept the assignments in other bytes of the kit than the current layout (tracks 5 to 8's spare bits, build 3.0a), so none of this, except the first item (3.0a), covers the storage as it now is. Recorded as reported. The author says most of this testing was on OS 1.54; the per-item OS release was not recorded, and none of it is a version-matched hardware report.

- Build 3.0a on OS 1.54, the checklist given for this update (assign, save and power-cycle, pattern switch and copy, sound loads onto tracks 5 to 8 and 1 to 4, a MIDI track's TRIG page, the Euclidean and cc-names image): the author reported "everything seems good" apart from the Overbridge delay under "Overbridge delay" above. Reported as a whole; the individual steps were not itemised. Build 3.0d on OS 1.53, a smoke test of the same functions on a unit: the author reported "I think we're good to go". Reported as a whole; the individual steps and the pass or fail of each were not itemised. Build 3.0d on OS 1.54 was tested by the author with Overbridge connected (see "Overbridge delay").
- FUNC and turn snapped much more sensitively than a stock page (before the lock fix), then "a load better" after it (2.2a).
- Track and parameter chooser resolution "right for both" after matching the SAMP selector (2.2b).
- Selecting a pattern while it plays: the parameters did not reset to the pattern's values at first (2.2d), then "that works now" (2.2e).
- Chord setup, metronome, scale, microtiming and retrig screens "look good" (2.3c).
- Overall, "hardware looks pretty good"; a slight delay in the knob indicators after a pattern change was reported, and a change to show the new values at the switch followed (2.3a, not re-reported).
- OS 1.53: a final smoke test on a unit (build 2.3c) that the author describes as covering a good part of the main functionality: the page opening, Perform Quick Assign, setting and editing assignments in Perform Edit, and changing assigned parameter values with the knobs. Not a full pass.

Not tested on a unit, or not reported step by step: the current storage layout's checklist above was reported only as a whole, so each step (sound loads onto tracks 5 to 8 and 1 to 4, the all-tracks setting) has no item of its own; a project saved with assignments loaded on a build without the module; CPU load (never timed), every combination with other mods, and the stock flows compared side by side beyond the screens above.

## Category checklist (system)

- Put the setting where it belongs: PERFORM EDIT is a row in SETTINGS; the page is the second page of TRIG. Done.
- A way to turn it off that restores stock: leaving the page puts every parameter back; not installing the module restores stock. Compared on the emulator for the screens above only.
- Defaults are stock behaviour: no assignment exists in a new project, so nothing moves until one is made. Emulator only.
- Persistence: stored in the sound records' spare bytes and mirrored into the working image. Pattern and kit copy carry it in the emulator; SAVE PROJECT, LOAD PROJECT and a power cycle keep it on a unit (0.1.4, see "Power cycle (0.1.4)"; 0.1.3 lost it at power-on).
- A project with assignments loaded without the module: not tested.
- Affected: the original Digitakt on OS 1.53 and 1.54, audio tracks 1–8; existing projects are unchanged until an assignment is made.

## Documentation capture — 13 November 2026

Documentation version: `0.1.4-experimental`. Source revision: `d9c785fea1de7934ab3ad75a3a9e7cf085e67c4b` (`sdk/digitakt/modules/digiperform`). An OS 1.54 image with core 2.1 and this version's package (build label `3.1b`, image SHA-256 `98e36f97d692363b6d34a161578591f2ed1645fbcfb25c1e0482136a82afdfaa`) was captured through real panel inputs in the pinned digiemu with firmware-native drawing (`hle=False`) and a disposable first-boot project. The capture script runs without the audio engine, so the knobs show their assignment but not live values. Only complete, unmodified LCD frames were kept at 6× integer scale, and every image was opened for review. The record is [capture.json](media/capture.json); the plan is [capture-plan.txt](media/capture-plan.txt). The plan sets knobs A to G through Perform Quick Assign with bursts of turns, whose steps are chosen by the emulator's turn handling, so the plan is only reproducible as written; this run landed on other choices than the 0.1.3 run, knob B on a MIDI track's CC since the track list now runs on past ALL.

- The Perform page with eight empty knobs.
- Perform Quick Assign: choosing the track for knob A.
- Seven knobs assigned: A and C for all tracks (TUNE, LEN), B for MIDI track 9's CC VAL3, D to G for tracks 8, 3, 2 and 2 (F.TYP, PLAY, PLAY, STRT), H empty.
- SETTINGS > PERFORM EDIT.
- Perform Edit with rows A to F set.

UI-only documentation; no hardware, audio, timing, persistence or stress qualification. Reproduce with your own OS file, keeping firmware and emulator outputs outside the checkout:

```sh
python3 scripts/capture-digi-module-ui.py \
  --emulator /path/to/pinned/digiemu \
  --firmware /private/capture/custom.syx \
  --plan sdk/digitakt/modules/digiperform/media/capture-plan.txt \
  --out /private/capture/new-session
```

Run that inside the isolated sandbox described in [MODULE_UI_CAPTURES.md](../../../../docs/MODULE_UI_CAPTURES.md).
