# Pad Select — test report

- Module: `pad-select` 0.2.0-experimental, for Analog Rytm MKII OS 1.74 on core-ar2 0.3.
- Source: rytm2_mods (`Iced-Cream/rytm2_mods`), `pad-select` 0.2, local commit
  `35ea2f0` on branch `claude/pad-select`, **not yet pushed**, so `source.revision` is left out of
  the manifest until a public commit exists. `src/pad-select.s` (`93d95e91…3863`) is its
  `pad-select/os1.74/pad-select.s` and `include/ar2-1.74.inc` (`c57431f7…874b`) its
  `include/ar2-1.74.inc`, byte for byte. Source fingerprint (`sha256` of
  `sha256sum include/ar2-1.74.inc src/pad-select.s`): `10bc355d…aecd`.
- Stock OS 1.74: `.syx` `cb0f99d6…e123`, main OS `34cd0c4d…1f3b`, the owner's file.
- Core: elekloader core-ar2 0.3 (`core-ar2-v0.3`, `core-ar2-0.3.elemod` `6b97dfb3…3e58`, as vendored).
- Build PS74 (core-ar2 0.3 + this module, Modwerk's linker, `--version PS74`): `.syx`
  `4b2e6567acce58756bf6aa0119faf77410dbfe00ff2e9f21c6c11db58fbdad21`, main OS `7ea05528…033f`.
  Tested in rytm-emu 2026-10-25. Not run on a unit.

## Sites

Five sites, read from stock OS 1.74; each one's stock bytes match rytm2_mods' `mod.json`, and
each is recorded here as an address, a length and the SHA-256 of those bytes.

| Address | Length | Op | Target | What |
| --- | --- | --- | --- | --- |
| `0x400c772e` | 6 | jmp | `pad_select_play_gate` | the play routine both key handlers call |
| `0x400c7a3e` | 6 | jsr | `pad_select_autotrk` | the pad handler's AUTO TRK SWITCH call |
| `0x400c7e90` | 6 | jsr | `pad_select_autotrk` | the TRIG key handler's AUTO TRK SWITCH call |
| `0x400c7950` | 6 | jmp | `pad_select_func_gate` | the pad handler's FUNC test |
| `0x400ec184` | 8 | jmp | `pad_select_menu_add` | the SEQUENCER CONFIG menu's constructor (jmp + nop) |

rytm2_mods declares the two AUTO TRK SWITCH sites as `keep2`. The stock instruction there is an
absolute `jsr`, so `keep2` and `jsr` write the same six bytes; this folder uses `jsr`, which
Modwerk's source-only export accepts (it refuses `keep2`).

## Source build and link (2026-10-24)

```sh
node scripts/machine-modules.mjs --drafts
MODWERK_CROSS=m68k-elf- node scripts/build-elemod-packages.mjs --output OUT \
  --source-commit <commit> --drafts --module analog-rytm-mkii:pad-select
node scripts/package-elemod-recipe.mjs OUT/analog-rytm-mkii/pad-select/1.74.json pad.elemod
```

Compiler: Homebrew `m68k-elf` binutils/GCC on macOS, Node 24.21.0. Modwerk's pinned Docker
toolchain was not run here.

The compiled recipe has a 764-byte `.run`, 5 sites, 5 relocations, no `.bss` and one storage
field, the same sizes elekloader's build of rytm2_mods 0.2 reports. Materialised against the
owner's stock OS 1.74 and linked with Modwerk's linker (`linkMods`, no lockfile):

| Selection | Result | Main OS sha256 |
| --- | --- | --- |
| core-ar2 0.3 + Pad Select | links; `pad_select_on` global bit 0 | `7ea05528…033f` |
| core-ar2 0.3 + Filter Hz 1.2.0 + Loop Sync 0.2.0-experimental + Pad Select | links, no overlaps; `pad_select_on` global bit 0, beside Loop Sync's sound and project fields | `970dad34…06e5` |

The source-only export (`pad.elemod`, not committed) linked with the core gives the same main
OS as the local materialisation, `7ea05528…033f`. The builds stayed on the owner's computer.

Not compared byte for byte with an elekloader build on core-ar2 0.3: the elekloader build kept
in rytm2_mods is on core-ar2 0.4, and no elekloader checkout was available here.

## Emulator (2026-10-25)

[rytm-emu](https://github.com/trigcondition/rytm-emu) `c5732f0`, headless `dtboot`
(`cargo build --release --bin dtboot`, Homebrew Rust 1.99.1, JIT on), on PS74 and on stock 1.74.
Each run cold-boots, or resumes a snapshot of a cold boot, and clears the calibration notices with
four held NO presses. Behaviour is read from three counters (`--count`, visits to a PC) and from
MIDI out (`--midi-out`):

- `0x400c772e`: the play routine both key handlers call (Pad Select's play gate sits here);
- `0x400c6f18`: the routine past the gate that triggers the voice and sends the MIDI note;
- `0x40083f40`: the shared voice trigger (also reached by CHRO pads, MIDI in and TRIG + YES).

A silent press is one that reaches the play routine but neither of the other two, and sends no
MIDI. The analog voices are modelled only approximately, so none of this is a listening test.

| Flow | PS74, PAD+TRIG SEL TRK checked | Stock 1.74 |
| --- | --- | --- |
| Menu | GLOBAL > CONTROL > SEQUENCER CONFIG shows PAD+TRIG SEL TRK after AUTO TRK SWITCH, unchecked; YES checks, LEFT unchecks, RIGHT checks | no row |
| Stopped: pad SD | silent, no MIDI; SD track selected | plays, note velocity 127 |
| Stopped: FUNC + SD | plays, note velocity 127 (the pad's) | plays, velocity 100 (the TRIG page's VEL) |
| Stopped: TRIG 5 | silent, no MIDI; track 5 (BT) selected | plays, velocity 100 |
| Stopped: FUNC + TRIG 5 | nothing: the play routine is not reached | nothing: the same |
| Playing: SD, TRIG 5 | silent, no MIDI | play |
| Playing: FUNC + SD | plays | plays |
| GRID REC: TRIG 3 | places a trig, play routine not reached | the same |
| GRID REC: SD / FUNC + SD | silent / plays | plays / plays |
| LIVE REC (record and play marks shown): SD, TRIG 5 | play | play |
| STEP REC (step-record mark shown): SD | plays | plays |
| CHROMATIC: SD | plays through CHRO's own path, MIDI note 0x25 | the same |
| RTRG + SD | silent | plays |
| FUNC + RTRG + SD | plays, velocity 127 | plays, velocity 100 |
| MUTE mode: SD twice | mute CC out, play routine not reached | the same |
| MIDI note in (`9d0164`) | voice trigger runs | the same |
| GRID REC: TRIG 3 + YES | voice trigger runs (trig preview) | the same |

With the setting **unchecked** (PS74 as booted), a run of 23 key presses across playing, GRID,
LIVE and STEP REC gave the same counts as stock, a byte-identical MIDI out log and 24
pixel-identical screens (one per key and the end).

**Persistence.** On a fresh card image: check the box, then `--power-off` (the firmware's own
power-fail save wrote state slot 0x7a000). A cold boot of PS74 on that card shows the box checked,
and SD is silent. A cold boot of **stock** 1.74 on the same card boots normally, shows the stock
SEQUENCER CONFIG without the row, and SD plays.

**GLOBAL slots.** With the box checked in slot 1: GLOBAL SLOT RIGHT + YES makes slot 2 active.
Its SEQUENCER CONFIG shows the box unchecked (and slot 2's own stock settings), and SD plays.
LEFT + YES back to slot 1: the box is checked again, and SD is silent.

### Every mode that takes the pads, TRIG keys or FUNC (2026-10-25)

Three snapshots made with the same key sequence (GLOBAL > CONTROL > SEQUENCER CONFIG, three
DOWNs, four NOs) from a cold boot: **A** PS74 with YES on the row (checked), **B** PS74 without it
(unchecked), **S** stock 1.74. Each group below ran from all three at the same clock, with the
three counters and MIDI out; B against S was identical in counts, MIDI out and every screen in
every group (except the SEQUENCER CONFIG screens themselves, which have the extra row). "Silent"
in A means the play routine ran but no trigger, no voice and no MIDI.

| Group | A (checked) | S (stock) | A vs S screens |
| --- | --- | --- | --- |
| PERF mode: SD, FUNC + SD, TRIG 3 | pads drive PERF, no play routine; TRIG 3 silent | pads drive PERF; TRIG 3 plays | identical |
| SCENE mode: the same | pads pick scenes; TRIG 3 silent | pads pick scenes; TRIG 3 plays | identical |
| MUTE mode: FUNC + SD twice (preselect) | mute CCs out, no play routine | the same | identical |
| TRK + SD, TRK + TRIG 5 | select, no play routine | the same | identical |
| QPER + SD, QPER + TRIG 3 | no play routine | the same | identical |
| FIX on: SD, FUNC + SD | SD silent; FUNC + SD plays at the fixed velocity 100 | both play at 100 | identical |
| FX track selected: TRIG 3, then SD | silent | play | identical |
| BANK A + TRIG 2, BANK A + TRIG 1 (pattern select) | no play routine | the same | identical |
| TRIG 13, FUNC + TRIG 13, TRIG 16 | TRIG 13 silent; the others reach nothing | TRIG 13 plays the FX track (MIDI note 12); the others reach nothing | identical |
| GLOBAL menu open: SD, FUNC + SD, TRIG 5 | SD and TRIG 5 silent; FUNC + SD plays, velocity 127 | all three play (FUNC + SD at 100) | identical |
| LIVE REC, then PLAY, SD, TRIG 5, PLAY, SD | pads silent after the first PLAY | pads play | identical |
| LIVE REC: SD, then NO + SD (erase) | SD plays; NO + SD reaches no play routine | the same | identical |
| STEP REC: TRIG 3, TRIG 4, SD | TRIG keys pick steps (no play routine); SD plays | the same | identical |
| FUNC + RTRG + SD held 4 s | one trigger, velocity 127 | one trigger, velocity 100 | identical |
| RTRG + SD held 4 s | silent | one trigger | identical |
| SOUND BROWSER (FUNC + LEVEL push): DOWN, DOWN, SD, FUNC + SD, TRIG 3 | SD silent; FUNC + SD auditions, velocity 127; TRIG 3 picks bank C | SD and FUNC + SD audition; TRIG 3 picks bank C | identical |
| AUTO TRK SWITCH unchecked, then SD, TRIG 5 | silent, and each selects its track (SD, then BT) | play, the track stays BD | differ: the selection, as designed |
| Soft strikes (raw panel `A1 20`, `A1 60`): plain soft, FUNC + soft, FUNC + hard | plain silent; FUNC + soft MIDI velocity 15, FUNC + hard 127 | plain soft 15; FUNC + either 100 | identical |
| CHAIN mode: SD, TRIG 3 | silent | play | identical |
| SONG mode: SD, TRIG 3 | silent | play | identical |
| FILL held: SD, TRIG 3 | silent | play | identical |

On stock, PLAY during LIVE REC ends live recording and the sequencer keeps playing: sampled
across its blink, the record mark shows before that PLAY and never after it. So the pads going
silent there is the module working as designed, not a paused live recording. A paused LIVE REC
was not reached with the panel keys.

**Audio.** A CY trig on steps 1 and 9 (grid-recorded, TRK + CY to select it in every build),
PLAY for 9 s, `--analog-wav` drained every 50M with `DTEMU_ANALOG_SEED=1`. In A, holding the CY
pad for 0.75 s and releasing it while the cymbal rings gives an analog recording byte-identical to
the same run without the press: the silent press neither retriggers nor cuts the voice. In S
the press changes the recording (it retriggers).

**Known issue, aftertouch.** The same held CY pad with a stream of pressure values (raw panel
`9A xx`): in A no note-on is sent, but the polyphonic aftertouch messages are (`AD 0A xx`), and the
analog recording differs from the run without the press, so the pressure modulates the sound
playing on that track. Stock sends the same aftertouch after its note-on. The module gates only
the press, not the pressure that follows it.

Not compared in the emulator: loading a saved project (rather than the power-off state), Global
SysEx receive, a paused LIVE REC, and the RTRG roll's repeats (one trigger is counted in every
build).

Captures: the four PNGs in `media/` come from one cold boot whose command line is in
`media/capture.json`; it gives the same frames as the snapshot runs above.

## Hardware

**Not tested.** Pad Select has not run on a unit. To do, on the exact PS74 build (or a later one
that names its hash):

1. GLOBAL > CONTROL > SEQUENCER CONFIG: PAD+TRIG SEL TRK after AUTO TRK SWITCH; YES and
   LEFT/RIGHT toggle it. Save, power-cycle, reload: kept. Another GLOBAL slot keeps its own.
2. Stopped and playing: pads and TRIG 1-12 select silently; FUNC + pad plays, soft and hard,
   at the pad's velocity. Holding a pad on a sounding track does not cut its note on release.
3. GRID REC: TRIG keys place trigs; pads select silently; FUNC + pad plays.
4. LIVE REC and STEP REC: as stock; NO + pad erases in LIVE REC.
5. CHROMATIC mode, MIDI notes in, TRIG + YES, the SOUND BROWSER: as stock. A track with MIDI
   out: a silent press sends nothing, FUNC + pad sends a note.
6. RTRG + pad: silent and selects; FUNC + RTRG + pad rolls.
7. MUTE, SCENE, PERF modes and TRK + pad: unchanged.
8. Unchecked: everything stock, AUTO TRK SWITCH as set.
9. A project saved with it checked, loaded on stock 1.74 and on a build without the module.

## Load and memory

764 bytes in the shared DDR area, no `.bss`, no fast SRAM. The sites are in the pad and TRIG key
handlers and their play routine, and in the SEQUENCER CONFIG menu's constructor. Each press reads
one storage bit through `core_store_get` and the record state; nothing runs in the audio,
sequencer or tick paths. Static reading, not a measurement.

## Not tested

On a unit: everything. In the emulator: sound and timing, the flows listed above as not
compared, other modules beside it at run time, and loading a saved project.
