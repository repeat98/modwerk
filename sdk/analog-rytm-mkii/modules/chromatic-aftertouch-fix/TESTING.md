# Pad Pressure Fix: testing

Up to 0.1.0 the module was Chromatic Aftertouch Fix. 0.2.0 adds the retrig change; the 0.1.0
sections below (the CHROMATIC note) are unchanged and still apply.

## 0.2.0: pad pressure during retrig rolls

### Stock, read in the code (OS 1.74)

From the same disassembly as below, kept outside the repository.

- A pad pressure event (UI message type 2, `0x400a4766`) goes through `0x400a03b4` to the view
  stack (`0x400798c0`): the top view's pressure method runs first, and the view below gets it only
  when that returns 0.
- The sound's aftertouch is one word per track at `0x800067de` (setter `0x4011f490`). The audio
  interrupt smooths it every block (`0x40120f0a`); no trig or retrig hit resets it.
- The kit's RETRIG record per track is at kit + 4 × (610 + track): +3 RATE, +4 LENGTH, +5 VEL.CUR
  (signed, 0 = OFF; getter `0x400a72f6`). ALWAYS ON is bit `track` of kit + 2439 (`0x400a7020`).
  RTRG is key `0x85`.
- `0x4011f262(track, pressure)` writes a running roll's velocity (`0x42ac6b4c` + 56 × track,
  only while `0x8000fe44[track]` is set).
- KeyboardView's pressure method (`0x400c74d4`): with RTRG held or ALWAYS ON, and VEL.CUR 0 (and
  `0x400b7724(view + 148)` false), it calls `0x4011f262` and branches out at `0x400c755a`, before
  the aftertouch (`0x4011f490`) and MIDI (`0x400850f4`) path. ChromPadsView's (`0x400c6196`) does
  the same, branching out at `0x400c6228`.
