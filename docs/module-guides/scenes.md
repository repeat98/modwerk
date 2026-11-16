# Scenes

Read [the module guides index](README.md) first.

**Applies to** modules with manifest `category: scenes`: anything that recalls, locks or morphs state per scene or with the crossfader. [Apply Scene](../../sdk/octatrack/modules/apply-scene/README.md) writes a scene's locked values, or the crossfader's blend, into the Part or onto held trigs.

**Use the existing scene system.** Work through the existing parameter pages rather than a new effect chooser row, and through the stock scene operations: hold SCENE A or B and press a TRIG key to assign it, hold the scene key while turning the encoder, sweep the crossfader, and use the stock scene clear, copy and paste, Part Save and Reload, and project save and load. Do not build a second scene engine or a new screen where the stock page can carry the control.

## Behave like the instrument

- [ ] **Assigning and editing a scene** uses the stock gesture; releasing the scene key shows the base value again.
- [ ] **An unlocked side behaves as stock:** it uses the active trig lock, or the track value when none applies. Active trig locks are preserved.
- [ ] **Inactive is not a number.** A disabled control shows OFF and is not a scene value.
- [ ] **Stock clear, copy and paste, Part Save and Reload, project save and load** all work on your scene data. Any stock behaviour you change is named and tested.
- [ ] **Pattern and Part boundaries.** State what happens at a pattern change, a Part change, PLAY and a sequencer ACT commit, and test it.
- [ ] **MIDI ordering.** A module that sends MIDI states whether a CC goes out before the note it shapes.
- [ ] **Parameter locks and LFOs.** The stock scene and LFO processing runs on the same values. Test a locked step, a modulated parameter and a crossfader sweep together, and record it. **Verify** with `ot_spec.py` (locks by knob name) and `stress_project.py`.
- [ ] **Say what is unqualified.** The README lists the controls and persistence paths nobody tested; "unknown behavior is not represented as verified".

## Integrate

- [ ] If your module cannot combine with another, declare it in `compatibility.conflicts`; one that combines with nothing is [standalone](standalone.md).
- [ ] `sdk/catalog.json` entry, thumbnail, `resources.impact`, README sections, tutorial and screenshots of the real pages.
- [ ] `npm run module:doctor -- <id>` is green.

## Test

octabam's `verify_midiscenes.py` and `verify_scenesp2.py` and Apply Scene's `sdk/octatrack/modules/apply-scene/verify.py` are the patterns: a fresh project, project load, eight active tracks, panel scenarios and instrumentation parity.

**Drive the panel while the scene key is held.** On the Octatrack, pressing a scene key writes stock's scene-lock knob handler into every encoder slot, over whatever the open page installed ([the trap](../../sdk/octabam/docs/TRAPS.md#trap-scene-encoders)). A hook in a page's own editor never sees a turn made with a scene held, and a test that calls the editor directly still passes. Hook the scene-lock handler itself, and test the gesture with a scripted panel run (`--live-script`): hold the scene key, turn the encoder, check the lock.

## Digitakt and Digitone

No scene contract is documented for these machines yet. Start from the [Digitakt guide](../../sdk/machines/digitakt/README.md), use the core's hooks, and record how you tested recall and morphing.
