# Scale quantizer

(28 Sep 2026, Octatrick 2.9: a ROOT row under SCALE, and the unit moved into DRAM -- "ROOT, and the move into DRAM" below.
24 Sep 2026: polyphonic CHROMATIC keys on a paraphonic synth track -- "Paraphonic keys" below.
27 Sep 2026: the synth tracks' tuning units and the -4..+4 CHROMATIC octave -- "Synth tracks: semitone units" below.
2 Oct 2026: the legato switch is the track's LEG setting (3 Oct 2026: on every audio track -- OFF / MONO on a sample track), GLIDE is the slide time only -- "The LEG gate" below.)

**PROJECT > CONTROL > SEQUENCER gains a fourth row, SCALE** (OFF, then 24
scales). With a scale on, the **PTCH knob** on the PLAYBACK page of a
STATIC / FLEX / PICKUP track steps to the next scale degree in the turn
direction instead of one raw unit — on the Part's value, and on a step's
lock when a [TRIG] key is held — and a [TRIG] key played in **CHROMATIC
trig mode** snaps to the nearest degree (ties to the lower one) before it
becomes the pitch the voice, the recorded lock and the screen see. The
Digitakt / Digitone scale quantizer, on the Octatrack's own parameters.
**OFF is stock**: every detour replays what it displaced and does nothing
else. The setting is saved with the project and comes back after a cold
boot. RATE is a playback rate, not a semitone quantity, and is left alone
(on a synth track it is FINE, cents, since 27 Sep 2026 -- `modules/synth`).

**24 Sep 2026: a fifth row, GLIDE** (OFF, 1..127) — the SYNTH machine's
glide time (`modules/synth`: 10 ms at 1, 100 ms at 64, 1 s at 127) and,
with it on, **303-style legato on the CHROMATIC keys**: a key pressed while
another key of the same track is still held does not restart the voice, it
only moves the pitch (which the synth then glides to); releasing the first
key does nothing, releasing the last one releases the note. Saved as
`#SYNTH_GLIDE=n` after the SCALE line. Section "GLIDE and legato" below.

Since 2.9 the quantizer is a DRAM unit of octabam's platform runtime
(`quantizer.s`, 3,428 B) plus three small ROM units: `core.s` (192 B,
floating: the boot clamps, the defaults, the ROOT-rotated scale mask and
the 24 masks), `keys.s` (45 B, pinned) and `scale.s` (6 B, pinned); 19
detours, three grown pointer tables (3 + 3 entries), one poke — all in the
main-OS section plus the loader's append; the bootstrap and every flash-
programming path are untouched. (Until 2.8: one ROM unit of 3,268 B, which
left the zero run no room for other modules' caves -- see "ROOT, and the
move into DRAM".) The paragraph that follows is the 24 Sep 2026 state, kept
as written: one linked ColdFire unit (1,484 bytes, floating, linked by the
build at the address it lands on; 1,292 bytes before GLIDE — the unit now
assembles its branches with the `jb<cc>` forms, short where they reach), one
pinned 4-byte unit (the GLIDE byte), nine detours, three grown pointer
tables, one poke — all in the main-OS section; the bootstrap and every
flash-programming path are untouched. The SCALE half was **flashed** as
OCTATRICK1..3 (23-24 Sep 2026) and works on the unit; the GLIDE half is
measured under `ot_emu` through the virtual panel only (24 Sep 2026). The
13 Sep measurements below are the SCALE half's; logs and screens:
`out/_agents/quantizer/`.

## The scales

`qz_masks` in `quantizer.s`: bit k = semitone k above the root (the
track's pitch 0 = raw 64); the same set repeats an octave down. Names are
seven characters at most: the SEQUENCER window's value column is 33 px
wide (`PHRYGIAN` lost its N, `shots/a7_3_phrygian_x4.png` of the first
build).

| # | shown as | semitones |
|---|---|---|
| 0 | OFF | — |
| 1 | MAJOR | 0 2 4 5 7 9 11 |
| 2 | DORIAN | 0 2 3 5 7 9 10 |
| 3 | PHRYGN | 0 1 3 5 7 8 10 |
| 4 | LYDIAN | 0 2 4 6 7 9 11 |
| 5 | MIXOLYD | 0 2 4 5 7 9 10 |
| 6 | MINOR | 0 2 3 5 7 8 10 (natural minor / aeolian) |
| 7 | LOCRIAN | 0 1 3 5 6 8 10 |
| 8 | PENT.MN | 0 3 5 7 10 |
| 9 | PENT.MJ | 0 2 4 7 9 |
| 10 | MEL.MIN | 0 2 3 5 7 9 11 |
| 11 | HRM.MIN | 0 2 3 5 7 8 11 |
| 12 | WHOLE | 0 2 4 6 8 10 |
| 13 | BLUES | 0 3 5 6 7 10 |
| 14 | PHRYDOM | 0 1 4 5 7 8 10 |
| 15 | WH.DIM | 0 2 3 5 6 8 9 11 |
| 16 | HW.DIM | 0 1 3 4 6 7 9 10 |
| 17 | HUNGMIN | 0 2 3 6 7 8 11 |
| 18 | HIRAJOS | 0 2 3 7 8 |
| 19 | IN-SEN | 0 1 5 7 10 |
| 20 | IWATO | 0 1 5 6 10 |
| 21 | PELOG | 0 1 3 7 8 |
| 22 | DBLHARM | 0 1 4 5 7 8 11 |
| 23 | SUPRLOC | 0 1 3 4 6 8 10 |
| 24 | LYD.DOM | 0 2 4 6 7 9 10 |

## Where the setting lives, and how it persists

**26 Sep 2026 -- the settings moved into battery-backed RAM** (Tim's MKI,
OCTATRICK9: PROJECT > SAVE, power off, SCALE and GLIDE back to OFF). The
serializer hooks were never the problem: SAVE writes `project.work` through
the one serializer `0x40088288` (`0x4008fe40`, the same call SYNC TO CARD
makes) and then copies every `.work` to its `.strd` file by file
(`0x4008ee74`: project, markers, bank01-16, arr01-08 -- `0x40016388` per
pair), so after SAVE `project.strd` == `project.work`, `#SEQUENCER_SCALE=n`
and `#SYNTH_GLIDE=n` in both (measured, the three lines are the only
difference from a stock-firmware SAVE of the same project, the binary files
byte-identical). RELOAD copies `.strd` back over `.work` (`0x4008f180`) and
loads; PROJECT > CHANGE / RELOAD load `project.work` through the one loader
(`0x4009000c`: a parse-only pass, then `0x40025848` = the project defaults,
then the storing pass). **A power cycle reads no project file.** The unit
comes back from its battery RAM (CS1, `0x10000000..`): the boot
(`0x4001fa24..0x4001fbb4`) checks the checksum at `0x100fff00` over
`0x100fff04..ff` (cold -> the whole 1 MB cleared, `0x40025848`), sanitises
the settings block (`0x4000fec8`: `0x100b14ae` = CHAIN AFTER clamped 0..16
at `0x40010212..`) and memcpy's it to the live copy (`0x100b1480` -> `0x80000020`,
0x4c bytes, `0x100b14cc` -> `0x80000000`, 0x16) -- CHAIN AFTER is back
because its setter and the loader write the mirror `0x100b14ae` as well as
`0x8000004e`. Our two bytes lived in the OS image (`qz_scale` in this unit,
`qz_glide` pinned in `glide.s`), which the bootstrap copies from flash at
every power-on: OFF. The emulator never showed it because its RAM is empty
at every start and the rig loads the project through the loader, which
reads the lines back. Now the setting IS a battery byte: **SCALE at
`0x100b14ec`, GLIDE at `0x100b14ed`**, the linker's padding between the
block's last long `0x100b14de..e1` and the 16-byte-aligned project record
`0x100b14f0` (no reference in the OS; outside both memcpy'd blocks; a
`watchmem` over `0x100b14e2..ef` through boot, load, menu, PLAY, SAVE and
SYNC saw only the cold boot's whole-RAM clear). Every reader and writer uses
the byte in place (`lea qz_scale,%a0` absolute, `qz_glide_of`, the synth's
`sy_glide` at the same `GLIDE_AT`); two jsr detours keep it sane:
`qz_boot` at `0x40010212` inside the sanitiser (out of range -> OFF, then the
displaced `tst.b 0x100b14ae` so the caller's `bge` sees its flags) and
`qz_defaults` at `0x40025ac2` inside the project defaults (OFF with the
block: a cold boot, a boot with no project, every load before it stores, a
new project). `glide.s` is gone; 424 B of cave left (`octatrick-usb`).
Measured in `ot_emu` with the battery RAM dumped at the child's `quit` and
preloaded at the next start, no LOAD PROJECT posted (the hardware's
power-on; `OT_SRAM_OUT` / `OT_SRAM_IN` / `OT_NO_LOAD`, a test rig in the
emulator): OCTATRICK9 after SAVE + power cycle: CHAIN AFTER DIRECT restored,
SCALE 0, GLIDE 0 -- the report; this build: SCALE MIXOLYD (5) / GLIDE 82 /
DIRECT on the SEQUENCER window of the warm-booted unit. SYNC TO CARD writes
`project.work` only (6/80 there, `.strd` keeps SAVE's 5/82); SAVE 7/90, edit
to 3/10, RELOAD -> 7/90, both files 7/90; set 8/100 unsynced, PROJECT >
CHANGE to the same project -> the unit first writes the working state
(`project.work` 8/100, every `.work` rewritten, `.strd` untouched at 7/90)
and loads it back: 8/100, the lines following CHAIN AFTER through the same
files. A cold-booted rig (fresh RAM, the load posted) reads the file's
values every time: 5/82, 6/80, 7/90 after SAVE, SYNC, RELOAD.
`make check REMIX=octatrick-usb` ALL GATES PASSED.

The SEQUENCER window (`0x40065b14` draws it, `0x40065c7c` creates its
list state at `0x460e43d8` with `pea 3; pea 3` = count / visible,
`0x40065cec` handles keys, `0x40065c98` the LEVEL knob) is a generic list
over three parallel pointer tables — labels `0x400b27d0`, getters
`0x400b27dc`, setters `0x400b282c` (CHAIN AFTER's `0x400659ec` /
`0x40065a40`, the two checkboxes) — with three rows. The build grows all
three to four (`TableGrow`, the new tables at `0x400d7100 / 7180 / 7200`,
the six operands repointed: `0x40065bd8`, `0x40065bde`, `0x40065cc4`,
`0x40065d3e`, `0x40065d58`, `0x40065d72`), the count becomes 4 (poke
`0x40065c7c`: `4878 0003` → `4878 0004`) and the window scrolls, as the
firmware's longer lists do: three rows fit the PATTERN CHANGE frame, a
fourth would land on its bottom edge. The one thing the stock draw loop
lacked is indexing the tables from the scroll offset — it started at 0
(`clrl %d2`), so the fourth row could never come into view; `qz_draw`
replaces that. [DOWN] three times shows `SCALE`, the LEVEL knob steps it
(clamped: −4 from PHRYGN stays OFF, +30 stops at LYD.DOM, a single report
of +3 from OFF is PHRYGN; `remix_menu.log`, `a*`), [YES] steps it with
wrap-around like CHAIN AFTER. The value byte `qz_scale` lived in the unit
until 26 Sep 2026; it is the battery RAM byte `0x100b14ec` now (above).

**The project file.** `project.work` is text, `KEY=value` lines. The
loader (`0x400866c4`, a strcmp chain per line) **rejects an unknown key**
(`0x40088212` → `0x40086d3a`, error −51), so a new key would make the
project unloadable on stock firmware. But the line loop skips any line
whose first character is `#` (`0x400867a2..0x400867ac`), before the
chain — the file's own header is three such lines — so the setting is
written as a comment: **`#SEQUENCER_SCALE=n`**, right after
`PATTERN_CHANGE_CHAIN_BEHAVIOR`. Stock firmware loads such a project
unchanged. The writer (`0x40088882..`, one sprintf / strlen / write per
key through `a4 / a3 / a2`) is detoured at the start of the SILENCE_TRACKS
line; the loader's `#` check is detoured to compare the line against the
key and parse the digits (0..24, anything else = OFF), storing only in a
storing pass (`58(%sp)` = 0); and the loader's entry resets the byte to
OFF for a storing pass (second argument ≠ 0), so a project without the
line loads as OFF.

## Synth tracks: semitone units, and the extended CHROMATIC octave (27 Sep 2026)

`modules/synth`'s tuning system makes a synth track's PTCH byte semitones
(raw 64 = 0, one unit a semitone, -64..+63; its page clone gives the slot
the range 0..127) and its RATE byte FINE (cents). This unit follows those
units on a synth track (`qz_is_synth` / `qz_ui_synth`: FLEX, the assigned
slot's sample named SYNTH*) and leaves sample tracks byte for byte:

- **The PTCH knob and the p-lock editor** (`qz_knob`, `qz_plock` ->
  `qz_quant`): a degree is a raw whose pitch class (raw - 64) mod 12 is in
  the scale, every raw a semitone (`qz_pcof` computes it; sample tracks
  still look raw - 4 up in `qz_pcraw`, 5 a semitone); the range is the
  descriptor's, 0..127 on the synth page.
- **The CHROMATIC keys** (`qz_chrom`): on a synth track the key index the
  stock handler carries is the physical key, 0..15 (key 12 = [TRIG 13] =
  the root), and the pitch is raw = 64 + (key - 12) + 12 * octave, snapped
  by pitch class onto SCALE (nearest degree, the lower first at each
  distance -- the rule po_snap follows), a2 := that raw for the staged
  lock byte, the live recorder's PTCH lock and the screen.
- **The octave**: stock keeps one word, `0x460d16fc`, 0 or 1 -- FUNC +
  LEFT and FUNC + RIGHT both `eor` it (0x40045918), the handler's caller
  adds 12 * word to the key (0x40050254), the drawer chooses the 16- or
  13-key picture by it (0x40044968), prints it with `%d` (0x400449b8) and
  places the held-key marks with it (0x40044abe); at 1 keys 14..16 give
  index 25..27, which the handler refuses. On a synth track the octave is
  **`qz_oct`, -4..+4** (a byte of the pinned mailbox `keys.s`, `KEYS_AT +
  44` = `0x400d2cdc`, since 26 Sep 2026 -- the synth engine reads it to
  pitch a key the handler never posted; 0 at boot): `qz_octkey` steps
  it (LEFT down, RIGHT up, key codes 0x34 / 0x21 read from the handler's
  argument) and clears the stock word; `qz_keyidx` makes the caller's
  index the key itself; `qz_octdraw` clears the word before the picture
  choice, so the picture, the number and the marks draw at stock octave 0;
  `qz_octnum` prints `qz_oct` instead of the word. So the stock handler's
  range check, held-key byte, MIDI note out (72 + key: octave 0's notes,
  whatever `qz_oct`) and this unit's key mask (bit = key) are unchanged.
  Sample tracks: the displaced instructions.
- **MIDI IN** is modules/synth's since 30 Sep 2026 (its `po_mon` at the
  chromatic block's START `0x4000e746` replaced this unit's `qz_midi` at
  `0x4000e74c`: raw = note - 20 on a synth track, the full range, the note
  posted to the engine as a key of its own; sample tracks stock).

Five more detours (all `jmp` + nop over 8 displaced bytes) and the
`qz_polytrack` offset fix (track * 24, not track * 40, so VOIC is read on
every track and T2..T8's keys reach the paraphonic engine as T1's did):
the unit is 3,404 B (was 3,000). Measurements: `modules/synth/README.md`,
"The tuning system".

## What was hooked, and what is displaced

All addresses are the stock 1.40C main OS at `0x40000400` (listing:
`out/_agents/direct-jump/mainos.dis`). Sites are asserted against the
stock bytes before anything is written (`manifest.py`).

| site | stock bytes (displaced) | kind | stub | replays |
|---|---|---|---|---|
| `0x40055170` knob handler `0x40055008`, the store | `1482 1a82 320e` — `move.b %d2,(%a2); move.b %d2,(%a5); move.w %fp,%d1` | jsr | `qz_knob` | the three, after recomputing d2 |
| `0x40050e60` p-lock editor, the lock store | `1384 8859 73b9 100b14cc` — `move.b %d4,(0x59,%a1,%a0.l); mvz.b 0x100b14cc,%d1` | jsr + 2 nops | `qz_plock` | the two (the store as `(0x59,%a0,%a1.l)`, the same address), after recomputing d4 |
| `0x4004fc58` CHROMATIC key → pitch | `45f2 ac04 71b9 100b14cf` — `lea (4,%a2,%a2.l*4),%a2; mvz.b 0x100b14cf,%d0` | jsr + 2 nops | `qz_chrom` | the two, after snapping a2 |
| `0x4004fbfe` CHROMATIC key handler, the note-off gate | `4ab9 46c7dd26 663e` — `tst.l 0x46c7dd26; bne 0x4004fc44` | jmp + nop | `qz_leg1` | the FUNC test; with GLIDE on and a key held: the old key's MIDI note-off, `jmp 0x4004fc44` (no voice note-off); else `jmp 0x4004fc06` / `0x4004fc44` as stock |
| `0x4004fc94` the same handler, sample trig vs trigless | `4ab9 46c7dd26 6716` — `tst.l 0x46c7dd26; beq 0x4004fcb2` | jmp + nop | `qz_leg2` | the FUNC test; with GLIDE on and a key held: held := the new key, `jmp 0x4004fc9c` (the trigless trig); else `jmp 0x4004fcb2` / `0x4004fc9c` as stock |
| `0x40050254` CHROMATIC key handler's caller | `2039 460d16fc 2200` — `move.l 0x460d16fc,%d0; move.l %d0,%d1` | jmp + nop | `qz_keyidx` | both; a synth track: d0 = d1 = 0; `jmp 0x4005025c` |
| `0x40045918` FUNC + LEFT/RIGHT, CHROMATIC | `7401 b5b9 460d16fc` — `moveq #1,%d2; eor.l %d2,0x460d16fc` | jmp + nop | `qz_octkey` | both; a synth track: `qz_oct` +-1 (clamped -4..+4), the word := 0; `jmp 0x40045920` |
| `0x40044968` CHROMATIC drawer, picture choice | `7201 b2b9 460d16fc` — `moveq #1,%d1; cmp.l 0x460d16fc,%d1` | jmp + nop | `qz_octdraw` | both (the compare last: the `bne` after reads its flags), after clearing the word on a synth track; `jmp 0x40044970` |
| `0x400449b8` CHROMATIC drawer, the number | `2039 460d16fc 2f00` — `move.l 0x460d16fc,%d0; move.l %d0,-(%sp)` | jmp + nop | `qz_octnum` | both; a synth track pushes `qz_oct`; `jmp 0x400449c0` — with a scale on (2.9) it pushes its own format `"<ROOT> %d"` in place of stock's `pea "%d"` and continues at `0x400449c6` (the same nine arguments) |
| `0x40010212` boot sanitiser of the battery block | `4a39 100b14ae` — `tst.b 0x100b14ae` | jsr | `qz_boot` (`core.s`, ROM) | the `tst.b` last (the caller's `bge` reads its flags), after clamping SCALE 0..24, GLIDE 0..127, ROOT 0..11 |
| `0x40025ac2` project defaults | `42b9 100b14d4` — `clr.l 0x100b14d4` | jsr | `qz_defaults` (`core.s`, ROM) | the `clr.l`, after SCALE := OFF, GLIDE := OFF, ROOT := C |
| `0x40065bca` SEQUENCER draw loop | `4282 4fef 0020` — `clr.l %d2; lea 32(%sp),%sp` | jmp | `qz_draw` | the `lea`; d2 := scroll offset × 4; `jmp 0x40065bd0` |
| `0x400866cc` project loader entry | `2c2f 05c0 202f 05c4` — `move.l 1472(%sp),%d6; move.l 1476(%sp),%d0` | jmp + nop | `qz_ld_entry` | both; `jmp 0x400866d4` |
| `0x400867a2` project loader, the `#` check | `122f 048f 7101 7a23` — `move.b 1167(%sp),%d1; mvs.b %d1,%d0; moveq #35,%d5` | jmp + nop | `qz_ld_line` | the three; `jmp 0x400867aa` (or `0x40088224`, next line, when the line is ours) |
| `0x400888aa` project writer, SILENCE_TRACKS line | `7339 8000 004f 2f01` — `mvs.b 0x8000004f,%d1; move.l %d1,-(%sp)` | jmp + nop | `qz_wr` | both, after writing our line; `jmp 0x400888b2` |

**The knob.** `0x40055008(slot, delta)` resolves the Part byte (kind 0:
`blob + part*6322 + 0x8edaa + track*30 + machine*6 + slot`), reads it into
d6, calls the slot's own handler (`descriptor+0x12a+4*slot`; PTCH's is
`0x40032d08`, a fractional accumulator that swallows a detent now and
then — stock from 64: `64 65 66 67 68 69 69 70`, `stock_knob_chrom.log`),
clamps to the descriptor's `[min, min+count-1]` (`+0x6a`, `+0x9a`) and
stores at `0x40055170`. `qz_knob` acts when the scale is on, the slot is
A, the page kind (`0x460d1684`) is 0 and the descriptor's slot A is named
`PTCH` (`descriptor+0x16`; STATIC `0x400d301c`, FLEX `0x400d31ae`, PICKUP
`0x400d3664` — THRU / NEIGHBOR have no PTCH, COMB's PTCH is on an FX page):
d2 := d6 stepped |delta| degrees in the direction of delta (`qz_quant`),
where a degree is a raw on a semitone (raw = 64 + 5·n, the table
`qz_pcraw`: raw−4 → pitch class or 0xff) whose class is in the scale's
mask; a start between degrees (a value set with the scale off, or a
fraction) goes to the nearest degree in the turn direction; at the ends
the value stays, which is the stock clamp. The screen, the SRAM mirror
(`a5`), the lock write for a held trig and the CC echo all take d2 after
the hook.

**A held trig.** A turn with a [TRIG] key held never reaches
`0x40055008`: the p-lock editor (found with `ot_emu`'s `watchmem` on the
lock byte, `plock_watch_stock.log`: the only writer is pc `0x40050e60`)
loops over the held steps, takes the step's lock byte — or the Part's
value when it is 0xff — through the same handler and clamp into d4 and
stores it at `track record + 0x59 + flat slot` (a0 = the record, a1 = the
flat slot). `qz_plock` recomputes d4 the same way from the old lock byte
(read at the hook, before the store) or, when there is none, from the
Part's PTCH. Note for the next hook of this kind: `objdump` prints the
8-bit displacement of an indexed operand in hexadecimal (`%a1@(59,%a0:l)`
is 0x59 = 89, the `+0x59` lock offset); the first build replayed it as
decimal 59 and the lock landed 30 bytes short (`plock_watch_remix.log`).
`plock_watch_remix_fixed.log` is the shipped build.

**Chromatic.** `0x4004fb94(track, key index 0..24, press)`: the index
(TRIG 13 = 12 = the root, TRIG 1 = −12, TRIG 16 = +3 at octave 0) becomes
the raw pitch `5·idx + 4` at `0x4004fc58`, the lock byte `0x46c7dfda +
t*32` the voice is trigged with (`0x40005030` / `0x46c80354`), the PTCH
lock a held or live-recorded trig receives (`0x40042158(track, 0, a2,
step)` at `0x4004fd1a`) and the box on the screen (`0x4004f5f8`).
`qz_chrom` snaps the index to the nearest in-scale class (`qz_pc25`, the
lower candidate checked first at each distance) before the `lea`. The
MIDI note the key sends out stays the key's own (`d3 + 71`, matched on
release).

**Persistence.** `qz_wr` pushes the byte, `pea qz_fmt(%pc)`
(`"#SEQUENCER_SCALE=%d\r\n"`) and the buffer, calls the writer's
sprintf / strlen / write exactly as the stock lines do, then replays.
`qz_ld_line` replays the `#` test; on a `#` line it compares the line
(d3) with `"#SEQUENCER_SCALE="`, parses the decimal, clamps 0..24 (else
OFF), stores unless `58(%sp)` (the parse-only flag) is set, and jumps to
the loop's next line; any other line continues into stock. `qz_ld_entry`
clears the byte when the load's second argument is non-zero (a storing
pass).

Register discipline: every stub saves what it uses beyond the registers
the displaced instructions write (`qz_knob`: d1; `qz_plock`: d1, and a2
pushed; `qz_chrom`: d0, d1; `qz_quant` saves all but d2); ColdFire
`movem` has no `-(sp)` form, so the saves are plain pushes. The unit
uses only ISA_A+ forms the stock code itself uses (`mvs/mvz`, `btst
Dn,Dy`, long compares, `mulu.l Dy,Dx`).

## The LEG gate (2 Oct 2026)

**What a CHROMATIC key pressed while another key of the track is held does
is the track's LEG setting** -- the AMP SETUP page's sixth box, a Part byte
saved with the project (`modules/synth/README.md`, "LEG"): OFF / MONO /
POLY on a synth track, **OFF / MONO on every other audio track** (3 Oct
2026) -- not GLIDE any more, on any track: GLIDE is the slide time only
(the synth's; a sample track's legato has no slide), and with LEG OFF the
synth engine does not glide at all (sequenced trigless trigs step). **The
gate reads LEG on every track**: a sample track with LEG MONO takes the
trigless path below (instant pitch, no retrigger, as GLIDE != 0 did in
2.6); `po_legmode` returns 1 on a non-synth track with a nonzero LEG byte,
0 with LEG OFF -- the engine's rule, this unit's bytes unchanged (2.7's
first build returned 0 there, its second read GLIDE). The two legato detours ask the
synth engine: `qz_legmode` reads the engine's pointer block (-24 of
`sy_render`, whose address the kind table's FLEX entry holds; `qz_clock`
nonzero says the engine is there) and jumps to `po_legmode(track)`, which
returns **0 stock** (a sample track with LEG OFF, or a synth track at
VOIC 1 with LEG OFF: the held note ends, the new one starts), **1 mono
legato** (VOIC 1, LEG MONO or POLY, or a sample track with LEG MONO:
the section below, unchanged), **2 paraphonic** (VOIC
2..4, LEG OFF or MONO: "Paraphonic keys" below, unchanged) or **3
paraphonic legato** (VOIC 2..4, LEG POLY: the key joins the held mask as a
paraphonic key does, the engine's `po_legkey` (-28) is told the key -- the
flag first, then the trigless trig it waits for -- `qz_legato` is set so
the live recorder writes a trigless trig, and the stock trigless path
follows; the engine slides the sounding chord to the key, "----" the
newest voice). `qz_leg1` (the note-off block): 0 -> stock, the held key's
HOLD lock written on a synth track; 1 -> the old key's MIDI note-off, no
voice note-off; 2 / 3 -> no note-off at all (a key's comes with its
release). `qz_leg2` (the trig): 0 -> the stock trig; 1 -> the trigless trig,
the new key the held key, the chain continued; 2 -> the mask, `qz_pkey`,
the stock trig; 3 -> the mask, `po_legkey`, `qz_legato`, the trigless trig;
a first key (no other key in the mask) takes the fresh trig whatever the
mode. `qz_leg0` (the release) and the recorder hooks are unchanged. The
unit grew from 3,224 to 3,268 bytes (`qz_legmode` 24 B, the two hooks
+20 B); the main cave's 168 B are untouched (the build's ledger line).
`qz_polytrack` is the release path's alone now; `qz_glide_of` serves the
SEQUENCER row's getter and the project writer.

## GLIDE and legato (24 Sep 2026)

(2 Oct 2026: the legato below is LEG MONO / POLY at VOIC 1 now; GLIDE no
longer switches it. The measurements stand.)

**The row.** `PROJECT > CONTROL > SEQUENCER`, [DOWN] ×4: `GLIDE OFF`; the
LEVEL knob steps it 1..127 (clamped), [YES] steps with wrap-around
(127 → OFF). The count poke is now `pea 3` → `pea 5` (the window scrolls
its three rows over five: CHAIN AFTER, SILENCE TRACKS, LFO AUTO CHANGE,
SCALE, GLIDE), the three grown tables carry two entries each
(`qz_lbl_glide` / `qz_get_glide` / `qz_set_glide`; `qz_set_any` is the
shared clamp-or-wrap tail, a0 = the byte, d1 = its maximum). The getter
prints the number with the firmware's `sprintf` (`0x40013a08`, `"%d"` at
`0x400b465d`) into a buffer in the unit.

**The byte.** `qz_glide` is the battery RAM byte **`GLIDE_AT = 0x100b14ed`**
(since 26 Sep 2026, "Where the setting lives" above; until then pinned at
`0x400d2cdc` in the OS image, `glide.s`, and lost at every power-on)
because two units read it: this one and the synth voice engine, which reads
an OS absolute. Each unit has ONE accessor (`qz_glide_of` here, `sy_glide`
in `synth.s`: d2 = track → d0 = 0..127), so the storage can move — the AMP
page's XVOL slot was considered and rejected for this build
(`modules/synth/README.md`, "AMP slot F").

**The project line.** `qz_wr` prints `#SEQUENCER_SCALE=%d` then
`#SYNTH_GLIDE=%d` (a shared `qz_wr_line`); `qz_ld_line` matches either key
(`qz_l_cmp`) and clamps 0..24 / 0..127 (else OFF); `qz_ld_entry` clears
both bytes for a storing load. A stock unit skips both lines.

**Legato.** The CHROMATIC key handler `0x4004fb94(track, key 0..24,
press)` keeps ONE held key per track at `0x460d171d + track` (key + 1, 0 =
none; the MIDI note out is key + 71, sent at `0x4004fd62` on the press and
matched on release at `0x4004fbe6`: a release of any other key returns at
once). Stock, a press while a key is held first ends that key at
`0x4004fbfe..0x4004fc40` — mailbox `0x46c80354[track] |= 0x40` (the frame
builder's note-off, `0x4000b4e4`: the voice state `0x80004858[...] := 4`,
i.e. the AMP release), the MIDI note-off, `held := 0` — then starts a new
voice at `0x4004fcb2` (`0x40005030`, cmd `0x1d`: bit 2 = start). With FUNC
held (`0x46c7dd26`) stock skips the note-off and posts a TRIGLESS trig at
`0x4004fc9c` instead (mailbox `|= 0x119`, no bit 2: the frame builder
applies the staged PTCH lock `0x46c7dfda + track*32` to the track's lock
block at `0x4000b75c` and starts no voice — `0x4000b5a8` starts one only
on bit 2). `qz_leg1` / `qz_leg2` take that path without FUNC when GLIDE is
on and a key is held: the MIDI note-off of the old key still goes out
(external gear sees stock's note sequence), the voice note-off does not,
and the new key becomes the held key (its release ends the note as stock;
the old key's release matches nothing). GLIDE OFF, FUNC held, a release, a
first key, or audio-track trigs off (`0x8000004c` bit 0): the stock bytes'
paths, unchanged. Legato is not limited to synth tracks: a sample track
changes pitch without a restart the way FUNC + key does. Live recording
records the legato press as stock records a key press (a sample trig with
the PTCH lock, `0x40042d1c`), not as a trigless trig.

### Measurements (24 Sep 2026, `out/mainos_cf.bin` = `REMIX=tim make cf`, the panel on 8593 with a copy of the OTLIVE card, `--sound on`; scripts and rows in the session scratchpad `glide_*.py`, `ga2/`, `ga3/`, `gs2/`)

**1. The rows** (`gm/`): boot (the card's project: CHAIN AFTER 256/16 —
a 17 saved by the 13 Sep build, clamped; SCALE MIXOLYD; GLIDE OFF), PROJECT
> CONTROL > SEQUENCER, [DOWN] ×4 → `GLIDE OFF` (list state offset 2,
cursor 4, count 5, visible 3); LEVEL +1 → 1, +63 → 64, +100 → 127
(clamped), −127 → OFF, −3 → OFF, +64 → 64, [YES] → 65, at 127 [YES] → OFF
(wrap); [UP] → SCALE, [UP] → LFO AUTO CHANGE. The byte (then at
`0x400d2cdc`, now `0x100b14ed`) followed every step. CHAIN AFTER on the same window: PAT.LEN → **DIRECT**
→ 2/16 by LEVEL +1, DIRECT + [YES] → 2/16, −20 → PAT.LEN; the byte
`0x8000004e` / mirror `0x100b14ae` read 0 → 1 → 2.

**2. Legato and glide, T2 = the FM synth** (`ga2/`, `ga3/`; T2's Part set
to STRT 0 / LEN 0 = a clean carrier, AMP HOLD INF / REL 40; CHROMATIC
mode; the card's SCALE = MIXOLYD snaps [TRIG 16] (+3) to +2 semitones —
the quantizer at work). Hold [TRIG 13] (C4), press [TRIG 16] 0.6 s later,
release 13 after 1.2 s, release 16 after 0.6 s more; zero-crossing pitch
and 10 ms RMS from the panel's main out:

| GLIDE | f(A) → f(B) | pitch after B's press: 63 % / 95 % of the way | A released, B held | B released |
|---|---|---|---|---|
| OFF | 261.6 → 293.7 Hz (+2.00 st) | a step (16 / 16 ms: the stock restart) | 293.7 Hz | −82 dB in 100 ms, silence |
| 1 (10 ms) | 261.6 → 293.7 | 41 / 61 ms | 293.7 | released |
| 64 (100 ms) | 261.6 → 293.6 | 126 / 326 ms | 293.7 | −71 dB in 100 ms, silence |
| 127 (1 s) | 261.6 → 291.9 (still moving at 3.2 s) | 947 / 2,387 ms | 292.5 | released |

(the wall-clock press marks carry ~20 ms of panel latency, so 126/326 ms
is τ ≈ 100 ms, 947/2,387 ms τ ≈ 1 s.) The held-key byte `0x460d171e`
read 0 after every run. A single [TRIG 16] with GLIDE 64 sounds at
293.6 Hz from its first 10 ms bin (no slide from the previous note). With
AMP ATK 64 (a 600 ms attack ramp, −50 → −19 dB on a fresh note) the
legato press showed no ramp: the AMP envelope is not retriggered.
What does move: a **2.3 dB level step 200 ms after the second key** (−17.4
→ −19.7 → −16.6 dB across the GLIDE 64 transition, the same at GLIDE 1
once the pitch had settled) — and exactly the same step follows every
fresh note start and every stock FUNC + key trigless trig on this track
(`ga3/`, `ga4/FUNC_key_stock_trigless`: −19..−20 dB for 200 ms, then
−17). It is not the AMP envelope (above) and not the pitch (GLIDE 1); it
is the DSP's own response to a trig word — T2's FX1 is a FILTER with a
0.5 s envelope (DEPTH 111, DEC 49), the likely consumer, but DEPTH 0 left
the resonant filter (Q 94) ringing through the sweep and settled nothing.
Posting the trig word without mailbox bit 3 (`0x111`; frame flag 0x20 /
event-byte bit 3) changed neither the step nor the glide (t63 113 ms), so
the legato keeps stock's own trigless word (`0x4004fc9c`, `0x119`): the
legato behaves exactly as FUNC + key does, minus the FUNC.

**3. Sequenced** (`gs2/`, GLIDE 64): the pattern cleared, T2 trig on step 1
(PTCH −12 from the Part: 130.8 Hz) and a trigless trig on step 9 with a
PTCH lock of +12 (`0x7c`): PLAY → 130.8 Hz, then from step 9 (1.0 s at
120 BPM) a two-octave glide to 523.0 Hz, 63 % / 95 % at 120 / 320 ms;
GLIDE OFF: the same pattern jumps in one 10 ms bin (t63 = t95 = 40 ms, the
step-time estimate). (The level rises 14 dB with the pitch: T2's FX1 is
a FILTER with BASE 0 / WIDTH 72, its response, not the voice.)

**4. Persistence** (`pt/`): PROJECT > SYNC TO CARD with CHAIN AFTER =
DIRECT, SCALE MIXOLYD, GLIDE 64 → the card's `OTLIVE/PROJECT/project.work`
reads `PATTERN_CHANGE_CHAIN_BEHAVIOR=1` / `#SEQUENCER_SCALE=5` /
`#SYNTH_GLIDE=64` (read on the Mac through `/card/eject`); `/card/insert`
(the rig's reboot: a fresh RAM and a project load, not the hardware's
power cycle -- see 26 Sep 2026 above) reloads `0x8000004e = 01`,
`0x400d2cdc = 40`.
Then the migration cases, editing the mounted card's `project.work` and
`/card/insert`-ing (`pt3/`, `bc/`): `PATTERN_CHANGE_CHAIN_BEHAVIOR=17` +
`#SYNTH_GLIDE=100` (a project saved by the 13 Sep DIRECT JUMP build) →
`0x8000004e = 0x10` (the window shows **256/16**), GLIDE **100**;
`=1` + `#SYNTH_GLIDE=33` → `0x01` (**DIRECT**), GLIDE **33**; `=5` +
`#SYNTH_GLIDE=0` → `0x05` (**6/16**, a stock value), GLIDE **OFF**. The
mirror `0x100b14ae` followed each time. A storing load without the GLIDE
line starts from OFF (`qz_ld_entry`, as SCALE's).

## Legato and the live recorder (24 Sep 2026, OCTATRICK6 report)

**Reported on hardware:** GLIDE on, CHROMATIC, live recording, a second key
pressed while the first is held slides live but playback restarts the note.
**Cause:** the same key press is handed to the live recorder a few
instructions after the trig -- `0x4004fcd8..0x4004fd24`, run while
`0x460d172a` is set (live recording, or a trig held): with FUNC held
(`0x46c7dd26`) stock calls `0x4004271c(track, 0x46c7e956)`, which places a
**trigless** trig on the current step, otherwise `0x40042d1c(...)`, a
**sample** trig; then `0x40042158(track, 0, raw pitch, step, ...)` writes
the PTCH lock on the step returned. `qz_leg2` played the legato press
trigless but the recorder still took the no-FUNC branch. **The fix:** a
third detour on the same press, `qz_leg3` at `0x4004fce0` (`tstl
0x46c7dd26; beqs 0x4004fcf8`, 8 bytes): `qz_leg2` sets `qz_legato` when
and only when it takes the GLIDE legato path (cleared at every press;
FUNC held and the paraphonic VOIC 2..4 path leave it clear), and `qz_leg3`
sends a legato press down the trigless branch -- exactly what FUNC + key
records. GLIDE off, FUNC held, VOIC 2..4 and non-synth tracks: stock.

Measured (`poly/liverec.py`, T2 = SYNTH, VOIC 1, INDX 0, SCALE OFF, 120 BPM,
the pattern cleared before each; T2's track record `0x400e21e0 + 0x91a`:
byte 7 = the sample-trig mask of steps 1-8, byte 15 the trigless mask of
steps 1-8 (byte 14 steps 9-16), locks at `+0x59 + step*32`):

| recording | record bytes changed | playback (pitch per 25 ms) |
|---|---|---|
| key 13 alone | `[7] = 0x08` (sample trig, step 4), lock PTCH 64 | 261.4 Hz steady |
| FUNC + key 6 while 13 held (stock trigless) | `[7] = 0x08`, `[14] = 0x02` (trigless, step 10), lock 29 on step 10 | 261.4 then 252.6 218.4 199.9 188.9 183.0 180.0 178.2 177.0 -> 174.6: a glide, no burst |
| key 6 while 13 held, GLIDE 64 (the fix) | `[7] = 0x08`, `[15] = 0x80` (trigless, step 8), lock 29 on step 8 | 261.4 then 252.1 218.2 199.7 188.8 183.0 180.0 178.1 177.0 176.3 175.8 175.4: the same glide, no burst, no restart |
| the same with GLIDE off | `[7] = 0x88` (sample trigs, steps 4 and 8), lock 29 on step 8 | 261.3 then 175.2 at once: a retrigger, as stock |

(The stock and fixed steps differ -- 10 vs 8 -- only because the FUNC press
in the driver adds 0.15 s.)

## The played note length (25 Sep 2026, OCTATRICK7 report)

**Reported on hardware:** the recorded slide plays back, but the notes drone
for the whole AMP HOLD -- audio tracks have no note length and live recording
never writes the key release. **Now, on a synth track (`qz_is_synth`) during
live recording, a key's played length is written as a HOLD lock on the step
its press recorded.** The HOLD byte's unit is sequencer steps, through the
firmware's own 128-entry table of strings (`0x400d18d0`: 0.0078 = 1/128
step, 1.0000 at raw 14, 4.0000 at 46, 128.0 at 126, INF = 127; measured:
HOLD 40 = "3.2500" runs 0.40 s at 120 BPM); `qz_hold128` holds the same
values in 1/128 steps and the lock is the smallest entry that is not shorter
than what was played (a tap is never silent: 60 ms recorded as 0.5000).

The path: `0x4004fd06` (`addql #8,%sp; tstl %d0; blts`, right after the
recorder returned the step in d0) -> `qz_leg4` notes the press in one of the
track's four slots (`qz_press`: key, step, in use, the engine's tick count).
Time comes from the synth engine's clock (`po_clock`, published at
`qz_clock` = `KEYS_AT + 40`: a monotonic count of the sequencer's (step,
tick) changes -- the step word `0x800065b2` wraps at the pattern end, the
count does not -- and ticks a step, the largest tick byte `0x800065b6` seen
+ 1; 6 at 1x), ticked once a frame from the frame builder's LFO pass, so it
runs from boot. `qz_holdrel` turns elapsed ticks into 1/128 steps
(`* 128 / ticks a step`), looks the raw value up and calls the stock lock
writer `0x40042158(track, 13, raw, step, 0x46c7e956)` (flat slot 13 = AMP
HOLD; the writer itself refuses once live recording has stopped). Who calls
it: a key's release (`qz_leg0`, every key on a paraphonic track; on a VOIC 1
track only the HELD key's release, which ends the note); a press that ends
the held note with the stock note-off (`qz_leg1`, GLIDE off). **A legato or
FUNC + key press does not end the held note**: the DSP's HOLD runs from the
voice START and a trigless step's HOLD lock re-lengthens it from there
(measured: a trigless HOLD of 5.75 ended the note 5.75 steps after the first
press, not after the trigless step), so the new step inherits the chain's
start (`qz_chain_of` -> `qz_chain` -> `qz_leg4`) and the held key's release
writes the chain's whole length on every step of it (`qz_holdall`).
Non-synth tracks, programmed trigs and playing without recording: untouched.

