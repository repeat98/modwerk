# BBD Delay author hardware report

Tester: JamCones (Cam Jones), the author. Octatrack MKII, OS 1.40C. These are
the author's reported results; nobody else observed the unit.

## Release image: BBDMW2 (14 October 2026)

MAIN OS SHA-256 `bc53d1b3e96a4c22d5efb426c880d08e26d4f0288dccbe8ffaf43e25a18fb3ba`:
the native build of this source with BBD beside the stock effects, which the
site's browser builder reproduces byte for byte (`sdk/native-comparisons/bbd.json`,
the BBD-only selection with stock FX2 kept). Flashed as
`OCTATRACK_BBDMW2.bin` (`55178ef1866dbc73924a5aee9f0c8f0d1361fd25c74a881e9ea4e6eb55af65dd`).

Reported, about ten minutes of play:

- DARK REV still works on FX2.
- Two BBD instances at once, on T1 and T5 (one per DSP core), both working.
- HPF (0 to 127) and STGS (1024, 4096) tested and working.
- A Part reload restores the saved settings after unsaved edits.
- A project save and reload restores them.
- After a power cycle, the saved project comes back with its BBD instances
  and settings.
- Every parameter on the main page and the SETUP page played; LFOs on every
  parameter that takes one (the OS offers LFO targets on the main page) and
  trigless locks on parameters.

BBD is not offered over the USB loader in this release (TESTING.md).

## Earlier private images (BBD01–BBD14)

- **BBD01–BBD02:** on T5, BBD worked, sounded like a BBD and followed scenes.
  On T1 it crackled, and STGS changes made artefacts and then silenced tracks
  1–4 (core B). BBD on T2, T3 and T4 at once did not crackle. Diagnosis in
  `REP_DIVIDES.md`: `rep` divides holding interrupts off.
- **BBD03:** every `rep` replaced by a `do` loop. No crackle on T1 with or
  without a kick, none with PHASER or FILTER on FX1, STGS changes clean on T1
  and T5 with tracks 1–4 playing, and a heavier existing project fine.
- **BBD04–BBD09:** FRZ, FREQ, the ±9 dB TONE, LIM and the MIX curve played as
  intended; LIM's orientation, range and default were set by ear. No problem
  clipping at MIX 64.
- **BBD10:** PRE and POST sound as intended, with no switch-on thump and no
  crackle.
- **BBD11:** sounds fine; no change from BBD10 (bit-identical in software).
- **BBD13** (includes BBD12, not played separately): "no issues and freeze
  works great". It removes the 8192-stage STGS option, keeps a ringing loop's
  level through a crossfade into FRZ 127, and draws PRE and POST as stock
  DELAY's switches.
- **BBD14**, the previous candidate (fixed 150 Hz PRE/POST switches, STGS default 4096, LIM on SETUP B): BBD behaves as on BBD13, with no crackle on
  T1; DARK REV works on FX2; the FX2 chooser has no SPRING REV or PLATE REV and
  keeps DELAY, DARK REV and BBD Delay; two BBD instances ran at once; a
  Part or project save and reload worked; eight BBD instances, FX2 on all eight tracks (four per DSP core), ran for 30 minutes with every track's feedback and modulation running, without a problem; a saved
  project came back after a power cycle with BBD on its tracks and its
  settings intact; an LFO swept FREQ across its whole range; and FRZ and every
  other control were played through the crossfader (scenes).
- **BBD14E**, the site's build of BBD with E-Verb beside the stock effects
  (MAIN OS `faf935628af849eca30cb3e3f73c061c1d28d557213eee67bfea36518ec898a2`,
  equal to its native record): "all good", both effects working. An extra
  combination check, not part of BBD's own qualification.

Images BBD01–BBD13 placed BBD in SPRING REV's space alone and kept DARK REV,
which calls a routine inside that space, so DARK REV was broken in them (not
noticed on the unit; found by the site's builder and confirmed by a render
gate). None of them was published. BBD14 gives up PLATE REV too and places
BBD clear of the routine.

## Limitations

- Attributed author-reported functional results, not a detailed stress
  qualification: about ten minutes on one MKII, no hardware canaries or
  wall-clock measurements. The eight-instance 30-minute run was on BBD14, not
  on this image.
- MIDI/USB load, recovery and MKI are not reported. BBD is not offered over
  USB in this release.
- Cycle values are software bounds and emulator measurements; chip contention
  and wall-clock timing are not measured.
