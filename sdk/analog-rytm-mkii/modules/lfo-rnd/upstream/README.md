# lfo-rnd

Port of rytm-mods-src `mods/0004-lfo-rnd` (MrScruff; `built` in its mod.toml, listed as verified on hardware in its MANUAL there). Full usage: rytm-mods-src
`docs/MANUAL.md`, section 0004.

A second LFO page, LFO RND: press the LFO page key again (and again to return). DS1/DS2 (knobs A, B) are destinations picked from stock's LFO DST list restricted to sixteen (the eight machine parameters, FIN, STA, FRQ, RES, DEC, PAN, DEL, REV); DP1/DP2 (E, F) are depths, 0..64 in sixteen steps. On every note trig each modifier offsets its destination by a random -N..+N, clamped to the parameter's range, held until the next note, on top of p-locks, slides and LFO 1. Stored in the sound, in core-ar2 0.2's mod storage (below). Voice tracks only; not p-lockable.

Needs core-ar2 0.2 or later (`"resources": {"core": "0.2"}`).

## Storage (1.1)

The four settings are one 16-bit field in core-ar2's mod storage,
`{"sym": "lfo_rnd_cfg", "scope": "sound", "bits": 16}`, packed as before: DS1 in bits 0-3
(a position in the sixteen destinations), DP1 in 4-7 (an index into the sixteen depths), DS2
in 8-11, DP2 in 12-15. All zero is both destinations on the machine's first parameter and both depths 0 (off),
core's default. The item is the track's live sound as `shared_cur_sound`/`shared_sound_of`
return it (the active kit's track accessor, vtable +0x28); in rytm-emu that is the same
object as store-check's `LIVE_KIT_SOUND(-1, track)` (live project 0x407c89cb + 0xa8cf18 +
42 + 152 * track); core keeps the field in the sound's spare bytes +0x6d..+0x6f (with
the lockfile of a build of core and lfo-rnd alone, +0x6d..+0x6e). One field rather than four:
the trig path makes one `core_store_get` per voice trig.

Not with voice-dac 1.1 in one build: it writes +0x6d..+0x6f itself, untagged, so the two
would overwrite each other's values. 16 bits of core's 24 a sound are this field's; voice-dac
needs 18 of them today.

- `nibble` (the page's dial, popup, picker reads) and `trig_cfg_gate` (sequencer interrupt,
  per voice trig) read the word with `core_store_get`. `audio_gate` still reads only the
  per-track copy `trig_cfg_gate` makes, so the audio interrupt makes no core call.
- `set_field` reads, modifies and writes it with `core_store_set`; only the UI writes it.
- After each change the stub sends the notice stock's own sound settings setters send,
  `{SoundConfigChangedInfo (0x401cb5dc on 1.73), 1}` through the selected track's sound
  accessor (vtable +16), as voice-dac and stock's ENV RESET setter do. Without it the live
  sound is changed but the stored sound is not, and the change is lost at a reboot without a
  kit save (checked: see Results).

The sound's parameter word 0 is no longer where the settings live, so its stock bytes stay
stock (0). The ROM record patches making ids 1..4's container index 0 stay: the destination
list, `list_filter_gate`, `list_same_gate` and `knob_cidx_gate` key on it.

**Sounds saved by 1.0 keep their settings.** lfo-rnd 1.0 (and rytm-mods) kept the word in
parameter word 0 (live sound +0x14, stored slot 41), which stock loads and saves. 1.1 reads
that word whenever the field is 0 (`word_of`), so such a sound plays and shows its settings
as before. The first edit on the LFO RND page moves the whole word into the field and clears
word 0 in the live sound and, through the kit's parameter bank (`shared_mark_changed` with 0,
the 1.0 path), in the stored one. A sound no one edits keeps its old word, which 1.0 reads
too. The cost is a test and a branch per read.

## Sites

31 sites (1.1 had 38), the claims rytm-mods' registry makes for its default build
(`registry/allocations.toml`, owner `0004-lfo-rnd`):