Measured (`poly/holdrec.py`, T2 = SYNTH, VOIC 1, GLIDE 64, INDX 0, AMP ATK 0
HOLD INF REL 20, 120 BPM = 8 steps a second, fresh boot; level per 50 ms
from the note's onset, "ends" = the bin that drops below -40 dBFS):

| recording | HOLD locks | live take ends | playback ends |
|---|---|---|---|
| key 13 held 0.55 s, legato key 6 to 1.2 s (GLIDE 64) | step 4 sample 9.50, step 8 trigless 9.50 | bin 25 (1.25 s) | bin 25, the pitch 260 -> 240 220 200 180 continuous, no restart |
| the same with GLIDE off | step 4 sample 4.0000, step 8 sample 5.75 | bin 25 | bin 25 (a restart at bin 11, as stock) |
| the same with FUNC + key 6 (stock trigless) | 5.25 on both (the HELD key 13's release ends the note, stock's rule) | -- | bin 14 |
| a 60 ms tap | step 4 sample 0.5000 | bin 2 | bin 2-3 |
| HOLD knob 40 = 3.2500, a programmed trig, no recording | none | -- | bin 8 (0.40 s): the stock DSP envelope, unchanged |
| VOIC 3, CHRD MAJ, a chord held 0.5 s | step 4 sample 4.25 (+ the CHRD lock 36) | bin 11 (0.55 s) | bin 12 (0.60 s), lines 261.6 / 329.6 / 391.9 |

Sizes: `quantizer.s` 2,916 B (`REMIX=tim make cf`, at `0x400d6d00`), `keys.s`
44 B, **680 B of the third run left**.

**Fingered chords (26 Sep 2026):** every CHROMATIC key of a synth track
that reaches the recorder is handed to the synth engine's `po_keyrec`
(`modules/synth/poly.s`, "Recording fingered chords"), reached through the
pointer block the engine publishes before `sy_render` (the kind table's
FLEX entry `0x400d6438`: -12 `po_keyrec`, -8 `po_hold128`, -4 the page
clone), once `qz_clock` says the engine has run. Twice: `qz_leg3`, at the
recorder's entry, asks (d0 = -1) whether the key joins the chord being
recorded -- then the chord's step has its PTCH / CHRD / VOIC locks and the
key skips the stock recorder (`jmp 0x4004fd3e`: no trig, no PTCH or HOLD
lock of its own); else the key is recorded as stock and a fourth recorder
detour, `qz_leg5` at `0x4004fd20` (`lea %sp@(20),%sp; bras 0x4004fd3e`,
right after the recorder's PTCH lock write), hands track, key, the step
`qz_leg4` stashed in `qz_step` and the raw pitch over to start the next
chord record. The recognition and the lock writes live in the engine
(DRAM); this unit only passes the key on. `qz_hold128`, the 256-byte copy
of the HOLD table, is gone: `qz_holdrel` reads the engine's `po_hold128`
through the same block (the `qz_clock` check above it guarantees the engine
is there). The unit was 3,252 B then (3,408 B before).

**The hand-over rule (26 Sep 2026, the second pass):** `qz_holdrel` --
every CHROMATIC key release on a paraphonic synth track goes through it
(`qz_g0_para`), and the VOIC 1 paths too -- calls the engine's `po_keyrel`
(the block's -20) once it has the track's four HOLD slots in a0, with d0 =
the key: twelve bytes of ROM (`movea.l KIND_FLEX,%a1; movea.l -20(%a1),%a1;
jsr (%a1)`, a1 pushed around it since the tick pointer lives there). A
key that joined a chord less than 50 ms before another key of the chord
went up was a legato hand-over, not a chord: the engine undoes the join,
gives the key its own trig at its own time and creates its HOLD slot
among the four (key, step, in use, its press ticks), so this unit's own
release path writes the note's length as for any key. To pay for the
hook the two copies of the MIDI note-off (the legato and the paraphonic
release) became `qz_noteoff`, and `qz_oct` moved into the pinned `keys.s`
(45 B now; the run ends at `0x400d2ce0`), where the engine can read it:
the unit is **3,224 B**, the main cave unchanged at 168 B left.

## Paraphonic keys (24 Sep 2026)

The synth machine's LFO page has a VOIC slot (`modules/synth/README.md`
"Phase 5": 1..4, the Part's LFO page byte `+ track*24 + 2`, SPD3's storage);
on a FLEX track whose assigned FLEX slot's sample is named SYNTH*
(`qz_is_synth`, the synth page's own test, run on the UI thread at each key
event) with VOIC 2..4 (`qz_polytrack`), the CHROMATIC handler `0x4004fb94`
keeps every held key instead of one:

| site | stock | with VOIC 2..4 on a synth track |
|---|---|---|
| `0x4004fbde` (new, `qz_leg0`, 6 bytes `mvzb %a0@(0,%d2:l),%d1; movel %a2,%d0`) -- the release path | a release of a key that is not HELD returns at once; the HELD key's release runs the note-off block | the key's bit leaves `qz_pmask[t]` (the engine releases that key's voices); with keys still held its MIDI note-off goes out and nothing else happens; the LAST key makes itself HELD first, so stock's block runs -- the voice note-off (mailbox `|= 0x40`, the AMP release), the MIDI note-off, HELD := 0 |
| `0x4004fbfe` (`qz_leg1`) -- a press while a key is held | ends the held key first (voice note-off, MIDI note-off, HELD := 0), then trigs | ends nothing: straight to the trig (checked before the GLIDE legato test, so legato is off on such a track) |
| `0x4004fc94` (`qz_leg2`) -- the trig | FUNC held: trigless; else the stock trig, HELD := the key | FUNC held: trigless as stock; else the key's bit joins `qz_pmask[t]`, `qz_pkey[t]` := the key's index + 1 for the engine (read and cleared at the voice start; 0 there = a sequencer trig), the stock trig starts a fresh voice, HELD := the key |

`qz_pkey[8]` (bytes) and `qz_pmask[8]` (longs, bit = key index 0..24) are
`keys.s`, pinned at `KEYS_AT = 0x400d2cb0` -- 40 bytes of the second zero
run between the synth page cave (ends `0x400d2c6c`) and the GLIDE byte.
**Chords obey SCALE**: `qz_scale_mask` (d0 := the current scale's
pitch-class mask from `qz_masks`, 0 = OFF) is the accessor the synth's
engine calls to snap every chord note the way `qz_chrom` snaps a key
(nearest degree, the lower candidate first); it reaches it through
`scale.s`, six bytes pinned at `SCALE_AT = 0x400d2ca8` (`jmp qz_scale_mask`,
linked after this unit so the symbol resolves; the engine checks the `jmp`
is there, so a remix without this module snaps nothing) -- the mask table
has one copy. VOIC 1 (a stock byte reads 1), audio-track trigs off, every
other track: stock, byte for byte -- the mono synth with GLIDE legato.
Measured (the synth README's numbers): at VOIC 2, keys 13 + 9 held together
play C4 and G#3; at VOIC 4 keys 13, 9, 6 pressed in turn and released in
turn play `[C4] [C4 G#3] [C4 G#3 F3] [G#3 F3] [F3]` then silence; a MAJ
chord under DORIAN or PHRYGN comes out 1 : 1.189 : 1.498 (minor), under
SCALE OFF 1 : 1.26 : 1.498. Unit size: `quantizer.s` 1,888 B (`REMIX=tim
make cf`, at `0x400d6d00`), `scale.s` 6 B, `keys.s` 40 B, `glide.s` 4 B
(gone since 26 Sep 2026; `quantizer.s` 3,000 B in `octatrick-usb` BUILD 10).

## Measurements (all `out/_agents/quantizer/`)

Image: `REMIX=quantizer make bus` → `out/mainos_bus.bin`, 1,112,560
bytes, **1,250 bytes changed** vs `out/raw/section_3_MAIN_OS.bin`
(`build.log`; the unit at `0x400d6b80`, the tables at `0x400d7100..`).

⚠️ **For a unit, build it with `make cf`, not `make bus`** (15 Sep 2026).
`make bus` rebuilds the FX2 chooser from the remix's rows and this remix
has none, so its image offers NONE as the only EFFECT 2 effect: the
fourteen stock effects keep their code and dispatch (the report's `KEPT
STOCK`; both DSP payloads are byte-identical to stock) but cannot be
selected. Eleven of the 1,250 bytes are exactly that — the three `lea`
sites that find the chooser list (`0x400d6090` → a one-row list at
`0x400d6b00`), the viewport literal (7 → 1) and the row itself.
`REMIX=quantizer make cf` → `out/mainos_cf.bin`, **1,239 bytes changed**:
the same unit, tables, detours and poke, with the chooser, the FX2 id and
cursor tables and both DSP payloads byte-identical to stock (the build
compares those spans against the stock image before writing; `make
image-cf` packs it). The `tim` image (this module + DIRECT JUMP, 1,657
bytes) booted under the panel shows the stock chooser — NONE, FILTER, EQ,
DJ EQ, PHASER, FLANGER, CHORUS, SPATIALIZER, COMB, COMPRESSOR, LOFI, DELAY,
PLATE, SPRING, DARK — and the SCALE row still turns OFF → PHRYGN
(`out/_agents/cfbuild/`). Panel: `tools/panel/panel_server.py --image <remix> --project
out/_projects/otlive/OTLIVE/PROJECT --set OTLIVE --name PROJECT --sound
off --card out/_agents/quantizer/card.img` on port 8596, stock on 8597,
driven through `/key`, `/tap`, `/knob`, `/peek`, `/screen.txt`
(`shots/*_x4.png` are the text screens at 4×). PTCH slot of T1 (STATIC,
part 0) `0x40170f8a`, of T5 (FLEX) `0x40171008`; T5 step 1's PTCH lock
`0x400e46a1`; the chromatic staging byte `0x46c7dfda + t*32` (with
`--sound off` no frame consumes it, so it keeps the pitch the key
produced).

**1. The menu** (`remix_menu.log`, `a*`, `m*`, `s1_scale_3`). Fresh boot:
`qz_scale` = 0. PROJECT > CONTROL > SEQUENCER opens with CHAIN AFTER /
SILENCE TRACKS / LFO AUTO CHANGE as stock (`a3_sequencer_window_x4.png`);
[DOWN] ×3: the list state reads offset 1, cursor 3, visible 3, count 4 and
the window shows SILENCE TRACKS / LFO AUTO CHANGE / **SCALE OFF**
(`a6_down3_scale_row_x4.png`); LEVEL +1 ×3 → MAJOR, DORIAN, PHRYGN (byte
1, 2, 3; `a7_*`); −4 → OFF and stays; +30 → 24 (LYD.DOM, `a9`); one +3
report from OFF → 3.

**2. PTCH, PHRYGIAN, T1** (`remix_knob_phrygian.log`, `k*`). From raw 64
(+0.0), +1 per report ×8: `69 79 89 99 104 114 124 124` = **+1, +3, +5,
+7, +8, +10, +12, +12** (the screen reads `+1.0` after the first,
`k1_up1_raw69_x4.png`); −1 ×15 from 124: `114 104 99 89 79 69 64 54 44 39
29 19 9 4 4` = +10 … 0, **−2, −4, −5, −7, −9, −11, −12, −12**; one report
of +3 from 4 → 29 (−7, three degrees), −3 → 4. A value set with the scale
OFF (`remix_locks_chrom.log`): raw 84 (+4.0, 24 stock detents) then
PHRYGIAN: +1 → 89 (+5), −1 → 79 (+3), −1 → 69 (+1); a fraction, raw 86
(+4.4): −1 → 79 (+3), +1 → 89 (+5). RATE (slot D, `0x40170f8d`, default
127): −1 −1 −1 +1 −5 +5 → `126 125 124 125 120 125`, one unit per detent,
untouched — the manual's RATE is a playback speed (0 = stopped, negative
= backwards; the SETUP page's RATE mode PTCH/TSTR only chooses whether the
speed change also changes pitch), not a semitone quantity.

**3. A held trig** (`final_pass.log`, `f2_trig1_held_lock`;
`plock_watch_remix_fixed.log` is the same under a bare `ot_emu`). T5,
GRID RECORDING, [TRIG 1] held, PHRYGIAN, from no lock (0xff) and Part 64:
+1 +1 +1 → lock `69 79 89` (+1, +3, +5); −1 ×4 → `79 69 64 54` (+3, +1,
0, −2); +5 → 99 (+7, five degrees); −20 → 4 (−12, clamped); the Part byte
stays 64 throughout. Knob push removes the lock (0xff); −1 with no lock
→ 54 (−2, from the Part's 0). With OFF the same run writes `41 41 42 42
41 45 33` — the stock editor's own sequence (`plock_watch_stock.log`).

**4. CHROMATIC** (`remix_locks_chrom.log`, `c*`; stock in
`stock_knob_chrom.log`). Trig mode via [FUNC] held + [DOWN] ×2
(`s8_list_chromatic`). Stock / OFF: TRIG 13 14 15 16 12 11 10 9 8 7 1 →
raw `64 69 74 79 59 54 49 44 39 34 4` = 0 +1 +2 +3 −1 −2 −3 −4 −5 −6 −12.
PHRYGIAN: `64 69 69 79 54 54 44 44 39 29 4` = 0, +1, **+1** (from +2:
+1 and +3 tie, the lower wins), +3, **−2** (from −1: −2 and 0 tie),
−2, **−4** (from −3), −4, −5, **−7** (from −6), −12. Live recording
(REC+PLAY, TRIG 15, STOP): with PHRYGIAN the T1 track record changes at
`+0x139`: `ff → 45` (the recorded PTCH lock = 69 = +1, the snapped
value) and the trig bit; with OFF `+0x119`: `ff → 4a` (74 = +2, stock).

**5. OFF vs stock, boot A/B** (`ab/`). `tools/emu/ot_emu/oracle/drive.py
--emu out/emu/ot_emu --image <stock | remix>` (the `inter` battery:
boot, YES, MIXER, NO, T1 ×2, DOWN, RIGHT, NO, NO, PLAY 20×100 ms, STOP
5×100 ms). `ready.txt`, `stamps.txt`, `peeks.txt`, `stderr.txt` are
byte-identical; `tx.bin` (the UART stream) is **18,297 vs 18,289 bytes**:
with every LED-level pair (`0x3n <id>`) removed the two streams are
identical (16,873 bytes — every LCD block, every LED row), and the
difference is 712 vs 708 pairs, one fewer `0x3d`/`0x3f` toggle each of
LEDs `0x24` and `0x25` — a breathing pair whose phase against the
battery's fixed windows shifted, because the project load now runs the
two loader detours on every line (`boot.log`: 65,402 vs 65,410 vectors
acknowledged over the boot; a stock-vs-stock re-run, `ab/stock2`, is
byte-identical, so the shift is real, not noise). No screen and no state
peek differs. The battery never opens the SEQUENCER menu.

**6. Persistence** (`persist_pass.log`, `s*`, `r*`). PHRYGN set, PROJECT
> SAVE (the PROJECT menu remembers its column: [LEFT] first), YES, YES
(`s5_save_confirm`): the persistent card's `project.work` and
`project.strd` both read `PATTERN_CHANGE_CHAIN_BEHAVIOR=0` /
`#SEQUENCER_SCALE=3` / `PATTERN_CHANGE_AUTO_SILENCE_TRACKS=0` (the
original file's cluster survives as stale data without the line). The
server was killed and the card cold-booted with `--card` alone: `qz_scale`
= 3, the SEQUENCER window shows **SCALE PHRYGN**
(`r1_sequencer_after_reboot_x4.png`), and PTCH +1 ×3 from the saved 65
→ `69 79 89`.

**7. Gates** (`verify_steps.log`, `REMIX=quantizer`): `make bus`,
`cycle_count`, `verify_slots`, `label_fmt`, `verify_octakit`,
`verify_midiscenes` (SKIP: submodule), `verify_dram_boot`,
`verify_labels`, `verify_menushortcut`, `verify_cfprobe`,
`verify_busscreen`, `verify_ccpage2`, `verify_hidden`, `verify_grains`,
`verify_menu`, `verify_burn` (its usual SKIP), `verify_twocore`,
`verify_onebus` all exit 0; `verify_replaces` fails only on the eight
MIDI SCENES remixes whose submodule is not checked out (pre-existing,
`make check` stops there); `verify_modenames` reports "no module declares
mode_views" (the Makefile's SKIP).

## ROOT, and the move into DRAM (28 Sep 2026, Octatrick 2.9)

**ROOT.** PROJECT > CONTROL > SEQUENCER has a fifth row, **ROOT**, right
under SCALE (GLIDE is the sixth): `C C# D D# E F F# G G# A A# B`, one per
project, C by default. The scale is built on the root: every snap the
quantizer does -- the PTCH knob and the p-lock editor (`qz_quant`), a
CHROMATIC key on a sample track (`qz_chrom`) or a synth track
(`qz_c_synth`) -- and the chord-note snap the synth engine does through
`SCALE_AT` (`poly.s po_snap`) test a note's pitch class against ONE mask,
`core.s qz_scale_mask`: the scale's 12-bit pitch-class mask (on C, as the
table always was) rotated left by ROOT within 12 bits, so bit k is set when
pitch class k (C = 0, the class of raw 64 on a synth track and of 0 st on a
sample track) is in the scale on that root. "MINOR, ROOT A" is the A minor
pitch classes; ROOT C is the 2.8 mask, bit for bit. With a scale on the
**CHROMATIC keyboard is transposed so that key 1 sounds the root**: on a
synth track n = key - 12 + ROOT + 12 * octave (so [TRIG 13] at octave 0 is
the root an octave above key 1, and the white-key positions of the 16-key
picture -- keys 1 3 5 6 8 10 12 13 -- sound the major-scale offsets on the
root, snapped into the scale), on a sample track the key index is key + ROOT
within the stock -12..+12 st range -- the two keyboard positions are laid
out so that the default one never clamps, **"The sample track's two
positions"** below. The number beside the keyboard reads the
root's name too (`A 0`, `A -1`): `qz_octnum` writes `"<name> %d"` into a
buffer of the unit and hands the stock formatter that format instead of its
`"%d"` (the call at `0x400449e6` takes nine arguments -- context, font, x
0x44, y 9, 1, 0, the buffer `0x400b527d`, the format, the value -- and
`0x400449ec` pops nine; the detour continues at `0x400449c6`, past stock's
`pea "%d"`, so the frame is the stock's). **SCALE = OFF ignores ROOT**:
every path leaves at its OFF test before ROOT is read, so the keyboard, the
knob, the locks and the readout are 2.8's. **ROOT = C is 2.8 in every
pitch**: a rotation by 0 is the identity and the transposition adds 0, so
the keys, the PTCH knob and the locks are byte for byte 2.8's (measured
against the 2.8 bus, below); what differs is the keyboard's number with a
scale on, which reads `C 0` where 2.8 read `0`. The MIDI note a
CHROMATIC key sends out stays the key's own (72 + key), as in 2.8, where
it did not follow the -4..+4 octave either: the note-on and the note-off
are matched by key in the stock handler (`0x4004fc24`, the release path,
and this unit's `qz_noteoff`), and transposing them would mean four more
sites -- open item.

The byte: **`0x100b14ee`**, the next battery-RAM byte after SCALE
(`0x100b14ec`) and GLIDE (`0x100b14ed`). Proof that stock does not use it:
a scan of the whole 1.40C main OS for absolute operands finds no reference
to any of `0x100b14e2..0x100b14ef` (the last long stock touches is
`0x100b14de`, eight sites; the next is `0x100b14f0`, the project record,
121 sites); the boot's two memcpy's cover `0x100b1480 + 0x4c` (to
`0x100b14cc`) and `0x100b14cc + 0x16` (to `0x100b14e2`; `0x4001fb3c`,
`0x4001fb9e`), and the project defaults clear through the long at
`0x100b14de` (`0x40025ad4`). Clamped 0..11 by `qz_boot` where stock's
sanitiser clamps CHAIN AFTER (`0x40010212`), set to C by `qz_defaults`
(`0x40025ac2`), saved as `#SEQUENCER_ROOT=n` between the SCALE and GLIDE
lines by `qz_wr`, read back by `qz_ld_line` (0..11, else C), cleared to C
by `qz_ld_entry` at a storing load. The SEQUENCER tables grow 3 + 3
(labels `qz_lbl_scale / qz_lbl_root / qz_lbl_glide`, getters, setters), the
list count poke is 3 -> 6, three rows visible, the window scrolls
(`qz_draw`). The ROOT row's getter returns the name; the setter is
`qz_set_any` with maximum 11 (the LEVEL knob clamps, [YES] wraps).

**The move into DRAM.** `quantizer.s` is `Linked(dram=True)` now: linked
into octabam's platform runtime with the synth's `poly.s`, packed, appended
after the OS and depacked by the loader at boot. What stays in the OS
image is `core.s` (192 B: `qz_boot`, `qz_defaults`, `qz_scale_mask`, the
24 masks) and the two pinned stubs (`keys.s`, `scale.s`); the ROM
footprint of the module went from 3,268 + 45 + 6 B to 192 + 45 + 6 B, and
the `octatrick-tuner` build's cave went from 168 B left to 3,236 B left.
The split's rule: a ROM unit cannot name a DRAM symbol at link time and a
DRAM unit cannot name a ROM one, so the DRAM unit reaches the pinned
mailbox and the scale accessor as fixed addresses (`KEYS_AT` `0x400d2cb0`,
`SCALE_AT` `0x400d2ca8` -- the same contracts `poly.s` uses; unchanged), and
the manifest's detours and TableGrow entries name the DRAM unit's symbols
through the platform's symbol table (as midi-scenes does). `scale.s`'s
`jmp qz_scale_mask` resolves into `core.s`, linked before it. The boot
order, measured under the port with `--watch-pc` (instruction counts, a
cold boot of the `octatrick-tuner` BUILD 19 bus with the card mounted):
the loader at `0x4010fdf0` (the redirect `0x4000050c`) at 4,270,945; the
stock aPLib depack `0x400e0aca` at 4,505,240 (the runtime is in DRAM from
here); the `.data` copy `0x4000f938` at 6,526,781; main `0x40000db0` at
12,342,579; the project defaults `0x40025848` at 20,439,288 and the
`qz_defaults` site `0x40025ac2` at 20,965,399; then, for the posted
project load, `0x40025848` / `0x40025ac2` again at 56.2 M / 56.8 M and the
loader `0x4009000c` at 57,274,321. A warm boot (the battery dump preloaded,
no load posted) runs `0x40025770` -> the sanitiser `0x4000fec8` -> the
`qz_boot` site `0x40010212` from main as well (the "warm boot" measurement
below). So no site of the DRAM unit can run before the runtime is there;
the core is in ROM for the link-time reason above and so that the three
bytes are sane whether or not a runtime was depacked -- the boot detours
never depend on the append. The DRAM unit assembles for the chip
(`-mcpu=54455`, ISA C: the same bytes for this ISA-A/B source); its RAM
state (`qz_press`, `qz_gbuf`, `qz_ofmt` ...) lives in the runtime's window.

### The sample track's two positions (the second pass)

**What stock does.** A sample track's CHROMATIC keyboard lays the 16 [TRIG]
keys over ONE index, 0..24 (`0x4004fb94`: raw = 5 * index + 4, so index 12
= raw 64 = the sample's own pitch and the range is -12..+12 st, stock's
PTCH ceiling), in two **positions** of one word, `0x460d16fc` (`OCT_WORD`),
whose only writer is `eorl #1` at `0x4004591a` -- FUNC + LEFT or RIGHT
toggles it -- and which is 0 at boot (BSS; no reset anywhere). The
handler's caller `0x40050254` makes the index key - 1 + 12 * word: in
position 0 keys 1..16 are index 0..15 = -12..+3 st, [TRIG 13] the sample's
pitch, the 16-key picture; in position 1 keys 1..13 are index 12..24 = 0..
+12 st, [TRIG 1] the sample's pitch, and keys 14..16 (index 25..27) fail
the handler's range check at `0x4004fba8` and do nothing -- the drawer
`0x40044968` shows the 13-key picture and prints the word (`0` / `1`)
beside it. The first pass of 2.9 added ROOT to the index and clamped at 24:
in position 0 that already is the complete octave r-12 .. r on keys 1..13,
but in position 1 (r .. r+12) the top r keys all hit +12 st -- with ROOT A,
nine of the thirteen keys sounded alike.

**The rule.** Within -12..+12 st only ONE complete root-to-root octave
exists for r > 0: r-12 .. r. So (1) the default position (word 0, the one
the unit boots in) plays it: key 1 = the root below the sample's pitch,
key 13 = the root above, keys 14..16 = r+1 .. r+3 (they pass +12 only for
ROOT A# / B: key 16 / keys 15, 16). (2) The other position is necessarily
partial, and it is laid out on the side that clamps FEWER keys: for **ROOT
C .. F#** (r <= 6) it stays r .. r+12 with the top r keys clamped at +12
st; for **ROOT G .. B** (r > 6) the whole keyboard drops two octaves from
there, r-24 .. r-12 -- the octave BELOW the default position -- and only
the bottom 12 - r keys clamp at -12 st ("when the root is high, the whole
keyboard drops an octave"). (3) The number reads the position as an
octave relative to the default: `A 0`, `A -1` (r > 6), `D 1` (r <= 6). (4)
ROOT C is stock's two positions exactly, SCALE OFF is stock, synth tracks
(`qz_c_synth`, their own -4..+4 octave) and the PTCH knob / locks are
untouched. In `qz_chrom` this is 24 bytes: after `index + ROOT`, `ROOT > 6
and OCT_WORD != 0` subtracts 24 and floors at 0 before the existing
ceiling at 24; `qz_octnum` prints -1 for the sample track's word 1 when
ROOT > 6 with a scale on (28 bytes). The clamp lands on index 0 or 24 and
the snap then runs as always, so a clamped key sounds the nearest degree
of the scale at that end (ROOT A / MAJOR: index 0 = C is not in A major,
the three clamped keys and keys 4, 5 all sound C#3).

The clamp per root (the other position; keys named on the 13-key picture):

| ROOT | default position, keys 1..16 (st) | other position, keys 1..13 (st) | keys clamped |
|---|---|---|---|
| C | -12 .. +3 | 0 .. +12 | none |
| C# | -11 .. +4 | +1 .. +12, +12 | 13 (top) |
| D | -10 .. +5 | +2 .. +12, +12 x2 | 12, 13 (top) |
| D# | -9 .. +6 | +3 .. +12, +12 x3 | 11 .. 13 (top) |
| E | -8 .. +7 | +4 .. +12, +12 x4 | 10 .. 13 (top) |
| F | -7 .. +8 | +5 .. +12, +12 x5 | 9 .. 13 (top) |
| F# | -6 .. +9 | +6 .. +12, +12 x6 | 8 .. 13 (top) |
| G | -5 .. +10 | -12 x5, -12 .. -5 | 1 .. 5 (bottom) |
| G# | -4 .. +11 | -12 x4, -12 .. -4 | 1 .. 4 (bottom) |
| A | -3 .. +12 | -12 x3, -12 .. -3 | 1 .. 3 (bottom) |
| A# | -2 .. +12, +12 (key 16) | -12 x2, -12 .. -2 | 1, 2 (bottom); key 16 of the default |
| B | -1 .. +12, +12 x2 (keys 15, 16) | -12, -12 .. -1 | 1 (bottom); keys 15, 16 of the default |

(each range is before the scale snap; "+12 x2" = the clamped keys, all at
the ceiling)

### Measured (the second pass: the octatrick-tuner BUILD 20 bus = OCTATRK2.9 on ot_emu `--dsp-rt` through the poke panel on 8950, a copy of the OTLIVE card whose four loop files are same-length sines -- `third-0.wav` = 95 whole cycles in its 9,551 frames = 438.645 Hz, the slots' TSMODE 0 / LOOPMODE 1; T1 = FLEX slot 3 = that sine (assigned through the machine window: OTLIVE's T1 is STATIC slot 5, the Amen break; a STATIC slot streaming the 2,679-frame `first-0.wav` came out as a 689 Hz buzz = 44100 / 64, a stuck 64-frame chunk under the port, so FLEX), PLAYBACK PTCH 0 / STRT 0 / LEN max / RATE +63, AMP HOLD INF REL 20; T2 = FM SYNTH slot 5 as before; the ef2944b bus (the first pass, byte-identical to the BUILD 19 bus) on 8951 with the same card as the baseline; pitches = the strongest spectral peak over 0.3-0.8 s of a 0.9 s key hold, in semitones from the sample's own pitch (SCALE OFF, position 0, key 13: 438.7 Hz, named C4 below), every value within 0.5 cent of the semitone; the session's `root29b/m30.py`, shots and `report.txt` / `report_keys.txt` in `root29b/out20/` and `outbase/`, the readouts cropped as `*_ro.png`)

- **The stock model** (the disassembly, `root29/stock.dis`): `0x460d16fc`
  has one writer, `eorl #1` at `0x4004591a`, and reads at `0x40044968`
  (the picture), `0x400449b8` (the number), `0x40044abe` (the marks),
  `0x4004d442`, `0x4004fde4` and `0x40050254` (the index: key + 12 *
  word). At boot the word read 0 and the number `0`; FUNC + RIGHT made it
  1, again 0. With SCALE OFF / ROOT A (d): position 0 keys 1 / 2 / 13 /
  14 / 16 = 219.3 / 232.4 / 438.7 / 464.7 / 521.6 Hz = C3 C#3 C4 C#4 D#4
  (-12 -11 0 +1 +3 st), position 1 keys 1 / 2 / 13 = 438.7 / 464.7 / 877.3
  = C4 C#4 C5 (0 +1 +12): stock's layout, ROOT ignored, the number `0` /
  `1` (`d_off_A_pos0_ro.png`, `d_off_A_pos1_ro.png`).
- **(a) ROOT A / MAJOR, T1**: position 0, keys 1..16 = 368.9 368.9 414.0
  414.0 464.7 492.4 492.4 552.7 552.7 620.3 620.3 696.3 737.7 737.7 828.1
  828.1 Hz = **A3 A3 B3 B3 C#4 D4 D4 E4 E4 F#4 F#4 G#4 A4 A4 B4 B4** (-3
  .. +11 st): the white keys 1 3 5 6 8 10 12 13 = A B C# D E F# G# A, no two
  adjacent white keys alike, nothing clamped; the number reads `A 0`
  (`a_A_pos0_ro.png`). Position 1 (FUNC + RIGHT, the word 1), keys 1..13 =
  232.4 x5, 246.2 x2, 276.3 x2, 310.2 x2, 348.2, 368.9 Hz = **C#3 x5, D3
  D3, E3 E3, F#3 F#3, G#3, A3** (-11 .. -3 st): the octave below, keys 1..3
  clamped at index 0 (C3, not in A major) and snapped to C#3 with keys 4
  and 5, keys 6..13 the A-major degrees up to the root A3; key 14 silent
  (stock's range check); the number reads `A -1` (`a_A_pos1_ro.png`).
- **(b) ROOT D / MAJOR, T1**: position 0, keys 1..16 = 246.2 246.2 276.3
  276.3 310.2 328.6 328.6 368.9 368.9 414.0 414.0 464.7 492.4 492.4 552.7
  552.7 Hz = **D3 D3 E3 E3 F#3 G3 G3 A3 A3 B3 B3 C#4 D4 D4 E4 E4** (-10 ..
  +4 st), the complete D3..D4 on keys 1..13, `D 0` (`b_D_pos0_ro.png`).
  Position 1, keys 1..13 = 492.4 492.4 552.7 552.7 620.3 657.2 657.2 737.7
  737.7 828.1 828.1 828.1 828.1 Hz = **D4 D4 E4 E4 F#4 G4 G4 A4 A4 B4 B4 B4
  B4** (+2 .. +11): D4 upward, keys 12 and 13 (C#5, D5) clamped at index 24
  (C5, not in D major) and snapped down to B4 with key 11; `D 1`
  (`b_D_pos1_ro.png`).
- **(c) ROOT C / MAJOR, T1, both buses**: position 0, keys 1..16 = 219.3
  219.3 246.2 246.2 276.3 292.8 292.8 328.6 328.6 368.9 368.9 414.0 438.7
  438.7 492.4 492.4 Hz = C3 C3 D3 D3 E3 F3 F3 G3 G3 A3 A3 B3 C4 C4 D4 D4
  (-12 .. +2); position 1, keys 1..13 = 438.7 438.7 492.4 492.4 552.7 585.5
  585.5 657.2 657.2 737.7 737.7 828.1 877.3 Hz = C4 C4 D4 D4 E4 F4 F4 G4 G4
  A4 A4 B4 C5 (0 .. +12); the numbers `C 0` / `C 1`. The **ef2944b bus** (the first pass) on the same
  card gave the same 29 numbers to 0.1 Hz, and the same five SCALE OFF /
  ROOT A numbers in each position (`outbase/report_keys.txt`) -- ROOT C
  and SCALE OFF are unchanged. That bus with **ROOT A / MAJOR** shows what
  the second pass fixes: position 0 the same sixteen numbers as above, but
  position 1 = 737.7 737.7 828.1 x11 Hz -- A4 A4 then **B4 on eleven of the
  thirteen keys** (every key from 3 up clamped at index 24 = C5, not in A
  major, snapped down to B4), its number reading `A 1`
  (`outbase/a_A_pos1_ro.png`).
- **(e) T2 (FM SYNTH), SCALE MINOR / ROOT A, octave 0**: keys 1 3 5 6 8 10
  12 13 = 220.0 247.0 261.6 293.7 329.6 349.2 392.0 440.0 Hz = A3 B3 C4 D4
  E4 F4 G4 A4, the number `A 0` (`e_T2_minor_A_ro.png`) -- as at the first
  pass.
- **Regressions, one take each**: the PTCH knob on T1 (TRACKS mode, SCALE
  MAJOR / ROOT E) +1 x 7 from 64 = 69 79 84 94 104 109 119 (C# D# E F# G#
  A B above C in E major), -1 x 7 = 109 104 94 84 79 69 59 (B below C#: C is
  not in E major). LEG MONO + GLIDE 64 on T2, C4 held, E4 pressed: the
  pitch leaves 262 Hz at 0.47 s and glides to 330 (t63 90 ms, 329 from 0.87
  s on) with no restart -- a restart would sit at 330 at once; the level
  steps the trig words give (+2 dB at 0.2 s, -2 at 0.48, +3.5 at 0.66 s,
  the stock 2.3 dB step per trig word) tripped the rig's 3 dB onset
  detector at 0.66 s in both takes, so `onsets` read 2 where the first pass
  read 1: the envelope is printed in `report.txt` (f1b). The tuner: UP +
  TEMPO opens it, again closes it (`tuner_open.png`, `tuner_closed.png`).
  Direct jump: CHAIN AFTER's byte 1 at +1 from the minimum
  (`chain_direct.png`). **SAVE + the two boots**: with SCALE MAJOR / ROOT A
  / GLIDE 12, PROJECT > SAVE, the card ejected: `project.work` and `.strd`
  carry `#SEQUENCER_SCALE=1`, `#SEQUENCER_ROOT=9`, `#SYNTH_GLIDE=12` after
  `PATTERN_CHANGE_CHAIN_BEHAVIOR=0`; re-inserted (the loader), the bytes
  read 1 / 9 / 12; the battery-RAM dump the child wrote at its quit
  (`0x0b14ec..ee` = `01 0c 09`) preloaded into a fresh headless `ot_emu`
  with no load posted (`OT_SRAM_IN`, `OT_NO_LOAD=1`): SCALE 1 / GLIDE 12 /
  ROOT 9 at ready and 20 s later, no fault (the same run without the dump:
  0 / 0 / 0). Placements at this commit in the new-layout tree:
  octatrick-usb 3,236 B of cave left, octatrick-tuner 3,236 B, cfmeter
  with DIRECT JUMP 2,852 B. `tools/stock_scan.py --no-asm`: the same four
  hits as at the first pass (direct-jump's displaced hook bytes and the
  synth manifest's 16-byte run), nothing new.

### Measured (28 Sep 2026, the octatrick-tuner BUILD 19 bus = OCTATRK2.9 on ot_emu `--dsp-rt` through the poke panel on 8930, a copy of the OTLIVE card, T2 = FM SYNTH slot 5, INDX 0 / FDBK 0, AMP HOLD INF REL 20, VOIC 1 unless said; the 2.8 baseline = the same remix at the `tuning` tree, BUILD 19, on 8931; notes as spectral peaks over 0.3-0.5 s windows named from C4 = 261.6256 Hz; the session's `root29/m29.py`, shots and `report.txt` in `root29/out29/` and `out28/`)

- **The ROOT row** (`row_root_A.png`, `row_glide.png`): PROJECT > CONTROL >
  SEQUENCER, [DOWN] x4 shows `LFO AUTO CHANGE / SCALE OFF / ROOT C`; the
  LEVEL knob from -20 then +1 twelve times stepped the byte 0 1 2 ... 11
  and stopped at 11 (B); [YES] at B wrapped to C; +9 read `ROOT A`; one more
  [DOWN] showed `SCALE OFF / ROOT A / GLIDE OFF` (the sixth row scrolled in).
- **SAVE, and the two boots**: with SCALE MINOR / ROOT A / GLIDE 12,
  PROJECT > SAVE, the card ejected: `project.work` and `project.strd` both
  carry `PATTERN_CHANGE_CHAIN_BEHAVIOR=0`, `#SEQUENCER_SCALE=6`,
  `#SEQUENCER_ROOT=9`, `#SYNTH_GLIDE=12`, in that order. The card
  re-inserted (a fresh boot that loads the project through the loader):
  the bytes read 6 / 9 / 12 and the row reads `ROOT A`. The **power cycle**
  (the 1 MB battery-RAM dump the child wrote at its quit -- `0x0b14ec..ee` =
  `06 0c 09` -- preloaded into a fresh `ot_emu` with `OT_SRAM_IN`, no LOAD
  PROJECT posted, `OT_NO_LOAD=1`): headless, the bytes read SCALE 6 / GLIDE
  12 / ROOT 9 at ready and 20 s later, no fault; through the panel, the
  SEQUENCER window reads `SCALE MINOR / ROOT A` (`outwarm/warm_row_root.png`)
  and the unit plays. `--watch-pc` on that warm boot: loader `0x4010fdf0` at
  instruction 4,270,945, depack `0x400e0aca` at 4,505,240, `.data` copy at
  6,526,781, main at 12,342,579, the warm-boot path `0x40025770` at
  18,862,886, the sanitiser `0x4000fec8` at 18,862,945 and the `qz_boot`
  site `0x40010212` at 18,863,157 -- the clamp runs 14.6 M instructions
  after the runtime was depacked, so the ROM/DRAM split is not what makes
  it safe; it is safe by construction and the split is documented above.
- **(b) The keys, SCALE MINOR / ROOT A, octave 0, VOIC 1**: keys 1 3 5 6 8
  10 12 13 sounded 220.0 / 247.0 / 261.6 / 293.7 / 329.6 / 349.2 / 392.0 /
  440.0 Hz = **A3 B3 C4 D4 E4 F4 G4 A4**, all within 1 cent; key 2 (A#3
  chromatic) sounded 220.0 (snapped down to A3). The number beside the
  keyboard reads `A 0` (`kbd_minor_A.png`). **ROOT C** on the same keys:
  130.8 / 146.8 / 155.6 / 174.6 / 196.0 / 207.7 / 233.1 / 261.6 Hz = C3 D3
  D#3 F3 G3 G#3 A#3 C4 (C minor), and the **2.8 baseline bus** (the `tuning`
  tree at BUILD 19, `out28/`) gave the same eight numbers to 0.1 Hz with
  its number reading `0` (`kbd_minor_28.png`; the 2.9 shot at ROOT C,
  `kbd_minor_C.png`, still reads `A 0` -- a stale draw, see (e); the fresh
  draws are `probe_kbd_E_major.png` = `E 0` and `probe_kbd_off_E.png` = `0`).
- **(c) The PTCH knob, TRACKS mode, ROOT A / MINOR**: +1 x 7 from 64 gave
  the Part bytes 66 68 69 71 73 75 76 (D E F G A B C: the A minor degrees
  above C), -1 x 7 gave 75 73 71 69 68 66 64. At Part 73 (+9), [TRIG 10]
  in TRACKS mode played T2 at **440.0 Hz** (A4). A **PTCH lock** written
  through the TRACKS-mode trig (GRID RECORDING, [TRIG 10] held, knob A):
  +1 -> 75 (B), -2 -> 71 (G), +1 -> 73 (A), the Part byte untouched at 73;
  the pattern played step 10 at 439.9 Hz. **ROOT C**: 66 67 69 71 72 74 76
  up and 74 72 71 69 67 66 64 down -- the 2.8 baseline's numbers exactly
  (`out28/report.txt`: 66 67 69 71 72 74 76 / 74 72 71 69 67 66 64).
- **(d) A CHRD chord, SCALE MAJOR / ROOT E, VOIC 3, CHRD MAJ (byte 8)**:
  key 13 (E4 with ROOT E) sounded **329.6 / 415.3 / 493.9 Hz = E4 G#4 B4**
  (twice); key 16 (G4 chromatic, snapped to F#4, in E major) sounded 370.0
  / 440.0 / 554.4 Hz = **F#4 A4 C#5**: the shape's A# snapped down to A. (A
  first take of key 13, made right after a cold reboot and a CHRD change,
  read D#4 G4 A#4 -- a MAJ chord a semitone low; the two takes that followed
  and the single-key takes read E4 / F#4 as expected. Not reproduced; noted
  under open items.) With the CHRD byte 36 (DI7 in the 2.8 table) key 13
  gave E4 F#4 A4 and key 16 F#4 A4 B4 -- every note in E major.
- **(e) SCALE OFF ignores ROOT** (ROOT E): key 13 = 261.6 Hz (C4), key 1 =
  130.8 (C3), the knob +1 +1 from 64 = 65, 66 (one raw a detent), and after
  a fresh draw of the keyboard (FUNC + RIGHT, FUNC + LEFT) the number reads
  `0` alone (`probe_kbd_off_E.png`; `probe_kbd_E_major.png` reads `E 0`
  with MAJOR on). Note for the next rig: the keyboard block is not redrawn
  when the PROJECT menu closes -- a shot taken right after the menu shows
  the previous draw (`kbd_off_rootE.png` still read `E 0`); an octave step
  or a trig-mode entry redraws it.
- **(f) Regressions, one take each** (SCALE OFF, ROOT C unless said):
  LEG MONO + GLIDE 64, C4 held, E4 pressed: 1 onset, f0 261.6 Hz, the pitch
  moves without a restart, t63 90 ms, final 330 Hz. Chord recording in
  LIVE REC (VOIC 3, CHRD ----, keys 1 5 8 at octave +1): one step, PTCH 64
  (C4), CHRD 8 (MAJ), VOIC 3, HOLD 52. MIDI IN with SCALE MINOR / ROOT A
  (channel 2, VOIC 3): note 84 = 261.6 Hz, 84 + 85 = two voices sounding
  (2, 2) -- see the MIDI note below. The tuner: UP + TEMPO opens `TUNER T2`
  (`tuner_open.png`), again closes it. Direct jump: CHAIN AFTER's row reads
  `DIRECT` at +1 from the minimum (byte 1, `chain_direct.png`). The FM SYNTH
  page draws with its icons (`tuner_closed.png`, `fm_page.png`). Boot A/B
  (static): the 2.9 bus differs from the 2.8 bus in 73 regions, 17,308 B:
  the quantizer's own detour sites (3 B each at 0x40010217, 0x40025ac7,
  0x400449bb, 0x4004fbe1 ... 0x400888ad), the SEQUENCER list poke
  (0x40065c7f) and table refs, the pinned `scale.s` target byte
  (0x400d2cad), the zero run 0x400d6b85..0x400d7b14 (the 3,268-byte unit
  gone, the direct-jump cave and the three tables moved down), the 2-byte
  low words of every other DRAM unit's detour operand (the synth, USB and
  tuner units link after the quantizer's DRAM unit now, so their addresses
  moved: 0x40003ca8, 0x4000d042 ... 0x400625e4) and the appended runtime
  0x4010febe..0x401134a0. Nothing else.
- **MIDI IN and the scale**: with SCALE MINOR / ROOT A a MIDI note 85 (C#4)
  into T2 sounded 261.6 Hz (C4) -- the synth engine's own chord snap
  (`po_snap`, applied to a MIDI key as to a panel key since the engine's
  MIDI IN of 30 Sep 2026) put it on the rotated mask; the quantizer itself
  touches no MIDI path (sample tracks' MIDI IN is stock). The **2.8
  baseline** does the same: note 85 with SCALE MINOR (C minor there) sounded
  261.6 Hz, 84 + 85 one line at 261.7, and 85 with SCALE OFF 277.2 Hz
  (C#4) -- so nothing changed here; a MIDI note is unquantized on every
  track with SCALE OFF, and on a synth track with a scale on it lands on
  the scale, as a panel key does, on the root's mask now.

## What does not work, and what is left (2.9)

- The MIDI note a CHROMATIC key sends out is the key's own (72 + key), not
  the transposed, snapped pitch -- as in 2.8, where it did not follow the
  -4..+4 octave either. Four sites match note-on and note-off by key (the
  stock `0x4004fc24`, the release path, this unit's `qz_noteoff` callers);
  a transposed note-out is a small follow-up if wanted.
- On a sample track the other keyboard position is partial by
  construction (the stock -12..+12 st range holds one root-to-root octave
  for r > 0): its clamped keys -- the top r keys for ROOT C..F#, the bottom
  12 - r keys for G..B, the table above -- sound the scale's nearest degree
  at that end. The default position is complete for every root (keys 15,
  16 pass +12 for ROOT B, key 16 for A#). A synth track (0..127) is not
  clamped in practice (raw 4..126 with ROOT, 0 / 127 only after a snap at
  the very ends).
- The first (d) take after a cold reboot read a MAJ chord a semitone low
  (D#4 G4 A#4 for key 13 at ROOT E); every later take read E4 G#4 B4. One
  observation, not reproduced, cause unknown (the CHRD knob had just been
  set through the LFO page).
- The engine's snap of a MIDI-IN note onto the (now root-rotated) scale on
  a synth track is the synth module's behaviour and 2.8's too (measured on
  the baseline: C#4 -> C4 with SCALE MINOR, C#4 with SCALE OFF); whether
  MIDI IN should bypass the scale on a synth track is a design question,
  not changed here.
- Not measured: PICKUP / STATIC sample tracks' keys with a root (the
  clamp), the paraphonic-legato hand-over with a root, a THRU track (no
  PTCH: untouched by construction), hardware.

## What does not work, and what is left

- **NEW PROJECT** does not run the text loader, so the scale byte keeps
  its value until a project is loaded or the setting is changed; a saved
  project without the line loads as OFF (measured after the first, wrong
  save: cold boot → 0).
- **Scene locks** on PTCH (a SCENE key held) and the **MIDI CC-in** path
  (`0x40054cd8`, `0x40062550`) write PTCH unquantized; only the two knob
  paths and the chromatic keys are hooked. The MIDI-in chromatic notes
  (`0x4000e6e2`, `5·note − 100`) are not snapped either.
- The chromatic key's **MIDI note out** is the key's own, not the snapped
  degree (the release matches on it).
- With MIDI AUDIO TRK CC OUT set to EXT only (`0x8000004a` bit 0 clear)
  the knob handler takes its accumulator path and stores nothing itself;
  not measured.
- The boot A/B differs by the phase of one breathing LED pair (above);
  the two per-line loader detours are the cost of a file format whose
  stock reader rejects unknown keys.
- **Both halves are flashed**: SCALE since OCTATRICK1, GLIDE as OCTATRICK9
  on an MKI, 26 Sep 2026 (emulator-verified since).
- **Legato and live recording** (fixed 24 Sep 2026, "Legato and the live
  recorder"): a legato press records a trigless trig with its PTCH lock;
  since 2 Oct 2026 a paraphonic legato press (LEG POLY) does the same.
- **The old key's MIDI note-off** goes out at the legato press (as stock
  sends it before a fresh trig), so an external mono synth does not see a
  MIDI legato.
- **A sample track's keys are stock since 2 Oct 2026**: the legato switch
  is the synth track's LEG setting (`modules/synth`), so GLIDE no longer
  gives a sample track legato (FUNC + key still slides it, stock).

Background: `docs/firmware/PARAM_PAGES.md` (the descriptor layout),
`docs/firmware/midi_re_note.md` (the chromatic lock block),
`tools/panel/KEYMAP.md` (the knob store, the lock bytes), `CONTEXT.md`,
`modules/direct-jump/README.md` (the CHAIN AFTER menu and the project
file).
