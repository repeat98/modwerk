# Scenes

Read [the module guides index](README.md) first.

**Applies to** modules with manifest `category: scenes`: anything that recalls, locks or morphs state per scene or with the crossfader. [MIDI Scenes](../../sdk/octabam/modules/midi-scenes/README.md) adds scene locks to MIDI tracks.

**Use the existing scene system.** MIDI Scenes works "through the existing MIDI parameter pages rather than a new effect chooser row" and through the stock scene operations: hold SCENE A or B and press a TRIG key to assign it, hold the scene key while turning the encoder, sweep the crossfader, and use the stock scene clear, copy and paste, Part Save and Reload, and project save and load. Do not build a second scene engine or a new screen where the stock page can carry the control.

## Behave like the instrument

- [ ] **Assigning and editing a scene** uses the stock gesture; releasing the scene key shows the base value again.
- [ ] **An unlocked side behaves as stock:** it uses the active trig lock, or the track value when none applies. Active trig locks are preserved.
- [ ] **Inactive is not a number.** A disabled control shows OFF and is not a scene value.
- [ ] **Stock clear, copy and paste, Part Save and Reload, project save and load** all work on your scene data. Any stock behaviour you change is named and tested.
- [ ] **Pattern and Part boundaries.** State what happens at a pattern change, a Part change, PLAY and a sequencer ACT commit, and test it. MIDI Scenes documents its "pattern/Part boundary timing" and an "immediate Part sync at sequencer ACT commit".
- [ ] **MIDI ordering.** MIDI Scenes documents "CC-before-note ordering". State yours.
- [ ] **Parameter locks and LFOs.** The stock scene and LFO processing runs on the same values. Test a locked step, a modulated parameter and a crossfader sweep together, and record it. **Verify** with `ot_spec.py` (locks by knob name) and `stress_project.py`.
- [ ] **Say what is unqualified.** The README lists the controls and persistence paths nobody tested; "unknown behavior is not represented as verified".

## Integrate

- [ ] If your module cannot combine with others, declare it. MIDI Scenes builds on its own, and `selection-conflicts.ts` refuses every companion (`midi-scenes-standalone`); see [standalone.md](standalone.md).
- [ ] `sdk/catalog.json` entry, thumbnail, `resources.impact`, README sections, tutorial and screenshots of the real pages.
- [ ] `npm run module:doctor -- <id>` is green.

## Test

`verify_midiscenes.py`, `verify_scenesp2.py` and the emulator scenario in `scripts/midi-scenes-emulator/` are the patterns: a fresh project, project load, eight active tracks, panel scenarios and instrumentation parity.

## Digitakt and Digitone

No scene contract is documented for these machines yet. Start from the [Digitakt guide](../../sdk/machines/digitakt/README.md), use the core's events, and record how you tested recall and morphing.
