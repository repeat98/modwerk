# Apply Scene testing

## 0.2.0: TRIG + SCENE (emulator only, 22 Oct 2026)

Not run on hardware. Everything in this section is ot_emu (`--mkii`), which does not count as hardware evidence.

**Stock first.** On the stock 1.40C image under ot_emu, in grid recording on the TMPL project: holding a trig and pressing SCENE A changes no pattern or Part byte, and the held trig stays after its release. A trig pressed while SCENE is held still selects a scene (trig 9 → scene 9, held mask unchanged), and a knob writes a scene lock, not a p-lock. Outside grid recording the held-trig mask `0x460d174a` stays 0. SCENE's press `0x4004348c(key, 1)` and release `0x40054ca4(key, 0)` handlers are the same with or without a trig held. Stock's knob-with-trig lock writer `0x400508e4` stores bank RAM and the battery copy at `0x1001614e`, sets the step's has-locks bit `0x46c7d48c[step]`, the edited flags `bank + 0x9b332` and `0x100f8598`, calls `0x40027e00`, then `0x4009da20(track)`, and clears the remove-on-release masks `0x460d1a9e..0x460d1aa6` and `0x460d10dc`. It writes no lock-trig mask: in grid recording a press on an empty step places a trig at once, so every held step has a trig.

