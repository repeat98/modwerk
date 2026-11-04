# Chromatic Aftertouch Fix: testing

## The bug, read in the code (OS 1.74)

Read from a disassembly of the stock 1.74 main OS (sha256 `34cd0c4d…1f3b`, from
`Analog-Rytm_MKII_OS1.74.syx` `cb0f99d6…e123`), kept outside the repository.

- ChromPadsView keeps two notes per pad (the pad is event + 20, 0 to 11). The layout note at
  view + 404 + 4 × pad is rewritten by the layout routine when UP or DOWN shift the pads, and is -1
  for a pad past the top (`0x400c5c4e`, `0x400c5cce`). The held note at view + 308 + 4 × pad is
  the layout note a press played (`0x400c63be`), and -1 once released (`0x400c5a16`).
- The key handler (`0x400c62ae`) plays the layout note through `0x400c585a`, which sends the MIDI
  note on with `pea %a3@(-24)` (`0x400c5924`) to `0x40085856` (channel, note, velocity). The
  release sends the note off for the held note, also less 24 (`0x400c59f0` → `0x400c5944`,
  `0x400c59ca`, to `0x400858c2`).
- The pressure handler (`0x400c6196`, view in a2 throughout) loads the layout note into d6
  (`0x400c61f8`) and passes it, unchanged, to the poly pressure sender `0x400850f4` (slot = pad,
  channel, note, value) at `0x400c628e`. That sender queues one message per slot, 0 to 11;
  `0x40085a8c` sends `An note value` with no range check, so a -1 layout note would go out as
  `ff`.
- The channel is the same on both paths: `0x40085672` and the note on both pick the per-track or the
  AUTO channel by `0x400b5a74`.
- The pressure the sound receives (`0x4011f490`, one word per track at `0x800067de`) takes no note,
  so the Rytm's own aftertouch modulation is right.
- KeyboardView (pads outside CHROMATIC) sends note on and pressure through one helper,
  `0x400c6eea`, so they always agree.

The module's call reads the held note through a2 and the slot, takes 24 off, and sends nothing
when no note is held or the result is outside 0 to 127.

## rytm-emu (OS 1.74)

rytm-emu 2ac0f1f (`~/.cache/modwerk-upstream/rytm-emu`, the pin of `npm run upstream:tools`),
headless `dtboot`. Each image cold-boots 8000M, four held NO presses clear the boot notices, CHRO
is pressed at 10303M. Raw panel pressure is `9p vv` for pad p (BD 0, SD 1). Every event sits off
the 1000M report grid. MIDI out is read with `--midi-out` (AUTO channel 14, `d`). No run faulted.

Images, all on stock 1.74:

| Name | Contents | sha256 |
| --- | --- | --- |
| CX01 | core-ar2 0.7 alone | `e0215ff0…2326` |
| CA01 | core-ar2 0.7 + 0.1.0 as first written (layout note less 24) | `8d83b97a…1def` |
| **CA02** | core-ar2 0.7 + this folder | `820cfaec…2c9a` |
| CA02-sp | CA02 + Silent Pad+Trig 0.6.0, rows unchecked | `3339e7b3…776f` |

| Case | Stock 1.74 | CA02 |
| --- | --- | --- |
| BD held 700M, pressure 20 30 28; SD held 500M, 40 50 | `9d 24 7f ad 3c 10 ad 3c 18 ad 3c 14 8d 24 00 9d 25 7f ad 3d 20 ad 3d 28 8d 25 00` | `9d 24 7f ad 24 10 ad 24 18 ad 24 14 8d 24 00 9d 25 7f ad 25 20 ad 25 28 8d 25 00` |
| BD held, pressure, UP once, pressure | `9d 24 7f ad 3c 10 ad 44 18 ad 44 14 8d 24 00` | `9d 24 7f ad 24 10 ad 24 18 ad 24 14 8d 24 00` |
| BD held, pressure, UP ten times, pressure | `9d 24 7f ad 3c 10 ad 48 18 ad 48 14 8d 24 00` | `9d 24 7f ad 24 10 ad 24 18 ad 24 14 8d 24 00` |
| BD released, then pressure | `9d 24 7f ad 3c 10 8d 24 00 ad 3c 18` | `9d 24 7f ad 24 10 8d 24 00` |
| BD and SD held together | `9d 24 7f 9d 25 7f ad 3c 10 ad 3d 20 ad 3c 18 8d 24 00 8d 25 00` | `9d 24 7f 9d 25 7f ad 24 10 ad 25 20 ad 24 18 8d 24 00 8d 25 00` |
| Pads outside CHROMATIC, BD | `9d 00 7f ad 00 10 ad 00 18 ad 00 14 8d 00 00` | the same |

