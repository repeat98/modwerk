# Silent Pad+Trig Settings — test report

Until 0.4.0 this module was Pad Select (`pad-select`) and its row PAD+TRIG SEL TRK, as in
rytm2_mods; 0.4.1 renames the module, the row (SILENT PAD+TRIG), the source file, the symbols and
the storage field (`silent_pad_trig_on`), with no change in behaviour. 0.5.1 renames 0.5.0's
second row, SILENT LIVE REC, to SILENT PAD LIVEREC (its storage field stays `silent_live_rec_on`).
After 0.5.1 the module's display name becomes Silent Pad+Trig Settings (the id, rows and fields stay). The sections below use the new names, also for the earlier builds.

- Module: `silent-pad-trig` 0.5.1-experimental, for Analog Rytm MKII OS 1.74 on core-ar2 0.3.
- Source: npp1993's own mod, first written as `pad-select` 0.2 in a local rytm2_mods checkout
  (commit `35ea2f0`, branch `claude/pad-select`), never published there; this folder is now the
  source, so the manifest names no upstream revision. 0.2.0-experimental here was that file byte for byte
  (`93d95e91…3863`, fingerprint `10bc355d…aecd`). 0.4.0 changes `play_gate`, `active`,
  `func_gate` and `drw_invoke` ([0.4.0](#040-pads-silent-in-live-rec-aftertouch-as-stock-2026-10-25);
  0.3.0's aftertouch hook and its site are gone again): `src/silent-pad-trig.s` `c96a146c…6c55` (renamed from `pad-select.s` in 0.4.1). `include/ar2-1.74.inc` (`c57431f7…874b`) is rytm2_mods'
  `include/ar2-1.74.inc`, byte for byte. Source fingerprint (`sha256` of
  `sha256sum include/ar2-1.74.inc src/silent-pad-trig.s`): `2e521380…8ea5`. 0.5.0's
  `src/silent-pad-trig.s` is `22019c7f…53a7`, fingerprint `bf1ed603…cd2f`. 0.5.1's is
  `d28cf9a1…40d1`, fingerprint `5f4c6a70…9cbd`, the source PS07/PS08 were built and
  tested from. After review, two comments that cited OS 1.73 addresses now cite 1.74's (AUTO TRK
  SWITCH's label invoker `0x400eb710` and drawer `0x400ec450`, read from the 1.74 code):
  `src/silent-pad-trig.s` `ed52848f…5f8b`, fingerprint `9cbf3b3f…2a90` (`evidence.sourceSha256`).
  Modwerk's builder compiles it to the same module bytes, sites and relocations as before; only
  the provenance hashes differ, so the PS07/PS08 results stand.
- Stock OS 1.74: `.syx` `cb0f99d6…e123`, main OS `34cd0c4d…1f3b`, the owner's file.
- Core: elekloader core-ar2 0.3 (`core-ar2-v0.3`, `core-ar2-0.3.elemod` `6b97dfb3…3e58`, as vendored).
- Build PS08 (core-ar2 0.3 + 0.5.1, Modwerk's linker, `--version PS08`): `.syx`
  `ff7c4cf3ca61f3c461a16a416cb4515e0d44727216f688ab965785bdbd5343d4`, main OS `9b9ec176…9132`.
  Tested in rytm-emu 2026-10-27 ([0.5.1](#051-row-renamed-2026-10-27)). Ran on an Analog Rytm MKII
  on 2026-10-27 for the label and saving ([Hardware](#ps08-on-an-analog-rytm-mkii-2026-10-27-as-reported));
  PS07's functional results carry over (the same code apart from the label).
- Build PS07 (core-ar2 0.3 + 0.5.0, Modwerk's linker, `--version PS07`): `.syx`
  `eae28e8ff6ae9f29a9d608c0fbe3985804779b42fd96d33d1e4c1d97934cae99`, main OS `80a0fbfa…20b5`.
  Tested in rytm-emu 2026-10-27 ([0.5.0](#050-two-settings-2026-10-27)). Ran on an Analog Rytm
  MKII on 2026-10-27 ([Hardware](#ps07-on-an-analog-rytm-mkii-2026-10-27-as-reported)).
- Build PS06 (core-ar2 0.3 + 0.4.1, Modwerk's linker, `--version PS06`): `.syx`
  `08b4c1a724b25904be6724d9cd0a53ba553242b6d090a7ec1e33b94b9bd25d24`, main OS `168fe5cf…fb56`.
  Tested in rytm-emu 2026-10-25. Not run on a unit.
- Build PS05 (0.4.0): `.syx` `40e2f30a…2865`, main OS `ed7bcf14…3c4e`. Ran on an Analog Rytm MKII
  on 2026-10-25 ([Hardware](#hardware)).
- Build PS04 (0.3.0 with the review fixes): `.syx` `5c95d386…566f`, main OS `6655ec5e…15a8`.
  Ran on an Analog Rytm MKII on 2026-10-25 ([Hardware](#hardware)).
- Build PS03 (0.3.0 before the review fixes): `.syx` `f0ac2210…7a85`, main OS `2884ff5a…5879`.
- Build PS74 (core-ar2 0.3 + 0.2.0): `.syx` `4b2e6567…ad21`, main OS `7ea05528…033f`. The
  emulator sections below marked 0.2.0 ran on it.

## 0.5.1: row renamed (2026-10-27)

At the owner's request the second row, SILENT LIVE REC in 0.5.0, becomes SILENT PAD LIVEREC, the
longest of three candidates that renders cleanly. Only the `txt_live` string changes; the storage
field keeps its name (`silent_live_rec_on`), so a unit's settings survive the update. Build as
0.5.0's: a 940-byte `.run` (the label is three characters longer), the same five sites, 20
relocations, `silent_live_rec_on` at global bit 0 and `silent_pad_trig_on` at bit 1. Linked with
core-ar2 0.3 alone (PS08, main OS `9b9ec176…9132`) and beside Filter Hz 1.2.0 and Loop Sync
0.2.0-experimental (`c7ef5423…bb4b`); the source-only export links the same.

**Rendering** (rytm-emu `c5732f0`, cold boots, the capture plan in `media/capture.json`, the row
highlighted and then checked, read at 3x and pixel by pixel at 128x64). Every row's box starts at
x = 112; stock's longest rows, QUANTIZE LIVE REC and KIT RELOAD ON CHG, end 5 and 6 pixels before it.

| Candidate | Result |
| --- | --- |
| SILENT PAD LIVE REC (19) | rejected: the C of REC starts at x = 111 and the box draws over it |
| SILENT PAD LIVEREC (18) | chosen: the whole text shows and ends at x = 110, one clear pixel before the box, highlighted, unhighlighted and checked; the box lines up with the other rows' |
| SILENT LIVE PADS (16) | fits, with room to spare; not needed |

**Emulator.** PS08's four capture frames come from one cold boot (`media/capture.json`); a second
identical run gave all 28 frames byte for byte. Against PS07's, `control-menu.png` and
`silent-press.png` are byte-identical; only the two SEQUENCER CONFIG frames changed, where the
row's label shows. **Upgrade from 0.5.0:** a fresh card, PS07 cold-booted with only SILENT LIVE
REC checked, then `--power-off`; PS08 cold-booted on that card shows SILENT PAD LIVEREC checked and
SILENT PAD+TRIG unchecked. The behaviour tests below were not rerun: the code is 0.5.0's apart
from the label, and PS07's emulator and [hardware](#ps07-on-an-analog-rytm-mkii-2026-10-27-as-reported)
results carry over to PS08.

## 0.5.0: two settings (2026-10-27)

At the tester's request, the one setting becomes two, so silent pads while editing and silent
pads while live recording can be chosen separately:

- **SILENT PAD+TRIG** (`silent_pad_trig_on`, as before): every state but LIVE and STEP REC; pads
  and TRIG keys 1-12.
- **SILENT PAD LIVEREC** (`silent_live_rec_on`, new, global, 1 bit): LIVE REC; pads only. TRIG keys
  play and record in LIVE REC as before.

`active()` now reads STEP and LIVE REC first, then the setting for that state, so each press calls
both state getters even with both settings off (0.4 read the setting first). The menu constructor
appends two items through one `item_add` routine fed by a table of each item's four invokers; the
label, action, changer and drawer invokers take their text or field through a short entry per item.
Same five sites. Compiled in the cloud with Ubuntu's `m68k-linux-gnu` binutils 2.42
(`build-elemod-packages.mjs`, `MODWERK_CROSS=m68k-linux-gnu-`): a 936-byte `.run`, no `.bss`, two
storage fields. Source fingerprint (`sha256` of `sha256sum include/ar2-1.74.inc
src/silent-pad-trig.s`): see `evidence.sourceSha256` in the manifest.

**Build and link** (2026-10-27, on the owner's computer): Homebrew `m68k-elf` binutils/GCC,
Node 24.21.0, as in [Source build and link](#source-build-and-link-020-2026-10-24). The recipe has
a 936-byte `.run`, 5 sites (the same five), 20 relocations, no `.bss` and two global storage
fields; core-ar2 0.3's allocator puts `silent_live_rec_on` at global bit 0 and
`silent_pad_trig_on` at bit 1 (no lockfile). Linked with Modwerk's linker (`linkMods`):

| Selection | Result | Main OS sha256 |
| --- | --- | --- |
| core-ar2 0.3 + Silent Pad+Trig (PS07) | links | `80a0fbfa…20b5` |
| core-ar2 0.3 + Filter Hz 1.2.0 + Loop Sync 0.2.0-experimental + Silent Pad+Trig | links, no overlaps; both bits beside Loop Sync's sound and project fields | `54123495…f024` |

The source-only export linked the same, alone and beside Filter Hz and Loop Sync. PS07 `.syx`:
`eae28e8f…ae99`. It stays on the owner's computer.

**Emulator** (emulator results, not hardware): [rytm-emu](https://github.com/trigcondition/rytm-emu)
`c5732f0`, headless `dtboot` with the JIT, the same method, counters and key timing as the
[0.2.0 runs](#emulator-020-2026-10-25). Five snapshots from one key sequence at the same clock
(GLOBAL > CONTROL > SEQUENCER CONFIG, three DOWNs, YES or not, DOWN, YES or not, four NOs):
**N** PS07 with neither row checked, **P** only SILENT PAD+TRIG, **L** only SILENT PAD LIVEREC,
**PL** both, and **S** stock 1.74 (no YES).

- **Menu.** A PS07 cold boot shows SILENT PAD+TRIG and SILENT PAD LIVEREC after AUTO TRK SWITCH, both
  unchecked, their boxes in AUTO TRK SWITCH's column. YES on one row checks it and leaves the
  other; RIGHT checks and LEFT unchecks only the highlighted row.
- **Neither checked (N) against stock (S):** in all 26 groups below, the same counts, a
  byte-identical MIDI out log and pixel-identical screens, apart from SEQUENCER CONFIG, which has
  the two rows. The modelled analog output of a LIVE REC take is byte-identical between a run with
  and without live recording when nothing is tapped, as on stock.

| Group | S (stock) | P (SILENT PAD+TRIG) | L (SILENT PAD LIVEREC) | PL (both) |
| --- | --- | --- | --- | --- |
| Stopped: SD, FUNC + SD, TRIG 5, FUNC + TRIG 5 | SD 127, FUNC + SD 100, TRIG 5 100, FUNC + TRIG 5 nothing | SD and TRIG 5 silent; FUNC + SD 127 | as S | as P |
| Playing: SD, FUNC + SD, TRIG 5 | play (127, 100, 100) | SD and TRIG 5 silent; FUNC + SD 127 | as S | as P |
| GRID REC: TRIG 3, SD, FUNC + SD, TRIG 3 | trigs placed; SD 127, FUNC + SD 100 | trigs placed; SD silent, FUNC + SD 127 | as S | as P |
| LIVE REC: SD, FUNC + SD, TRIG 5, NO + SD | SD 127, FUNC + SD 100, TRIG 5 100; NO + SD reaches no play routine | as S | SD silent; FUNC + SD 127; TRIG 5 100; NO + SD as S | as L |
| STEP REC: TRIG 3, TRIG 4, SD | TRIG keys pick steps; SD 127 | as S | as S | as S |
| PERF, SCENE: SD, FUNC + SD, TRIG 3 | pads drive the mode; TRIG 3 plays | TRIG 3 silent | as S | as P |
| MUTE: FUNC + SD twice, SD twice | mute CCs, no play routine | as S | as S | as S |
| TRK + SD, TRK + TRIG 5; QPER + SD, QPER + TRIG 3; BANK A + TRIG 2, + TRIG 1 | no play routine | as S | as S | as S |
| FIX on: SD, FUNC + SD | both 100 | SD silent, FUNC + SD 100 | as S | as P |
| FX track: TRIG 3, then SD | play | silent | as S | as P |
| TRIG 13, FUNC + TRIG 13, TRIG 16 | TRIG 13 plays (note 12) | TRIG 13 silent | as S | as P |
| GLOBAL menu open: SD, FUNC + SD, TRIG 5 | play (127, 100, 100) | SD, TRIG 5 silent; FUNC + SD 127 | as S | as P |
| LIVE REC, PLAY (ends it), SD, TRIG 5, PLAY, SD | play | silent | as S | as P |
| RTRG + SD held; FUNC + RTRG + SD held | one trigger each (127; 100) | RTRG + SD silent; FUNC + RTRG + SD 127 | as S | as P |
| SOUND BROWSER: SD, FUNC + SD, TRIG 3 | SD and FUNC + SD audition; TRIG 3 picks bank C | SD silent; FUNC + SD auditions at 127 | as S | as P |
| Soft strikes: plain soft, FUNC + soft, FUNC + hard | 15, 100, 100 | silent, 15, 127 | as S | as P |
| CHAIN, SONG, FILL: SD, TRIG 3 | play | silent | as S | as P |
| CHROMATIC: SD, FUNC + SD, TRIG 3 | pads play their notes; TRIG 3 plays track 3 | pads as S; TRIG 3 silent | as S | as P |
| MIDI note in; TRIG 3 + YES in GRID REC | voice trigger runs | as S | as S | as S |
| SD held with pressure, then FUNC + SD held | note and poly pressure (`AD 01 …`) for both | plain hold: poly pressure, no note; FUNC + SD: note and pressure | as S | as P |
| AUTO TRK SWITCH unchecked (LEFT on its row), then stopped SD, TRIG 5, FUNC + SD, then LIVE REC SD, TRIG 5 | all play, the track stays BD | stopped SD and TRIG 5 silent and select SD, then BT; FUNC + SD plays and stays BT; LIVE REC presses play, stay BT | stopped presses as S; LIVE REC SD silent and selects SD; TRIG 5 plays, stays SD | stopped as P; LIVE REC as L |

Screens matched stock in every group and configuration, apart from SEQUENCER CONFIG and the
selections AUTO TRK SWITCH off changes by design. Velocities are the MIDI note-on values on the
auto channel.

**Recording in LIVE REC.** The modelled analog output (`--analog-wav`, `DTEMU_ANALOG_SEED=1`) of
RECORD + PLAY, a tap at 4.0 s, PLAY at 6.5 s (ends live recording; the sequencer plays on) and
30 s in all. A tap that is recorded makes the take differ from a play-only run with the same tap
from the recorded step's next pass on; runs from P, L and PL share one baseline (their untapped
takes are byte-identical), so their takes compare directly:

| Tap | S | P | L | PL |
| --- | --- | --- | --- | --- |
| SD | sounds (127) and is recorded: differs from the play-only tap from 5.89 s, one bar on | sounds and is recorded: byte-identical to PL's FUNC + SD | byte-identical to no tap: nothing sounded, nothing recorded | as L |
| FUNC + SD | sounds (100) and is recorded (differs from the play-only tap from 5.93 s) | sounds (100), as S | byte-identical to PL's | sounds (127) and is recorded: differs from the play-only tap from 5.89 s |
| TRIG 5 | sounds and is recorded (differs from the play-only tap from 7.78 s) | byte-identical to L's and PL's | sounds and is recorded (differs from the play-only tap from 7.78 s, as S) | byte-identical to L's |

N gave the same results as S.

**Persistence and GLOBAL slots** (fresh card images): one card with only SILENT PAD+TRIG checked,
one with only SILENT PAD LIVEREC, each followed by `--power-off`. A cold boot of PS07 on each shows
its own row checked and the other unchecked; on the first, SD and TRIG 5 are silent, on the
second they play. GLOBAL SLOT 2 shows both rows unchecked (with slot 2's own stock settings), and
SD plays; RIGHT on SILENT PAD LIVEREC checks it there; back in slot 1 its rows are as set. After a
second power-off and cold boot, slot 1 and slot 2 still hold their own rows. Stock 1.74 cold-boots
on the first card with the stock SEQUENCER CONFIG, and SD plays.

**Upgrade from 0.4.1.** A card saved by PS06 with SILENT PAD+TRIG checked: PS07 cold-boots on it
with both rows unchecked, and pads play. The new field changes core-ar2's storage layout, so the
old bit is not carried over (README limitation).

**Menu cycling.** From PL, SEQUENCER CONFIG opened and closed 30 times (YES, NO): every frame
drawn as expected, the rows still checked, and afterwards SD silent and FUNC + SD at 127. The
menu constructor site is not reached again while cycling: the view is built once.

**Captures.** The four PNGs in `media/` come from one PS07 cold boot (command line in
`media/capture.json`); a second identical run gave all 28 frames byte for byte.

Not compared in the emulator: a paused LIVE REC, loading a saved project, Global SysEx receive,
other modules beside it at run time, and sound beyond the modelled analog voices. No fix was
needed: the source is as committed in 2746321a.

## Sites

Five sites, read from stock OS 1.74, each recorded as an address, a length and the SHA-256 of
those bytes; all are rytm2_mods' and their stock bytes match its `mod.json`. 0.3.0 had a sixth,
`0x400c74d4` (the pad-pressure handler), which 0.4.0 drops.

| Address | Length | Op | Target | What |
| --- | --- | --- | --- | --- |
| `0x400c772e` | 6 | jmp | `silent_pad_trig_play_gate` | the play routine both key handlers call |
| `0x400c7a3e` | 6 | jsr | `silent_pad_trig_autotrk` | the pad handler's AUTO TRK SWITCH call |
| `0x400c7e90` | 6 | jsr | `silent_pad_trig_autotrk` | the TRIG key handler's AUTO TRK SWITCH call |
| `0x400c7950` | 6 | jmp | `silent_pad_trig_func_gate` | the pad handler's FUNC test |
| `0x400ec184` | 8 | jmp | `silent_pad_trig_menu_add` | the SEQUENCER CONFIG menu's constructor (jmp + nop) |

rytm2_mods declares the two AUTO TRK SWITCH sites as `keep2`. The stock instruction there is an
absolute `jsr`, so `keep2` and `jsr` write the same six bytes; this folder uses `jsr`, which
Modwerk's source-only export accepts (it refuses `keep2`).

## Source build and link (0.2.0, 2026-10-24)

```sh
node scripts/machine-modules.mjs --drafts
MODWERK_CROSS=m68k-elf- node scripts/build-elemod-packages.mjs --output OUT \
  --source-commit <commit> --drafts --module analog-rytm-mkii:silent-pad-trig
node scripts/package-elemod-recipe.mjs OUT/analog-rytm-mkii/silent-pad-trig/1.74.json pad.elemod
```

Compiler: Homebrew `m68k-elf` binutils/GCC on macOS, Node 24.21.0. Modwerk's pinned Docker
toolchain was not run here.

The compiled recipe has a 764-byte `.run`, 5 sites, 5 relocations, no `.bss` and one storage
field, the same sizes elekloader's build of rytm2_mods 0.2 reports. Materialised against the
owner's stock OS 1.74 and linked with Modwerk's linker (`linkMods`, no lockfile):

| Selection | Result | Main OS sha256 |
| --- | --- | --- |
| core-ar2 0.3 + Silent Pad+Trig | links; `silent_pad_trig_on` global bit 0 | `7ea05528…033f` |
| core-ar2 0.3 + Filter Hz 1.2.0 + Loop Sync 0.2.0-experimental + Silent Pad+Trig | links, no overlaps; `silent_pad_trig_on` global bit 0, beside Loop Sync's sound and project fields | `970dad34…06e5` |

The source-only export (`pad.elemod`, not committed) linked with the core gives the same main
OS as the local materialisation, `7ea05528…033f`. The builds stayed on the owner's computer.

Not compared byte for byte with an elekloader build on core-ar2 0.3: the elekloader build kept
in rytm2_mods is on core-ar2 0.4, and no elekloader checkout was available here.

## 0.4.1: renamed (2026-10-25)

At the tester's request the module becomes Silent Pad+Trig (`silent-pad-trig`) and its row
SILENT PAD+TRIG, default unchecked as before; the folder, source file, symbols and storage field
(`silent_pad_trig_on`) follow. Behaviour is unchanged. A unit that ran an earlier build loses the
setting once (the field has a new name) and starts unchecked.

Build: 780-byte `.run` (the label is a character shorter), 5 sites, 6 relocations;
`silent_pad_trig_on` at global bit 0; links with core-ar2 0.3 alone (`168fe5cf…fb56`) and beside
Filter Hz and Loop Sync (`54174839…d26d`); the source-only export links the same.

PS06 in rytm-emu: every group (the 20 mode groups, both AUTO TRK SWITCH groups, aftertouch, LIVE
REC) gave the same counts, MIDI out and screens as PS05, except the SEQUENCER CONFIG screens,
which show the new label; B6 (unchecked) matched stock. On a fresh card: checked, power-off, cold
boot: still checked, and SD silent. The capture frames changed only where the row shows.

## 0.4.0: pads silent in LIVE REC, aftertouch as stock (2026-10-25)

After testing PS04 on a unit, the tester asked for two changes:

- **Pads stay silent in LIVE REC.** A plain pad tap there selects only; FUNC + pad plays and
  records. TRIG keys keep playing and recording in LIVE REC, as stock (FUNC + TRIG cannot play),
  and STEP REC stays stock. `active()` now takes the key: a pad is gated outside STEP REC, a TRIG
  key outside LIVE and STEP REC.
- **Aftertouch untouched,** so a held pad can modulate its sound without playing it. 0.3.0's
  pressure hook (`pressure_gate`, site `0x400c74d4`), its per-pad bits and their clearing in
  `func_gate` are removed; pressure goes to stock whatever the press did.

Build: 784-byte `.run`, 5 sites, 6 relocations; links with core-ar2 0.3 alone (`ed7bcf14…3c4e`)
and beside Filter Hz and Loop Sync (`6f87c449…c0cf`); the source-only export links the same.

PS05 in rytm-emu (**A5** checked, **B5** unchecked, **S** stock, snapshots made as before):

| Test | A5 (checked) | S (stock) |
| --- | --- | --- |
| LIVE REC: SD, TRIG 5, FUNC + SD, NO + SD | SD silent; TRIG 5 plays (velocity 100); FUNC + SD plays at 127; NO + SD reaches no play routine | SD and TRIG 5 play; FUNC + SD at 100; NO + SD the same |
| LIVE REC, then PLAY (ends live recording), analog recording of the next six bars: no tap / plain SD tap / FUNC + SD tap | plain tap: byte-identical to no tap, at the tap and in every later bar (nothing sounded, nothing recorded); FUNC + SD: the hit sounds and comes back once a bar | plain SD tap: the same as A5's FUNC + SD |
| SD held with pressure, FUNC + SD held, SD held | the plain holds send their poly pressure (`AD 01 …`) with no note-on; FUNC + SD sends note and pressure | all three: note and pressure |
| CY sequenced, its pad held: without / with a pressure stream | without: analog recording byte-identical to no press; with: the pressure modulates the cymbal (same recording as 0.2.0's) and goes out as poly pressure | |
| STEP REC: TRIG 3, TRIG 4, SD | as stock | |

All the other groups (the 20 mode groups and both AUTO TRK SWITCH groups) gave the same counts,
MIDI out and screens on PS05 as on PS04, except the LIVE REC pad press in the NO + pad group,
which is now silent. B5 matched stock in every group, apart from the SEQUENCER CONFIG screens with
the row. The 26 frames of the capture run are byte-identical to PS04's.

Release notes for publication (`src/community/module-changelogs/analog-rytm-mkii-silent-pad-trig.json`
cannot exist while the module is in `_submissions/`: the check refuses an ID outside the library):

```json
[{ "version": "0.4.1-experimental", "date": "2026-10-25", "changes": [
  "New module for Analog Rytm MKII OS 1.74 on core-ar2 0.3: with SILENT PAD+TRIG checked, a pad press selects its track silently, even while live recording.",
  "FUNC + pad plays the track at the pad's own velocity, and records it in live recording.",
  "Holding a pad down still sends aftertouch, so it can modulate a sound without playing it.",
  "TRIG keys select silently too, except in live and step recording.",
  "Known issue: MIDI out with the setting on is not yet tested on a unit."
] }]
```

## 0.3.0: AUTO TRK SWITCH and aftertouch (2026-10-25)

Two faults found in the 0.2.0 emulator runs below, fixed in 0.3.0:

- **FUNC + pad forced a selection.** 0.2.0's `autotrk` answered "on" whenever the setting
  applied, so FUNC + pad, the gesture that plays as stock, also selected its track with AUTO TRK
  SWITCH unchecked; stock does not. 0.3.0 keeps "on" for a silent press only; a press that plays
  asks stock's getter. Checked first (on stock, counting `0x400c772e`, `0x400c7a3e` and
  `0x400c7e90` per press): every press that reaches either AUTO TRK SWITCH call has just run the
  play routine (a pad or TRIG key stopped, in GRID, STEP and LIVE REC, NO + pad, FUNC + TRIG,
  TRIG 13-16, PERF, SCENE, MUTE, TRK + pad), so `autotrk` never reads a stale answer.
- **Aftertouch passed through a silent press.** Pad pressure goes to KeyboardView's slot 18,
  `0x400c74d4` (on stock only in plain pad mode: not in MUTE, PERF, SCENE, TRK + pad or RTRG +
  pad; CHROMATIC has its own handler), which sends it to the voice (`0x4011f490`) and as MIDI
  poly pressure (`0x400850f4`) whether or not the press played. 0.3.0 keeps one bit per pad,
  set by a silent press and cleared by one that plays, and hooks the handler's entry (also
  reached through a this-adjusting thunk, `0x400c7608`, so the vtable pointer alone is not
  enough): pressure on a pad whose press was silent is answered as handled and goes no further.

Build (PS03): 876-byte `.run`, 6 sites, 7 relocations; links with core-ar2 0.3 alone
(`2884ff5a…5879`) and beside Filter Hz and Loop Sync (`61841bd6…72bf1`); the source-only export
links the same.

Retest on PS03 (snapshots made as for 0.2.0: **A3** checked, **B3** unchecked, **S** stock):

| Test | A3 (checked) | S (stock) |
| --- | --- | --- |
| SD held with pressure, FUNC + SD held with pressure, SD held with pressure | only FUNC + SD sends its note and its aftertouch (`AD 01 …`); the two plain holds send nothing | all three: note and aftertouch |
| AUTO TRK SWITCH unchecked: FUNC + SD | plays at 127, the track stays BD (screens as stock) | plays at 100, stays BD |
| AUTO TRK SWITCH unchecked: SD, TRIG 5 | silent, each selects its track | play, the track stays BD |
| CY sequenced, its pad held 0.75 s with a pressure stream | analog recording byte-identical to the run without the press; no MIDI | (0.2.0 run) the press retriggers |

Every 0.2.0 mode group below, rerun on PS03: A3 gave the same counts, MIDI out and screens as
0.2.0's A in all 20 groups, and B3 matched stock in all of them. The four documentation frames
come out byte-identical on PS03.

### Review fixes (PS04, 2026-10-25)

A code review of 0.3.0 found two more faults, fixed before any hardware test:

- **The silent bit could go stale.** PS03 cleared a pad's bit only on its next press that reached
  the play routine. Silent SD tap, then LIVE REC, then NO + SD (erase) held with pressure: PS03
  dropped that pressure, stock sends it. Now `func_gate`, which the pad handler reaches for every
  press and release past its NO check, clears the pad's bit first, and `play_gate` sets it again
  for a silent press; the bit lasts from a silent press to its release. PS04: the same test sends
  the aftertouch exactly as stock (`AD 01 14 … 23`).
- **The checkbox drawer wrote over its caller's arguments** before tail-calling the stock bitmap
  routine. It now calls it with a frame of its own. PS04: all 26 frames of the capture run,
  unchecked and checked, are byte-identical to PS03's.

Build (PS04): 892-byte `.run`, 6 sites, 8 relocations; links with core-ar2 0.3 alone
(`6655ec5e…15a8`) and beside Filter Hz and Loop Sync (`21cf79ac…2441`); the source-only export
links the same. On PS04 (**A4** checked, **B4** unchecked, **S** stock, snapshots made as above),
every group (the 20 mode groups, both AUTO TRK SWITCH groups and the aftertouch group) gave the
same counts, MIDI out and screens as PS03's A3, and B4 matched stock in all of them except the
SEQUENCER CONFIG screens, which carry the row. The CY recording with a held, pressed silent pad is
byte-identical to the run without it, with no MIDI. Persistence and GLOBAL slots were last run on
0.2.0; the storage code has not changed since.

FUNC + RTRG toggles the metronome click on stock ("CLICK ON"), so FUNC + RTRG + pad, which 0.2.0's
design names as the roll gesture outside live recording, also switches the click.

## Emulator, 0.2.0 (2026-10-25)

[rytm-emu](https://github.com/trigcondition/rytm-emu) `c5732f0`, headless `dtboot`
(`cargo build --release --bin dtboot`, Homebrew Rust 1.99.1, JIT on), on PS74 and on stock 1.74.
Each run cold-boots, or resumes a snapshot of a cold boot, and clears the calibration notices with
four held NO presses. Behaviour is read from three counters (`--count`, visits to a PC) and from
MIDI out (`--midi-out`):

- `0x400c772e`: the play routine both key handlers call (Silent Pad+Trig's play gate sits here);
- `0x400c6f18`: the routine past the gate that triggers the voice and sends the MIDI note;
- `0x40083f40`: the shared voice trigger (also reached by CHRO pads, MIDI in and TRIG + YES).

A silent press is one that reaches the play routine but neither of the other two, and sends no
MIDI. The analog voices are modelled only approximately, so none of this is a listening test.

| Flow | PS74, SILENT PAD+TRIG checked | Stock 1.74 |
| --- | --- | --- |
| Menu | GLOBAL > CONTROL > SEQUENCER CONFIG shows SILENT PAD+TRIG after AUTO TRK SWITCH, unchecked; YES checks, LEFT unchecks, RIGHT checks | no row |
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

### Every mode that takes the pads, TRIG keys or FUNC (0.2.0, 2026-10-25)

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

**Aftertouch (0.2.0; fixed in 0.3.0, above).** The same held CY pad with a stream of pressure values (raw panel
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

### PS04 on an Analog Rytm MKII (2026-10-25), as reported

The tester flashed PS04 (`.syx` `5c95d386…566f`) with Transfer; the unit booted and showed PS04.
Reported results, in the tester's words summarised:

- With SILENT PAD+TRIG checked, the setting works as they expected: plain pad presses select
  without sound, and FUNC + pad plays.
- LIVE REC: pads still play (0.3.0's design).
- Aftertouch with an AFTERTOUCH destination set: after a silent tap held down, the destination
  registered only the initial tap, with no continuous aftertouch; with FUNC held it registered
  continuously (0.3.0's gate). The tester wants aftertouch untouched by the setting, so a held pad
  can modulate the sound without triggering it.
- Tapping a pad without FUNC does not cut a sequenced note.
- Power cycle: PS04 still loaded, SILENT PAD+TRIG still checked in GLOBAL slot 1.
- GLOBAL slot 2: SILENT PAD+TRIG unchecked, AUTO TRK SWITCH checked.
- MIDI out: not tested.

Not reported: GRID and STEP REC, CHROMATIC, MUTE, PERF, SCENE, the sound browser, AUTO TRK SWITCH
off, a long run.

### PS05 on an Analog Rytm MKII (2026-10-25), as reported

The tester flashed PS05 (0.4.0, `.syx` `40e2f30a…2865`). Reported:

- LIVE REC: plain pad taps silent and not recorded, FUNC + pad plays and records, TRIG keys play
  and record: passes as expected.
- Aftertouch: a silently tapped pad held down modulates its AFTERTOUCH destination continuously,
  with no note: passes as expected.
- GRID REC works normally. CHROMATIC mode works normally. MUTE mode works normally. PERF and
  SCENE "still seem fine".
- MIDI out: not tested (the tester expects no difference).

### PS07 on an Analog Rytm MKII (2026-10-27), as reported

npp1993 flashed PS07 (0.5.0, `.syx` `eae28e8f…ae99`) with Transfer. Reported:

- SEQUENCER CONFIG shows the two rows, SILENT PAD+TRIG and SILENT PAD LIVEREC.
- SILENT PAD+TRIG checked: pads make no sound unless FUNC is held; works as expected.
- SILENT PAD LIVEREC checked, in LIVE REC: plain pad presses lay down no trigs; FUNC + pad plays and
  records; TRIG keys play and record as stock: as intended.
- Persistence, both rows checked: after a reboot straight from SEQUENCER CONFIG, without leaving
  the menu, neither was kept. After leaving the menu first and then rebooting, both were kept.
  The module saves through the same globals change notice a stock setter sends; PS08 confirmed
  stock's rows behave the same way.
- MIDI out and STEP REC: not tested.

### PS08 on an Analog Rytm MKII (2026-10-27), as reported

npp1993 flashed PS08 (0.5.1, `.syx` `ff7c4cf3…43d4`). Reported:

- SILENT PAD LIVEREC "barely fits" on the screen, and reads well without the space.
- Both rows checked, then both unchecked, then a power cycle without leaving SEQUENCER CONFIG:
  both came back checked. The same test on stock's KIT RELOAD ON CHG: checked, power cycle without
  leaving the menu, it came back unchecked; checked and leaving the menu, it was kept. So stock's
  rows are saved on leaving the menu too, and the module's rows behave as stock's.

### Still to do

Not yet reported on a unit for 0.5.x (PS07 and PS08 covered the two rows, both settings in their
own modes, the label and saving on leaving the menu):

1. Another GLOBAL slot keeps its own settings (seen on PS04 for 0.3.0's one row).
1b. 0.5.0: with only SILENT PAD LIVEREC checked, pads play outside LIVE REC and are silent and not
   recorded in it (FUNC + pad plays and records); with only SILENT PAD+TRIG, LIVE REC is stock.
2. Stopped and playing: pads and TRIG 1-12 select silently; FUNC + pad plays, soft and hard,
   at the pad's velocity. Holding a pad on a sounding track does not cut its note on release.
   AUTO TRK SWITCH unchecked: a silent press selects, FUNC + pad does not.
3. GRID REC: TRIG keys place trigs; pads select silently; FUNC + pad plays.
4. STEP REC: as stock.
5. CHROMATIC mode, MIDI notes in, TRIG + YES: as stock; the SOUND BROWSER auditions with FUNC +
   pad. A track with MIDI out: a silent press sends no note (its aftertouch still goes out),
   FUNC + pad sends a note.
6. RTRG + pad: silent and selects (FUNC + RTRG toggles the click).
7. MUTE, SCENE, PERF modes and TRK + pad: unchanged.
8. Unchecked: everything stock, AUTO TRK SWITCH as set.
9. A project saved with it checked, loaded on stock 1.74 and on a build without the module.

## Load and memory

940 bytes (0.5.1) in the shared DDR area, no `.bss`, no fast SRAM, two global storage bits. The sites are in the pad and TRIG key
handlers and their play routine, and the SEQUENCER CONFIG menu's constructor. Each press reads
the record state and one storage bit through `core_store_get`; nothing runs in the audio,
sequencer or tick paths. Static reading, not a measurement.

## Not tested

On a unit (0.5.x): MIDI out, STEP REC, RTRG, the SOUND BROWSER, AUTO TRK SWITCH off, and a
project saved with the rows checked loaded on stock. In the emulator: sound and timing, the flows listed above as not
compared, other modules beside it at run time, and loading a saved project.