- The RETRIG menu KeyboardView pushes while RTRG is held (`0x400c7c56`) has its own pressure
  method (`0x400e27cc`, reached through `0x400e2930`): step writes while the sequencer records
  (read as LIVE RECORDING's, not traced further), then `0x4011f262` if VEL.CUR is 0, and it always
  returns the pad's valid flag (`0x400e2924`), so the views below never see the event. It takes
  the pad index as the track (`0x4006cf5e`); ChromPadsView takes the active track. A trig's
  RETRIG menu (trig + UP or DOWN) is another view, whose pressure method returns 0.

The module turns the two branches out into no-ops and makes the menu return 0.

### rytm-emu

rytm-emu 2ac0f1f, headless `dtboot`, from a snapshot booted with four NO presses on a fresh card.
BD held 700M with raw pressure `9014`, `901e`, `901c` (20, 30, 28). RTRG held over the press, or
ALWAYS ON and VEL.CUR set beforehand in the RETRIG menu (RTRG held: DOWN, DOWN, RIGHT gives VEL.CUR
1; DOWN, YES checks ALWAYS ON; seen on the screen). Counted with `--count`: calls of the aftertouch
setter `0x4011f490` and of the roll velocity writer `0x4011f262`; MIDI out with `--midi-out`
(AUTO channel 14). Every run raised only TRAP #0 (vector 32), as stock does.

| Name | Contents | sha256 |
| --- | --- | --- |
| PX01 | core-ar2 0.7 alone | `edebddcf…d075` |
| **PF01** | core-ar2 0.7 + this folder | `c1b0e115…f319` |

| Case | Stock 1.74 and PX01 | PF01 |
| --- | --- | --- |
| Plain pad | aftertouch 3, roll 0, `9d 00 7f ad 00 0a ad 00 0f ad 00 0e 8d 00 00` | the same |
| RTRG held, VEL.CUR OFF | aftertouch 0, roll 3, `9d 00 7f 8d 00 00` | aftertouch 3, roll 6 (menu and pad view), `ad 00 0a ad 00 0f ad 00 0e` |
| RTRG held, VEL.CUR 1 | aftertouch 0, roll 0, `9d 00 7f 8d 00 00` | aftertouch 3, roll 0, pressure sent |
| ALWAYS ON, VEL.CUR OFF | aftertouch 0, roll 3, no pressure | aftertouch 3, roll 3, pressure sent |
| ALWAYS ON, VEL.CUR 1 | aftertouch 3, roll 0, pressure sent | the same |
| CHROMATIC, plain | aftertouch 3, `ad 3c pp` | aftertouch 3, `ad 24 pp` (0.1.0) |
| CHROMATIC, RTRG held | aftertouch 0, roll 3 (the pad index's track), no pressure | aftertouch 3, roll 6 (3 the pad index's track, 3 the active track's), `ad 24 pp` |
| PERF mode, plain | performance pressure `0x400b2c6a` 3 | the same |
| PERF mode, RTRG held | performance pressure 0; the menu's roll writer is called 3 times but writes nothing | performance pressure 3; no roll, no write |

In PERF mode with RTRG held, a pad press plays nothing on stock or with the module: the trigger
`0x40083f40` and KeyboardView's play call `0x400c7a1c` never run (with RTRG held on the pad pages
they run once), and the roll velocity word is never written. So no track rolls there, and the
pressure the module passes on only reaches the performance view.
| CHROMATIC, ALWAYS ON | aftertouch 0, roll 3, no pressure | aftertouch 3, roll 3, `ad 24 pp` |
| CHROMATIC, ALWAYS ON, VEL.CUR 1 | aftertouch 3, `ad 3c pp` | aftertouch 3, `ad 24 pp` |

The aftertouch words written were `0a00`, `0f00`, `0e00` in every case that wrote them. The same
nine cases on base 8b0cafbc alone and on the author's 16-module combination gave stock's results
(the combination's CHROMATIC notes as 0.1.0), so no other module changes them.

Build: `node scripts/link-image.mjs --stock Analog-Rytm_MKII_OS1.74.syx --version PF01 --out PF01.syx
--elemod vendor/elekloader/catalog/core-ar2-0.7.elemod --module analog-rytm-mkii:chromatic-aftertouch-fix`.

Beside the author's 16 modules (Live Rec Retrig Fix among them; test build PP01 `b939ae56…bd8a`,
store lock unchanged) the nine cases gave PF01's results, and a roll with RTRG held in LIVE
RECORDING (RECORD + PLAY, then RTRG + BD) wrote the aftertouch and sent the pressure, with no
fault; without the module (the same set with 0.1.0) it sent none. The trigs it recorded were not
compared. Not run: RTRG held over SCENE pads (their views take pressure and do nothing with it,
read in the code), a trig's RETRIG menu (trig + UP or DOWN; its view passes pressure on as stock).

An independent review of the diff against the disassembly (6 November 2026) confirmed the three
sites' bytes, guards and instruction boundaries, the stack and registers after each fall-through,
that a 0 return only passes the event to the next view (`0x400797f2`), and that both writers are
plain stores, so the double call with RTRG held changes nothing. It found PERF mode and the timed
popup above, both now in the README.

### On a unit

PP01 (`b939ae56…bd8a`: the author's 16-module set with this version, store lock unchanged) on the
author's Analog Rytm MKII, OS 1.74, 6 November 2026. USB MIDI was logged on the computer (notes
and pressure per hold); the steps and what was heard are as reported by npp1993.

| Step | Reported | USB MIDI log |
| --- | --- | --- |
| RTRG held + BD, VEL.CUR OFF, pressure varied | aftertouch data during the roll | poly pressure in every hold, note 0, values up to 127 |
| RTRG held + BD, VEL.CUR about 63 | aftertouch data | as above |
| ALWAYS ON, VEL.CUR set | aftertouch data | as above |
| ALWAYS ON, VEL.CUR OFF | aftertouch data | as above |
| CHROMATIC, ALWAYS ON | aftertouch data | poly pressure on the played notes (36, 41, 37, 42), none 24 above |
| CHROMATIC, RTRG held | aftertouch data | as above |

Pad pressure falling after the note off still went out on normal pads as single `An 00 pp`
messages, as the plain-pad path sends it on stock. Reported: with VEL.CUR OFF the roll got
louder with more pressure (the sound's velocity to volume on), so stock's roll velocity still
follows pressure. PERF mode, RTRG held, pad 1 pressed harder: the sound changed, so the
performance follows pad pressure while RTRG is held (stock freezes it; see rytm-emu above). Not
reported: whether the sound's own AFTERTOUCH target moved. Run beside the 16 modules
only, not alone.

## 0.1.0: CHROMATIC note

### The bug, read in the code (OS 1.74)

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

### rytm-emu (OS 1.74)

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

### On a unit

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