**The module.** The source on branch `claude/apply-scene-extension-f84ceb` (on main f99681ec, the stock-free reorder included), built as in the commands below (`make bus REMIX=apply-scene-stock BUILD=0`, every stock effect, `static_stock=True`): MAIN OS SHA-256 `c625bbd1ec4faff6a98bb054abad1522042a09dc68262b3629991af7c00fc48d`, the unit in the DRAM reserve at 0x40a955e0 with three detours (`as_yes_hook` 0x4005e4c8, `as_scene_press` 0x4004348c, `as_scene_release` 0x40054ca4). verify.py passed 264/264, the 179 checks of 0.1.0 among them (also on the build before the reorder, `dde5f7f9…`). The new checks, on T3 (the fixture's current track) with trigs poked onto steps 2, 5 and 10 and 16 pseudo-random p-locks on step 5:

- The blend on two steps at fader 127, 64 and 0, SCENE A and SCENE B on two steps, the blend on three steps at fader 32: every held step's lock bytes equal the model, no other pattern byte moved (the trig masks included, so the held trigs stayed), the battery copy equals RAM, the Part is unchanged, the step's has-locks bit is set, one toast with the mode's text.
- SCENE A twice: the second writes nothing and shows NOTHING TO LOCK.
- Key order: B then A pressed and A released first; A and B pressed, B released, then A; the trig released before SCENE A. Each writes as the model.
- Scene A muted: the blend treats A as unlocked; TRIG + SCENE A still writes A's locks.
- Stock inside the chord: TRIG + SCENE A + TRIG 3 selects scene 3 and writes no lock and no toast; TRIG + SCENE A + knob D on AMP writes the scene lock (52 → 57) and no p-lock. TRIG + knob D without a scene key still writes stock's one p-lock byte.
- Persistence: a blend written before PROJECT SAVE is in T3's pattern track after a fresh boot of the saved card; an unsaved SCENE B write survives the emulated power cycle (`--cs1-in --no-post`), the whole pattern byte for byte.

**Cost.** One more probe on the same image: all 16 trigs held, every scene byte of the track locked in both scenes (A 0, B 127), so every enabled slot of every step changes. From the last scene key's release to the toast: 66,929 executed ColdFire instructions for the blend, 98,681 for SCENE A after it, 19,444 for a repeat that changes nothing. Nothing runs between presses. The p-lock path writes bytes directly as stock's lock writer does and calls stock's refresh once, not per write, so it is far below a Part apply (2.3 to 11.1 million). Time on the unit is not measured.

**Size.** The unit assembles to 2,062 bytes (`m68k-elf-size`, both `-mcpu=5475` and `54455`), including 100 bytes of chord state; it was 636.

**USB package (private, not committed).** `build.py --octabam apply-scene --name "APPLY SCENE" --stock <1.40C .syx> --upstream <elekloader>`: module 103be957 (0.1.0's id), ABI 7, three hashed sites, 2,064 bytes of code and data, no relocations or hooks, 2,282 bytes, SHA-256 `5b1db5c76dabfd3023c0d2a81d53fac43610fa579142870190f7ca41c89c2ed1`. The strict scans build.py uses for private packages (module_packages, check_stock_free): longest run shared with the stock OS 11 counted bytes (limit 12, the toast texts), no 16-byte run. The first build shared 16 to 36 bytes with stock where the new code stored the same flags in the same order as stock's lock writer; the stores were reordered (same effect, checked by the rerun above). Installed on the MKII on 23 Oct (below). The published package `public/octatrack-modules/apply-scene/0.2.0-experimental.mwrm` (SHA-256 `236231aaaf2914ed4a4932eda74c455f834d9e0791c0833addd5589b31d23869`, 2,282 bytes) differs from the tested one only in its 16-byte display name (Apply Scene, not APPLY SCENE), as 0.1.0's did; it was built with the full run's own builder function for this one entry, because `npm run octatrack:module-packages` stops on main's Tape Echo and Euclid standalone recipes (their engine-asset pins are stale on main itself), and passes the same strict scans.

### On the MKII over USB (23 Oct 2026)

The user's MKII (OS 1.40C), freshly powered on from its flashed main base `a408c505…`, RAM-booted into a development twin of main's base (this branch merged with main c69b1cfe, main's flags plus `--dev`, built against the pinned Elekloader 3b31ef3c; base `8dc7692c…`, `.bin` `3b34b7de…`; stock-free and flash-safety checks passed). The package above (`5b1db5c7…`, the same bytes when rebuilt against the pinned Elekloader) installed with the session's `try` and was accepted (generation 1). Driven by the agent over USB (`scripts/device-send.py`), values read from RAM and screenshots; no audio was listened to. Bank P pattern 16 of the user's project, empty before; Part 1 of bank P, working equal to saved before; current track T3 (STATIC), AMP page.

- Scene locks set by hand: scene 1 (A) AMP ATK 20 and VOL 49; scene 9 (B) VOL 94 and encoder F (XVOL with a scene key held) 127.
- Grid recording, trigs placed on steps 1 and 5. TRIG 1 + SCENE A: step 1 got exactly 20 and 49 in ATK's and VOL's slots, nothing else; the trigs stayed; toast SCENE A TO TRIGS (screenshot). Pass.
- Crossfader at 76 (weights read from RAM), TRIG 5 + SCENE A + SCENE B: ATK 16 and VOL 67, the morph model's values; XVOL got no p-lock (the page has no such knob; stock has no p-lock there either). Pass.
- TRIG 1 + SCENE A again: NOTHING TO LOCK, step 1 unchanged. Pass.
- TRIG 1 + SCENE A + TRIG 9: scene A became 9 (screen 09+09), no toast, step 1 unchanged. TRIG 1 + SCENE A + knob B: scene A's HOLD lock written (unlocked → 127), step 1 unchanged. Pass.
- TRIG 1, 5 and 9 held (9 placed first) + SCENE B: each step has B's VOL 94; step 1 kept its ATK 20 from scene A, step 5 its blended ATK 16. Pass.
- TRIG 13 + SCENE A, the trig released before the scene key: written. With scene A muted (FUNC + SCENE A), TRIG 15 + SCENE A: written. Pass.
- TRIG 1 + PLAY (stock): step 1's p-locks cleared. Pass.
- Playing P16 (grid recording off), T3's live AMP lane (`0x80000810 + 72·2`, sampled for 4 s) showed step 5's 16/94, step 9's 94, steps 13 and 15's 20/49 and the Part's own values in turn. The locks reach playback; not listened to.
- Removal (`remove`, accepted, generation 2): the three sites read stock's bytes again.

Put back: P16 cleared with stock FUNC + PLAY (its trigs and locks are empty again; stock's clear also set the hidden pattern field at `+0x8e50` from 16 to its default 64, as it does under ot_emu; the PATTERN SCALE page still reads 16/16 1x). RELOAD refused (SAVE PART FIRST!: bank P's Part 1 was never saved), so the test's scene locks were removed with SCENE + encoder push and two AMP knobs turned back: Part 1's working copy equals its saved copy again, which never changed. Nothing was saved; the unit stays on the RAM-booted twin until a power cycle returns it to its flashed base and kept modules.

### The user's own run on the flashed base (23 Oct 2026, MKII)

After the power cycle, on the flashed main base `a408c505…`, the agent reinstalled the user's eight modules with the session's `try`, Apply Scene as this package (`5b1db5c7…`), and the user tested by hand in a scratch project or empty pattern. User-reported, all pass: TRIG + SCENE A (and B) writes the scene's values onto the held trigs; TRIG + SCENE A + SCENE B writes the blend; playback, listened to; the p-locks kept through a project save and a power cycle; inside the gesture a trig still selects a scene and a knob still writes a scene lock, with no p-lock written; TRIG + PLAY clears a step's p-locks.

(The twin run above overwrote the flashed base's kept set: both `/MODWERK?.SET` card files then carried the twin's identity, so the flashed base loaded no modules after the power cycle. Restored by reinstalling each package, the base-bound Analog BD and Output Matrix from the commit that built `a408c505`. Written up in docs/OCTATRACK_DRIVING.md on its own branch.)

Not run on hardware: the MKI, MIDI mode, trig pages past the first, the card build, and the site's review/Keep/Undo flow (the session's `try`/`remove` were used).

**Not tested (emulator section):** any hardware run (see above for the MKII), audible output, the USB package build and its stock-free scan, the browser builder's comparison (`module:verify`), MIDI mode, a pattern or Part change inside the chord (the chord is then dropped, by design, untested), trig pages past the first, and track 8 as the master track.


Emulator only, 15 Oct 2026. The source is commit `ae2a6eed` on branch `claude/apply-scene` (merged with main 86e0dfb8). The image is byte for byte MAIN OS SHA-256 `c4c210ceb0e32703dcfb04b86120e334856fd83279740be54e7ef73b7939af3b`. From a90849c9 the card build links the unit in the DRAM reserve (Play Modes' path), so the site's builder and native octabam agree beside Preview Vol, Mute Modes and the caves; that image (MAIN OS `3a74ff3635ce172ec3ef5949d188ebb297b0e8d969ca2b5d060b76420dded0bc`, the unit at 0x40a955e0, loaded at boot) passed verify.py 179/179, including the worst case and the emulated power cycle. The USB package is byte-identical to ae2a6eed's. The image is the native build of a local remix holding only APPLY SCENE plus every stock effect on both menus, with `static_stock=True`:

```sh
make bus REMIX=apply-scene-stock BUILD=0          # in a scratch copy of sdk/octabam
APPLY_IMAGE=out/mainos_bus.bin OT_EMU=<octabam>/out/emu/ot_emu \
  APPLY_PROJECT=<octabam>/out/_stage_tmpl/OCTABAM/TMPL OT_PY=<octabam>/.venv/bin/python3 \
  python3 modules/apply-scene/verify.py
```

The build reports `apply_scene 636 B linked at 0x400d6b80` and `jmp 0x4005e4c8 -> apply_scene:as_yes_hook`. No DSP code and no other site.

## What verify.py checked (PASS, ot_emu `--mkii`)

The fixture: octabam's TMPL project, with bank 1 Part 1 (working and saved copies) rewritten. The machines are STATIC, FLEX, THRU, NEIGHBOR, PICKUP, FLEX, STATIC, FLEX, with MASTER TRACK on. Each track has a different stock FX1/FX2 pair with its defaults. Scenes 2 and 10 are selected. Pseudo-random locks sit on about 60 % of the 30 scene bytes of every track, so each track has bytes locked on both sides, on A only, on B only and on neither. These include slots the page does not have, AMP XVOL and XLV. Two unselected scenes also carry locks.

- **The apply.** The blend (SCENE A and SCENE B held + YES) ran at fader 127, 96, 64, 32 and 0; SCENE A + YES at fader 64 and 0; SCENE B + YES at 96 and 127. Each run wrote about 110 to 160 bytes. Each time:
  - Every byte equals the model, and no other byte of the working Part moved. One scene: that scene's lock, clamped to the page's range, on enabled slots only; unlocked bytes stay. The blend: the A/B blend, the Part value for an unlocked side, the track's weight long, MAC rounding, the nearest step, and the page's own range and enabled slots.
  - The saved Part, all scene locks, XLV, the scene selection, the mutes and the fader are unchanged.
  - The CS1 working copy equals RAM and the unsaved bit is set.
  - Exactly one toast appears, with the mode's text (SCENE A APPLIED, SCENE B APPLIED, SCENE BLEND APPLIED), or NOTHING TO APPLY when no byte changed.
- **Nothing to apply.** SCENE A + YES twice at the same fader: the second press changes no byte and shows NOTHING TO APPLY. It still calls stock's writer for the fixture's 5 locks that stock clamps back to the Part value, so stock marks the Part edited; the Part bytes stay the same. The blend with both scenes muted writes nothing, leaves the Part clean and shows NOTHING TO APPLY.
  - RELOAD PART (FUNC + CUE) brings back working = saved.
- **The keys that are down choose the mode.** Stock's held-scene word (0x460d169c) names only the last scene key pressed and clears when either is released, so the module reads stock's per-key state table instead. SCENE B then SCENE A held + YES runs the blend (the held-scene word reads A only). Both held, then one released, then YES applies the scene still held, in both orders.
- **The model is stock's.** On T3 (THRU) and T8 (the master), at fader 64 with the transport running, the AMP/FX1/FX2 halfwords of the voice records equal the model computed from the live lane. After a SCENE A apply and, separately, a blend apply at the same fader position, the 16 bytes locked in both scenes kept their halfword. The 12 bytes locked in one scene follow the model from the new base.
- **Scene mutes.** FUNC + SCENE A mutes A. The blend then treats A as unlocked; SCENE A + YES still applies A's locks. With both muted the blend writes nothing and the Part stays clean, and SCENE B + YES still applies B's locks.
- **Stock flows.**
  - YES alone still shows ARM ALL: 0x46c7ff64 is set on press and cleared on release, and no apply runs.
  - YES held before SCENE A goes to stock on both edges.
  - SCENE A + TRIG selects a scene.
  - SCENE A + knob D on the AMP page writes the scene lock and not the Part.
  - SCENE + REC, STOP and PLAY reach their stock handlers.
- **Persistence.**
  - **Save and reload:** an apply, then Part SAVE (FUNC + PART, SAVE), then PROJECT > SAVE. A fresh boot of the written card loads the applied Part as both working and saved.
  - **Power cycle:** an unsaved apply survives. The second run takes the CS1 and card of the first and does the firmware's own power-up load (`--cs1-in`, `--no-post`). The working Part is byte-identical and all eight machine types are intact, so the power-up check of the Part passed.

- **The worst case.** Every scene-lockable byte of all eight tracks locked in both selected scenes (scene A at each slot's minimum, scene B at its maximum, poked into the working Part and its CS1 copy): the blend at fader 64 wrote 201 bytes (every enabled slot) as the model, SCENE A 125 and SCENE B 172, each followed by RELOAD PART.

Cost under ot_emu, from the YES press to the toast: 2.3 to 3.4 million ColdFire instructions for 110 to 160 writes in all three modes, 6.3 million once (160 writes), and 8,268,075 for the worst case (201 writes); a repeat apply that changes nothing, 113,287. Most of it is the stock store and redraw per write. There is no idle cost and no DSP work. Hardware time is not measured.

## Stock flows

| Flow | Result |
|---|---|
| YES alone (ARM ALL) | unchanged |
| SCENE A, SCENE B or both + YES | replaced by the apply (deliberate; README) |
| SCENE + TRIG select, SCENE + knob lock, SCENE + REC/STOP/PLAY | unchanged |
| Grid recording: TRIG held + SCENE A/B (0.2.0) | replaced: the scene's values become p-locks on release (deliberate; README). On stock the press changed no data |
| TRIG + SCENE + TRIG (scene select), TRIG + SCENE + knob (scene lock) (0.2.0) | unchanged; the p-lock write is dropped |
| TRIG + knob p-lock, hold trig + PLAY clear (0.2.0) | the p-lock unchanged; the clear not run |
| FUNC + SCENE mute | unchanged; the blend follows it, a one-scene apply ignores it |
| RELOAD PART, Part SAVE, PROJECT SAVE, project load, power cycle | unchanged; carry the applied values |
| MIDI mode | the gesture is not taken (falls through to stock); not run |
| Pattern or Part change, arranger, sequencer ACT commit | not tested |

## Performance

Not run on the unit. Everything below is ot_emu (`--mkii --dsp`, the ColdFire port built from the `upstream:tools` Octabam checkout 67e5ea37 with the DSP56300/68k cores of a local Octabam checkout), 20 Oct 2026, and does not count as hardware evidence. The port prices every instruction at one step of its own clock, so its microseconds and instruction counts are not the unit's time. The figures above (8,268,075 for verify.py's worst case) were taken with the frame engine off, `--interactive`'s default.

Setup: two native static-stock images built in a private copy of this source's `sdk/octabam`, one with CF METER + CF METER IDLE (upstream Octabam's probe; not in Modwerk) and the stock effects, one with APPLY SCENE added; verify.py's fixture project with T8 FX2 = CF METER and every scene byte of all eight tracks locked in both scenes except T8's FX2 page (CF METER's knobs); transport playing, fader 64. The flood is one three-byte MIDI message per ms (note on, note off 4 ms later and CCs on channels 1-8 and 11, about 1,000 a second) plus clock at 240 BPM. Handler entries of the MIDI thread were counted with the port's PC watch (note on `0x4000e018`, note off `0x4000db98`, CC `0x4000e79c`, clock `0x40005a48`, start, stop).

`npm run perf:audit -- check sdk/octabam/modules/apply-scene/evidence/performance.json`:

| row | result |
|---|---|
| cycles | ✗ no static bound (below) |
| stock benchmark | ✓ the longest frame interrupt grows by 6.9 us (1.9% of the 362.8 us frame), idle falls by 3.6 points vs stock |
| stress | ✓ 1000 messages/s at 240 BPM for 62 s, no stuck note, no hang, 0 dropped |

- **Load (10 s per run, cfmeter.py --dump, five 2 s cycles each).** The flood alone: longest frame interrupt 129.3 us on the stock image, 129.1 us with APPLY SCENE; idle 62.38 % on both. The flood plus SCENE A, SCENE B or both + YES every 0.65 s (16 applies): 129.0 us and 62.43 % on the stock image with the same presses, 135.9 us and 58.78 % with APPLY SCENE. CF METER IDLE reads 0 % on both images (the port fast-forwards main's idle park), so idle is the port's own share: 100 × (1 − executed instructions / (3,990 instructions per sample × elapsed samples)).
- **Stress (62 s, APPLY SCENE image; the same run on the stock image for comparison).** 62,098 messages and 5,963 clocks; STOP with a note held at 7, 22, 37 and 52 s, then Part 2, PLAY, Part 1 (by calling stock's own selection routine `0x4004a8a4`: PART + TRIG did not change the Part in the port's panel script); an apply every 5 s (11, up to 6,832,603 instructions each). No handler saw fewer entries than messages sent (a few types one or two more, on the stock image too: the watch counting an entry twice). Nothing went to MIDI OUT; the per-channel note bookkeeping at the end equals the stock image's. No samples are loaded and no MIDI track plays notes in this project, so an audible stuck note could not occur here. Frames ran to the end and a SCENE A + YES after the last STOP was answered.
- **Cycles.** With the frame engine on, the blend with every scene byte of all eight tracks locked (231 writes, T8's FX2 page included) ran 11,083,553 instructions from YES to the toast, interrupts in that window included; SCENE A 4,104,661 (143 writes), SCENE B 5,966,265 (193 writes). A static bound is not given: almost all of it is stock's page-1 writer `0x40054cd8`, one call per write, which took 76 to 1,404,162 instructions per write in the blend, depending on the parameter. The rest of the event (the module's own code and the interrupts that landed outside the writer calls) was 10,462 to 397,135. The budget (100 ms at 266 MHz) is a responsiveness target, not a measured limit.

## Resources

636 bytes of ColdFire code and data, placed in the image's free run (`0x400d6b80` in the test build). One byte of state (whether the YES press was taken). No DSP memory and no saved data.

## Hardware

### Earlier behaviour on OMXATS30 (15 Oct 2026)

The user's combined MKII image OMXATS30 carries the earlier source (commit 719926a2, the same module tree as 270a2dae), where SCENE A + YES and SCENE B + YES both wrote the crossfader blend. Card file `OCTATRACK_OMXATS30.bin` SHA-256 `7d1fda80c0ee0a24ab34ed073e87e7bc01e2fb05987cd61fb50dbcd4ca69f3be`, MAIN OS SHA-256 `3d620adce09a1239066ca382a6db5787aa70667ee09870fe5c364b8f9340e55e`; verify.py on it 73/73. It also holds Output Matrix, Analog BD 0.1.6 (draft), Quantize Live Rec, RINGMOD SC, Mini Verb and two private modules. Reported by the user: steps 1, 2, 5 and 6 below passed (setup, apply while playing, YES alone shows ARM ALL, RELOAD PART). They also reported that FUNC + SCENE muting "does not seem to work"; not diagnosed further, because it led to the redesign below. These results do not cover the current source.

### da2d18e4 over USB on the beta base (15 Oct 2026, MKII)

Reported through the session "firmware builder", recorded as written.

- **Unit and package:** user's MKII, OS 1.40C, beta base acf91e0a350e182d…. Package apply-scene-da2d18e4.mwrm (source da2d18e4), SHA-256 577a22e9b19df7f0f299d4cb01ca146827c0914e14a73bbad53c20000540467d. The device tool results, seen by that session:
  - `try --seconds 15` without accept rolled back to the base (generation 2, base active): the Undo check.
  - `try --accept` kept it (generation 3, active 577a22e9…).
  - `remove <file> --accept` was accepted (generation 4, active 472e6d03…, the removal package).
- **User-reported, while it was installed:**
  - SCENE A + YES and SCENE B + YES applied the locked values: pass.
  - Editing from the applied values afterwards: pass.
  - XVOL/XLV stayed scene locks: pass.
  - The blend (both keys + YES, crossfader in the middle) passed.
  - On a cleared scene, SCENE + YES still shows the toast.
  - No click or freeze seen in earlier testing.
  - Audio was not checked; the user only watched the values update.
- **After removal (user-reported):** SCENE + YES does stock's arming again ("just arms track"); nothing is applied: pass.
- **Still pending:** persistence across a power cycle.

### Published package (15 Oct 2026)

The site's builder names the package from the catalogue, so the published `0.1.0-experimental.mwrm` (SHA-256 `bd90b397d9dffa8d0159355baf4363e73da7bf18fd6a30624eb9fbdd2d76fb73`, from a90849c9) differs from the tested `c63e2868…` only in its 16-byte display name (Apply Scene); the code bytes are identical. Install only, not a functional test: the published package bd90b397… was installed and kept on the user's MKII (flashed base 38a0bde1, generation 7) beside LOFI2, Quantize Live Rec and one private module, and the unit listed it as Apply Scene (module 103be957).

### Current source (ae2a6eed): untested on hardware

Adds NOTHING TO APPLY to da2d18e4; nothing else in the behaviour changed. USB package `apply-scene-ae2a6eed.mwrm`, 758 bytes, SHA-256 `c63e2868e39669a3b22f0077923f9d542a521f73a75f5844fe62646d1382d163` (`build.py --octabam apply-scene --name "APPLY SCENE" --stock`): ABI 7, one hashed site, 636 bytes of code, no relocations, copies or hooks. Its longest run shared with the stock OS has 11 counted bytes (limit 12); no 16-byte run (check_stock_free). On the beta base rebuilt from main 86e0dfb8 (byte-identical to the committed base, e35da4ae…), the adapted ot_emu's `sites` scenario installed it and its removal restored every site byte. To check on the unit: SCENE A + YES twice shows NOTHING TO APPLY the second time, and so does SCENE + YES on a scene with no locks.

On the unit, 15 Oct 2026 (user's MKII, OS 1.40C), installed with `npm run device -- try apply-scene-ae2a6eed.mwrm --accept` on a RAM-booted base e8601162…; the unit listed APPLY SCENE (module 103be957), generation 5. User-reported:

- NOTHING TO APPLY (the same apply twice, a scene with no locks, the blend with both scenes muted): pass.
- SCENE A + YES, SCENE B + YES and the blend still apply: pass.
- Power cycle: afterwards APPLY SCENE was not installed and SCENE + YES did stock's ARM ALL. The power cycle had returned the unit to its flashed base (acf91e0a…), and a kept set belongs to the base it was kept on, so this is not a persistence result for the module.
- Power cycle on the flashed base: reinstalled with `try --accept` on acf91e0a… (generation 1, APPLY SCENE listed). Then apply, Part SAVE, PROJECT SAVE, power off and on. User-reported: APPLY SCENE was still installed and SCENE + YES worked as expected; the applied values were still in the Part, and the scenes were as before the shutdown: pass.

### da2d18e4: card image checklist

The user asked for SCENE A + YES and SCENE B + YES to apply that scene's own locks (muted or not), and for both scene keys + YES to keep the blend. The MKII test image is APPLYSC02: APPLY SCENE alone, static stock, all stock effects. It is the image verify.py passed on: MAIN OS SHA-256 `9aa80b87e3244629dbad4c23230996a6e4f07009e66cd01b571c55843878318f`, card file `OCTATRACK_APPLYSC02.bin` SHA-256 `3aa63d9faedb15a4d38adc13de4f80e97e3aa733d486f98653b86a38f6f7d932`. Checklist:

1. Flash APPLYSC02 from the card. It should boot normally and show the image name.
2. Set up a test track. On one track playing a loop, hold SCENE A and turn FX1 knob A fully left, then hold SCENE B and turn it fully right. On the same track, lock AMP VOL in SCENE A only.
3. One scene. Put the crossfader in the middle, hold SCENE A and press YES.
   - SCENE A APPLIED fits the toast.
   - FX1 knob A now shows scene A's value (fully left); AMP VOL shows scene A's lock.
   - The sequencer keeps time and there is no dropout or click beyond the parameter change itself.
4. Repeat with SCENE B + YES: SCENE B APPLIED, FX1 knob A fully right; AMP VOL unchanged (scene B does not lock it).
5. The blend. Crossfader in the middle, hold SCENE A and SCENE B, press YES: SCENE BLEND APPLIED, FX1 knob A about the middle. Try both press orders.
6. Move the crossfader to each end: you still hear scene A's and scene B's FX1 value.
7. YES alone still shows ARM ALL.
8. Press FUNC + CUE (RELOAD PART). Everything returns to the last saved Part.
9. Save and reload.
   - Apply, then FUNC + PART > SAVE, then PROJECT > SAVE. Power off and on: the applied values are there.
   - Apply again without saving, then power off and on: the applied values are still there (unsaved), and RELOAD PART returns to the saved Part.
10. Scene mutes. Check first that FUNC + SCENE A mutes scene A on its own: the crossfader no longer morphs toward A. Then:
    - SCENE A + YES still applies A's locks (deliberate).
    - The blend with A muted uses the Part value on A's side: with the crossfader in the middle the knob lands halfway between its old value and scene B's.
11. Stress test. Lock many parameters on all eight tracks in both scenes, then apply about ten times in each mode while playing at a fast tempo. Listen for dropouts, a stalled sequencer or a frozen screen.
12. Report:
    - the image SHA-256;
    - the MKII OS screen;
    - what you ran and what you heard;
    - anything that was slow or glitched.

## OT UI capture evidence

0.2.0 (23 Oct 2026): the same tool, emulator (`23ba6f6c…`) and card (`70f85539…`) on 0.2.0's image `c625bbd1…` (commit 2ebc3f72). The plan in `media/capture.json` repeats 0.1.0's and adds grid recording, TRIG 1 + SCENE A (SCENE A TO TRIGS, then the trig held: BASE p-lock 30) and TRIG 5 + SCENE A + B at fader 64 (SCENE BLEND TO TRIGS, then BASE p-lock 70). The seven 0.1.0 screens came out pixel-identical; every new image was opened and checked. The manifest takes eight images, so scene B's lock, the Part after the blend and step 5's blended p-lock are captured in that record but not shipped.

0.1.0: `scripts/capture-module-ui.py` on the native build of a90849c9 (MAIN OS `3a74ff36…`; ae2a6eed's image gave pixel-identical PNGs), card staged from octabam's TMPL project; the plan and every PNG's SHA-256 are in `media/capture.json`. The plan locks FX1 BASE to 30 in scene A and 110 in scene B, applies scene A twice (SCENE A APPLIED, then NOTHING TO APPLY), sets the crossfader to 64 (`fader`, added to the capture tool for this) and applies the blend (SCENE BLEND APPLIED). Every image was opened and checked.

## Owner exception, 23 October 2026

The owner approved PR #830 for this exact 0.2.0 source with no static cycle bound and with the explicitly labelled 0.1.0 emulator load/stress measurements retained. `sdk/apply-scene-build-approval.json` binds the approval to the native-source hash. The MKII results above remain reported results; timing, MKI, MIDI mode, later trig pages, pattern/Part changes during the chord, card-build hardware and the site review/Keep/Undo flow remain unverified. Approval does not turn these gaps into test results.