| addr | op | |
|---|---|---|
| 0x40039d32 | jmp | `jmp lfo_rnd_list_same_gate` |
| 0x40039d9a | jmp | `jmp lfo_rnd_list_new_gate` |
| 0x4003a5f2 | jmp | `jmp lfo_rnd_knob_cidx_gate` |
| 0x4004aec6 | jmp | `jmp lfo_rnd_list_filter_gate` |
| 0x4009b000 | jmp | `jmp lfo_rnd_trig_cfg_gate` |
| 0x400a857c | jmp | `jmp lfo_rnd_knob_draw_gate` |
| 0x400a8dfa | jmp | `jmp lfo_rnd_read_gate` |
| 0x400a9000 | jmp | `jmp lfo_rnd_setter_gate` |
| 0x40120fae | jmp | `jmp lfo_rnd_audio_gate` |
| 0x401bf950 | bytes | `ffffffff` -> `00000000` |
| 0x401bf958 | bytes | `00000000` -> `00007f00` |
| 0x401bf970 | bytes | `00000000` -> `00010000` |
| 0x401bf974 | ptr | pointer -> `lfo_rnd_str_r1dst_l` |
| 0x401bf978 | ptr | pointer -> `lfo_rnd_str_group` |
| 0x401bf97c | ptr | pointer -> `lfo_rnd_str_r1dst` |
| 0x401bf984 | bytes | `ffffffff` -> `00000000` |
| 0x401bf98c | bytes | `00000000` -> `00007f00` |
| 0x401bf9a8 | ptr | pointer -> `lfo_rnd_str_r1dep_l` |
| 0x401bf9ac | ptr | pointer -> `lfo_rnd_str_group` |
| 0x401bf9b0 | ptr | pointer -> `lfo_rnd_str_r1dep` |
| 0x401bf9b8 | bytes | `ffffffff` -> `00000000` |
| 0x401bf9c0 | bytes | `00000000` -> `00007f00` |
| 0x401bf9d8 | bytes | `00000000` -> `00010000` |
| 0x401bf9dc | ptr | pointer -> `lfo_rnd_str_r2dst_l` |
| 0x401bf9e0 | ptr | pointer -> `lfo_rnd_str_group` |
| 0x401bf9e4 | ptr | pointer -> `lfo_rnd_str_r2dst` |
| 0x401bf9ec | bytes | `ffffffff` -> `00000000` |
| 0x401bf9f4 | bytes | `00000000` -> `00007f00` |
| 0x401bfa10 | ptr | pointer -> `lfo_rnd_str_r2dep_l` |
| 0x401bfa14 | ptr | pointer -> `lfo_rnd_str_group` |
| 0x401bfa18 | ptr | pointer -> `lfo_rnd_str_r2dep` |

core-ar2 0.4 entries (1.2): `core_pages` `lfo_rnd_page` (page 12, LFO RND) and `core_params` `lfo_rnd_params` (ids 1..4: `lfo_rnd_get`, `lfo_rnd_delta`, `lfo_rnd_text`), in place of 1.1's four detours at the entries of page_info, page_get_value, param_apply_delta and param_value_text; and `core_view_pages` `lfo_rnd_view_page` (LFO RND behind the LFO key, order 20), in place of 1.1's own list for the LFO view. The header's title after the page key's step, which 1.1 pushed itself for every view (0x4003ab94), is core-ar2 0.4's.

A detour is a `jmp` site over the whole stock instructions it displaces; the stub re-emits them
as in rytm-mods. Where rytm-mods patched the address operand of a `jsr`/`lea`/`move.l #`, the
site is elemod's `keep2` (the opcode word kept, the address the mod's). A pointer in a data
table is a `ptr` site.

## Changes from rytm-mods

### 1.2: on core-ar2 0.4's page tables