With PORT CONFIG > OUTPUT CH at TRK CH (the default is AUTO CH), CA02 sends the same notes on
the selected track's channel: BD then SD held in CHROMATIC, `90 24 7f a0 24 10 a0 24 18 80 24 00
90 25 7f a0 25 20 80 25 00`. CX01 sends stock's bytes in the first case. CA02-sp gives CA02's bytes in every row but the one
with both pads held, which was not run on it. CA01 passed the first row but, with UP during the hold, sent
`ad 2c` while the note off said `24`: the review that found it led to CA02.

Layouts shifted before playing, BD, pressure 20 30:

| Layout | Stock 1.74 | CA02 (CA01 the same) |
| --- | --- | --- |
| DOWN pressed five times | `9d 0c 7f ad 24 10 ad 24 18 8d 0c 00` | `9d 0c 7f ad 0c 10 ad 0c 18 8d 0c 00` |
| UP pressed ten times | `9d 30 7f ad 48 10 ad 48 18 8d 30 00` | `9d 30 7f ad 30 10 ad 30 18 8d 30 00` |

CHRO pressed while BD is held, and again after its release, then SD held: `9d 24 7f ad 24 10 ad
24 18 8d 24 00 9d 25 7f ad 25 20 8d 25 00`. Whether that CHRO press left CHROMATIC mode was not
checked; no stale note went out.

Not reached in rytm-emu: a layout entry of -1 during a hold (BD stopped at 0x48), and a note
outside 0 to 127. With Silent Pad+Trig's MUTE ALL SOUND checked and the track muted, its gate at
`0x400c626e` jumps past the whole MIDI block (`0x400c6298`), this module's call included, so a
muted pad still sends no pressure: read in the code, not run.

Build: `node scripts/link-image.mjs --stock Analog-Rytm_MKII_OS1.74.syx --version CA02 --out CA02.syx
--elemod vendor/elekloader/catalog/core-ar2-0.7.elemod --module analog-rytm-mkii:chromatic-aftertouch-fix`.

## On a unit

CA02 (`820cfaec…2c9a`) on the author's Analog Rytm MKII, OS 1.74, 2 November 2026, watching a MIDI
monitor, as reported by npp1993: every step below passed. The per-track channel step was first
run by turning the AUTO channel off and recording a sequence with SEND MIDI, which exercises the
sequencer's MIDI out, not the pads'; rerun with OUTPUT CH at TRK CH as the table says, it passed.
The module ran alone on core-ar2 0.7; beside Silent Pad+Trig it ran only in rytm-emu.

The steps, with a MIDI monitor on MIDI OUT or USB, PAD DEST and PRESSURE DST at
INT+EXT (GLOBAL > MIDI CONFIG > PORT CONFIG, the default); `n` is the channel the pads send on:

| Step | Expect |
| --- | --- |
| CHRO, hold BD, press harder | `9n 24 vv`, then `An 24 pp` while held, `8n 24 00` (stock: `An 3c pp`) |
| CHRO, hold SD | `9n 25 vv`, `An 25 pp`, `8n 25 00` |
| CHRO, hold BD and SD together | each pad's pressure on its own note, `24` and `25` |
| CHRO, hold BD, press UP, keep pressing | pressure stays `An 24 pp` until `8n 24 00` (stock moves it) |
| CHRO, DOWN or UP a few times first, then hold BD | note on, pressure and note off on one note |
| CHRO, a synth with poly aftertouch on the pads' channel | holding harder modulates the held note |
| CHRO, a sound with an AFTERTOUCH destination | the Rytm's sound modulates, as stock |
| Leave CHRO, hold BD | note on and pressure on one note, as stock |
| PORT CONFIG > OUTPUT CH set to TRK CH, then CHRO, hold BD | the same notes, on the selected track's channel from CHANNELS (rytm-emu, track 1: `90 24 7f`, `a0 24 pp`, `80 24 00`); no sequence or SEND MIDI needed |
