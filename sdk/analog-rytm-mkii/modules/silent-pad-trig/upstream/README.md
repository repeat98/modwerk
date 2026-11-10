# pad-select

A new mod, not a port (design and firmware notes: `DESIGN.md`). Needs core-ar2 0.3, so OS 1.74
only for now.

GLOBAL > SEQUENCER CONFIG gains PAD+TRIG SEL TRK, a checkbox after AUTO TRK SWITCH. Checked, the
pads and TRIG keys 1-12 make sound only in LIVE RECORDING:

| input | not recording, or GRID REC | LIVE REC, STEP REC |
|---|---|---|
| pad | selects its track, silent | stock |
| TRIG 1-12 | selects track n, silent (in GRID REC they place trigs, as stock) | stock |
| FUNC + pad | plays, at the pad's own velocity | stock |
| FUNC + TRIG 1-12 | plays | stock |
| RTRG + pad | selects, silent; FUNC + RTRG + pad rolls | stock |

A silent press sends no MIDI note and leaves no held note, so its release cuts nothing the
sequencer plays. CHROMATIC mode (its own view), MUTE/SCENE/PERF, TRK + pad, MIDI notes in, TRIG +
YES, the SOUND BROWSER preview and the sequencer are as stock. Live recording counts only while
the sequencer runs: paused in LIVE REC, the pads select silently. Unchecked, everything is stock.

The setting is core-ar2's mod storage field `pad_select_on` (global scope, 1 bit), one per GLOBAL
slot, saved with the project's globals as voice-dac's DAC SUM is. A slot saved without it, or
received as Global SysEx, loads unchecked.

## How it hooks

5 sites (OS 1.73 / 1.74):

| 1.73 | 1.74 | op | |
|---|---|---|---|
| 0x400c76c2 | 0x400c772e | jmp `pad_select_play_gate` | the play routine both handlers call: returns at once unless FUNC is held |
| 0x400c79d2 | 0x400c7a3e | keep2 -> `pad_select_autotrk` | the pad handler's AUTO TRK SWITCH test: on |
| 0x400c7e24 | 0x400c7e90 | keep2 -> `pad_select_autotrk` | the TRIG key handler's |
| 0x400c78e4 | 0x400c7950 | jmp `pad_select_func_gate` | the pad handler's FUNC test: off, so FUNC + pad takes the pad's velocity |
| 0x400ec118 | 0x400ec184 | jmp `pad_select_menu_add` | SeqSettingsMenuView's constructor: the item, after AUTO TRK SWITCH |

Each applies only while the flag is set and the view's sequencer state is in neither LIVE REC
(0x40036370) nor STEP REC (0x400363bc). The play routine (`KeyboardView`, src 1 a pad, 0 a TRIG
key) is the only path from those keys to the voice and the MIDI note; the shared voice trigger
(0x40083f40) is not touched. The flag is read from the active globals slot through
`core_store_get` on each press, and written through `core_store_set` by the menu item, which then
sends the globals' change notice so stock saves them.

## Changes from rytm-mods

None: not a rytm-mods mod. `gslot` and `rec_active` follow voice-dac 1.2's `dac_gslot` and
`dac_active` (MrScruff's mod, this repo's port).

## Test (on a unit)

`DESIGN.md`, "Test", 12 steps; in short:

1. SEQUENCER CONFIG: PAD+TRIG SEL TRK after AUTO TRK SWITCH; YES and LEFT/RIGHT toggle it. Save,
   power-cycle, reload: kept. Another GLOBAL slot keeps its own setting.
2. Stopped or playing: pads and TRIG 1-12 select silently; FUNC + pad plays, soft and hard.
3. GRID REC: TRIG keys place trigs; pads select silently.
4. LIVE REC (RECORD + PLAY) and STEP REC (RECORD + STOP): as stock.
5. CHRO, MIDI notes in, TRIG + YES: as stock. A track with MIDI out: a silent press sends nothing.
6. Unchecked: stock.

## Results so far

- 0.2 (2026-10-21): the setting moved into core-ar2 0.3's mod storage, as the repo's other
  mods keep theirs. 0.1 kept its own tag and flag in stored globals bytes 75 and 76 with load and
  save hooks; core-ar2 0.3 keeps every mod's global fields in those same bytes (+0x4b..+0x4f) and
  hooks the same routines, so 0.1 would have collided with it. 0.2 drops both hooks and the
  per-record table.
- Written for OS 1.74 from Elektron's stock `Analog-Rytm_MKII_OS1.74.syx` (main OS sha256
  `34cd0c4d...`), disassembled with binutils. Every 1.74 site's stock bytes are read from it.
- Built with elekloader at 19ce140 (core-ar2 0.3), m68k-elf binutils 2.47: `.run` 764 B, 5 sites,
  5 relocations. Combines with core 0.3 alone, and with core 0.3 and all eleven of this repo's
  mods (no overlaps, stock bytes as expected, sites whole instructions); its field takes bit 0 of
  global storage, beside voice-dac's `vd_dac`.
- Code review (2026-10-20): AUTO TRK's test reuses the play gate's answer for the same press;
  both handlers reach their AUTO TRK test straight after the play call, and nothing in stock
  branches between the two.
- **Not run** in rytm-emu or on a unit.
- The 1.73 source is the 1.74 one with each code address moved back by the README's OS 1.74
  shifts, and is **not checked against a 1.73 file**; it can't build until core-ar2 0.3 has a 1.73
  port.