LFO RND's page and its four knobs now go through core-ar2 0.4, which owns the entries of the
stock page routines, instead of this mod's own detours there (Sites, above). What the unit shows
and does is unchanged. The reason is that more than one mod can now add a page: with every mod
jumping from the same entries, only one detour per instruction could link. Needs core-ar2 0.4
(`"resources": {"core": "0.4"}`), OS 1.74 only; builds of lfo-rnd before 1.2 do not link
with core 0.4 (their sites overlap core's), and 1.2 does not link with core 0.3.

- Generated by `tools/port_mod.py`. The code is unchanged; each label a site names gets a
  `.globl` alias carrying the mod id on the line before it, and the stub keeps using its own
  local labels.
- rytm-mods' default build params are fixed with `.equ` (`P_...`), as its build passed them;
  claims and code its diagnostic params select are left out.
- Every section the stub had in separate caves is `.text` here, one `.run` the linker places in
  the DDR mods area.
- 0000-shared's runtime is assembled into the mod, at the end of the unit (`../shared/shared.s`): its references into it, absolute in rytm-mods, are PC-relative here, so the code is a few bytes shorter.
- 1.1: the settings moved from the sound's parameter word 0 to core-ar2 0.2's mod storage
  (Storage, above), so a sound's stock bytes are what stock would have; the kit parameter
  bank write (`kit_param_changed`) became the sound change notice, and is kept only to clear
  a 1.0 word once it has been moved.
- rytm-mods put two small gates (`knob_cidx_gate`, `list_new_gate`) in their own section at the end of cave4 for lack of room; here they stay in `.run`, in source order.

## Test (on a unit)

1. LFO page, press LFO again: LFO RND with DS1, DS2, DP1, DP2.
2. Turn DS1: the destination list opens; pick FRQ, YES. DP1 to 32.
3. Play trigs on that track: the cutoff varies note to note. DP1 = 0: no change.
4. Save the kit, power-cycle, reload: the four settings are kept.
5. Power-cycle without saving the kit: the four settings are kept.
6. A kit saved with lfo-rnd 1.0: its settings show and play; change one, power-cycle, the
   change is kept and the rest are as they were.

## Results so far

### 1.2 on core-ar2 0.4

- rytm-emu, OS 1.74, core-ar2 0.4 with all eleven mods against the v1.2 release build (core 0.3):
  LFO RND's page and its four knobs, every screen of the same key and knob sequence pixel-identical.
- Hardware, Analog Rytm MKII OS 1.74, 2026-10-21, core-ar2 0.4 with all eleven mods (P4A4, then Q4A4 with the page-key lists): every test step passes. With core's page step and title (U4A4): LFO steps LFO, LFO RND, LFO, the header following.

### 1.1 (core-ar2 0.2 storage)

- Hardware, Analog Rytm MKII OS 1.74, 2026-10-20, with core-ar2 0.3 and all eleven mods: test steps
  1 to 6 pass, with LFO RND kept through kit save and reload, a power-cycle without a kit save, the
  +Drive sound library, and a kit sent and received by SysEx and by Overbridge. Not run on hardware
  with core 0.2, or on OS 1.73.

- Built with elekloader 92a99c9 (core-ar2 0.2): `.run` 1792 B, 38 sites (the same as 1.0's,
  same addresses and resumes), 6 relocations, imports `core_store_get`, `core_store_set`,
  `lfo_rnd_cfg`; lint OK with core 0.2 on 1.73 and 1.74; linked with core 0.2 alone. The
  lockfile placed `lfo_rnd_cfg` at sound bit 0 (descriptor 0x14000000).
- rytm-emu, core 0.2 + lfo-rnd 1.1, 1.73 and 1.74 (every frame identical between the two
  OS): LFO twice opens LFO RND; DS1 opens the list, YES confirms DEC; DP1 steps to 8; on SD,
  DS2 to FIN and DP2 to 2; TRK + BD and TRK + SD show each track's own values. The 27 frames
  of that run are pixel-identical to lfo-rnd 1.0's (with core 0.1) on the same OS. Memory
  after it: BD's live sound +0x6d..+0x6f = 00 62 00, SD's 28 00 00, every other track's 0;
  word 0 (+0x14) is 0 on every track, as in stock.
- Power off (the firmware's power-fail save) without a kit save, cold boot: the same bytes
  and values. A build with the notice taken out lost both sounds' values this way.
- Playing (MIDI start): SD's trig copies 0x2800 into the trig cache and draws its R2 offset
  on FIN (-2), on both OS.
- Migration: a card saved by lfo-rnd 1.0 (core 0.1) with BD 0x0062 and SD 0x2800 in word 0,
  cold-booted with 1.1: the page shows them, SD's trigs use 0x2800. DP1 on BD changed: BD's
  field 0x0082, its word 0 cleared; after power off and cold boot both stay so, SD keeps its
  1.0 word. 1.73 and 1.74 alike.
- Not checked: hardware; kit save and reload through the menu, the sound pool, copy/paste,
  SysEx (core documents them as carrying sound fields); the random offsets as heard.

### 1.0

- Built with elekloader at d17478b and m68k-linux-gnu binutils 2.42: `.run` 1596 B,
  38 sites, 2 relocations; lint OK; links with core-ar2 0.1 and the other ports.
- Against rytm-mods-src's default build (all of its mods at their default params; "T2" below): the original stub, re-assembled
  as rytm-mods' build does, equals T2's caves byte for byte (.text 0x402cd8a0, .kgate 0x40029808). Each of its 37
  labels was then disassembled in T2 and in the full build with every address named by its label: the
  instructions match.
- Every byte the full build changes in the OS is inside one of the ports' sites, every one of these sites is
  patched in T2 too, and the `bytes` sites write exactly T2's bytes.
- rytm-emu (3c4c42c), the full build (core-ar2 with all eleven ports): LFO twice opens LFO RND; DS1 opens the list (BDPL:Level, Tune, ...), YES confirms, DP1 steps to 64: all 14 screens pixel-identical to T2 (stock differs on 13). The random offsets during playback were not measured.
- Hardware: on an Analog Rytm MKII, 2026-10-14, in the full build (core-ar2 with all eleven ports): the LFO RND page, the destination list
  (sixteen entries, YES confirms), random offsets per note on two destinations, the list
  following the knob turned, no page on the FX track, and the settings kept through save, power
  cycle and reload. TRK + DS1/DP1 stays on the selected track.
