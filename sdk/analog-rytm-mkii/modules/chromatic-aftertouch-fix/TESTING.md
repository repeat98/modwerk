# Chromatic Aftertouch Fix: testing

## The bug, read in the code (OS 1.74)

Read from a disassembly of the stock 1.74 main OS (sha256 `34cd0c4d…1f3b`, from
`Analog-Rytm_MKII_OS1.74.syx` `cb0f99d6…e123`), kept outside the repository.

- ChromPadsView keeps a note per pad at view + 404 + 4 × pad (the pad is event + 20). Its key
  handler (`0x400c62ae`) plays that note through `0x400c585a`, which sends the MIDI note on with
  `pea %a3@(-24)` (`0x400c5924`) to `0x40085856` (channel, note, velocity). The note off subtracts
  24 too (`0x400c59ca`, to `0x400858c2`).
- Its pressure handler (`0x400c6196`) loads the same kept note into d6 (`0x400c61f8`) and passes it,
  unchanged, to the poly pressure sender `0x400850f4` (slot, channel, note, value) at `0x400c628e`.
  That sender queues one message per pad; `0x40085a8c` sends `An note value` with no range check.
- The channel is the same on both paths: `0x40085672` and the note on both pick the per-track or the
  AUTO channel by `0x400b5a74`.
- The pressure the sound receives (`0x4011f490`, one word per track at `0x800067de`) takes no note,
  so the Rytm's own aftertouch modulation is right.
- KeyboardView (pads outside CHROMATIC) sends note on and pressure through one helper,
  `0x400c6eea`, so they always agree.

## rytm-emu (OS 1.74)

rytm-emu 2ac0f1f (`~/.cache/modwerk-upstream/rytm-emu`, the pin of `npm run upstream:tools`),
headless `dtboot`. Each image cold-boots 8000M, four held NO presses clear the boot notices, CHRO
is pressed at 10303M. Then BD is held for 700M with raw panel pressure `90 20`, `90 30`, `90 28`,
and SD for 500M with `91 40`, `91 50`; every event off the 1000M report grid. MIDI out is read
with `--midi-out` (AUTO channel 14, `d`).

| Image | sha256 | CHROMATIC, BD then SD | Pads outside CHROMATIC, BD |
| --- | --- | --- | --- |
| Stock 1.74 | `cb0f99d6…e123` | `9d 24 7f ad 3c 10 ad 3c 18 ad 3c 14 8d 24 00 9d 25 7f ad 3d 20 ad 3d 28 8d 25 00` | `9d 00 7f ad 00 10 ad 00 18 ad 00 14 8d 00 00` |
| core-ar2 0.7 alone (CX01) | `e0215ff0…2326` | as stock | as stock |
| **CA01**: core-ar2 0.7 + this module | `8d83b97a…1def` | `9d 24 7f ad 24 10 ad 24 18 ad 24 14 8d 24 00 9d 25 7f ad 25 20 ad 25 28 8d 25 00` | as stock |
| CA01 + Silent Pad+Trig 0.6.0, rows unchecked | `33a48b66…e803` | as CA01 | as stock |

Octave range, BD, raw pressure `90 20`, `90 30`:

| Octave | Stock 1.74 | CA01 |
| --- | --- | --- |
| DOWN pressed five times (the bottom) | `9d 0c 7f ad 24 10 ad 24 18 8d 0c 00` | `9d 0c 7f ad 0c 10 ad 0c 18 8d 0c 00` |
| UP pressed ten times (the top) | `9d 30 7f ad 48 10 ad 48 18 8d 30 00` | `9d 30 7f ad 30 10 ad 30 18 8d 30 00` |

No fault on any run. The range test (a note outside 0 to 127 sends nothing) was never reached:
the lowest CHROMATIC note seen was 12. With Silent Pad+Trig's MUTE ALL SOUND checked and the track
muted, its gate at `0x400c626e` jumps past the whole MIDI block (`0x400c6298`), this module's call
included, so a muted pad still sends no pressure: read in the code, not run.

Build: `node scripts/link-image.mjs --stock Analog-Rytm_MKII_OS1.74.syx --version CA01 --out CA01.syx
--elemod vendor/elekloader/catalog/core-ar2-0.7.elemod --module analog-rytm-mkii:chromatic-aftertouch-fix`.

## On a unit

Not tested. The steps to run, with a MIDI monitor on MIDI OUT or USB, PAD DEST and PRESSURE DST at
INT+EXT (GLOBAL > MIDI CONFIG > PORT CONFIG); `n` is the channel the pads send on:

| Step | Expect |
| --- | --- |
| CHRO, hold BD, press harder | `9n 24 vv`, then `An 24 pp` while held, `8n 24 00` (stock: `An 3c pp`) |
| CHRO, hold SD | `9n 25 vv`, `An 25 pp`, `8n 25 00` |
| CHRO, DOWN to the bottom octave, hold BD | note on, pressure and note off on one note (rytm-emu: `0c`) |
| CHRO, UP to the top octave, hold BD | the same (rytm-emu: `30`) |
| CHRO, a synth with poly aftertouch on the pads' channel | holding harder modulates the held note |
| CHRO, a sound with an AFTERTOUCH destination, MIDI out off | the Rytm's sound modulates, as stock |
| Leave CHRO, hold BD | note on and pressure on one note, as stock |
| Per-track MIDI channels instead of AUTO | the same notes, on the track's channel |
