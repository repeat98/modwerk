# voice-dac

Port of rytm-mods-src `mods/0013-voice-dac` (MrScruff; hardware-verified there). Full usage: rytm-mods-src
`docs/MANUAL.md`, section 0013.

GLOBAL > AUDIO ROUTING > DAC SUM (last item): ON routes every voice to the main mix through the DAC. With it on, FILTER pressed twice opens DAC FILTER: a per-voice filter (FRQ, RES, TYP OFF/LP2/LP1/BP/HP1/HP2/BS/PK, DEP), a transient shaper (ATK, SUS) and polarity, after the analog filter. Saved with the project and the sound. From 1.4 the page shows only the
knobs the selected sound's TYP uses: no RES for LP1 and HP1, and neither FRQ nor RES with TYP OFF.

In 1.1 (rytm-mods-src 76ae299, MrScruff's update), with ctrl-all's gesture on the DAC FILTER page:
TRK + turn with no trig key held steps that knob on every voice track, each within its own limits; TYP
and POL are set the same on every track (the type the selected track reaches, the same polarity), and
FUNC + TRK + turn on ATK or SUS moves each track to its own next stop of -64, 0 and +63. It works
whether ctrl-all is in the build or not.

## 1.2: the settings in core-ar2 0.3's mod storage

Needs core-ar2 0.3 (`"resources": {"core": "0.3"}`). What is kept and how it behaves is as in 1.1:
DAC FILTER's values are per sound (they travel with it: kit save and reload, the power-fail save,
a pattern change to another kit, the sound pool, copy and paste; a sound reset sets the defaults), and
DAC SUM is per global slot. Only where they are kept changed:

| field | scope | bits | value (zero = the default) |
|---|---|---|---|
| `vd_flt` | sound | 24 | TYP << 21 \| (FRQ ^ 0x7f) << 14 \| (DEP ^ 0x7f) << 7 \| RES: TYP OFF, FRQ 127, DEP FULL, RES 0 |
| `vd_shp` | sound | 15 | (ATK & 0x7f) << 8 \| (SUS & 0x7f) << 1 \| POL; ATK and SUS 7-bit two's complement: 0, 0, + |
| `vd_dac` | global | 1 | DAC SUM, index = the global slot (the active live record, 0x413192ff + 228 x slot): OFF |

Why: 1.1 kept its values in bytes core-ar2 0.2/0.3 now owns (the live sound's +0x6d..+0x6f, the
velocity routes' amount low bytes and the stored record's spare slots 42..47) and hooked core's own
sound_load site, so the two could not be built together, and lfo-rnd 1.1's field shares those bytes.
Through core the 39 sound bits sit beside lfo-rnd's 16 (55 of core 0.3's 56; a build with both was
checked to allocate them together).

- **Dropped sites (15):** the globals' load and save (0x40007660, 0x40007bb0), sound_load's entry,
  its mid-body load and its route load (0x400081f6, 0x4000826a, 0x40008364), sound_save
  (0x40008492), sound_init_defaults (0x400122d0), the sound push (0x4011f63c, 0x4011f660) and the
  aftertouch and velocity menus' getAmount, setAmount and setRoute (0x40033a90, 0x40033a1c,
  0x4003391e, 0x400c52ba, 0x400c5246, 0x400c5148). Core owns the save, load, init and the route
  hooks; nothing of voice-dac reads or writes a sound's or a globals record's bytes any more.
- **Code:** every read and write goes through `core_store_get` / `core_store_set` with the live
  sound as the item (`flt_entry`, `flt_set`, `shp_entry`, `shp_value`, `shp_set`, helpers `vd_get`
  and `vd_put`, which keep d1/a0/a1 so the callers' register contracts hold). DAC SUM reads and
  writes `vd_dac` for the active slot (`dac_refresh`, `dac_change`). The audio interrupt still reads
  only the caches (`hpf_track`, `shp_track`, `shp_any`, `dac_on`); the idle tick refills them as
  before, an edit updates its track at once, and a new `ev_project` handler clears them after a
  project load or CREATE NEW (so the old project's filters do not play for up to a tick) and reads
  DAC SUM again - except at boot, when project_singleton is still building the project (calling it
  then builds a second, empty one), so the first idle tick does it, as in 1.1.
- **Fixed:** 1.1 wrote its tag and DAC SUM into stored globals +12/+13, which are stock's TRACK 1
  and TRACK 2 MIDI CHANNEL: TRACK 1 reloaded as its default and TRACK 2 as 0 or 1. 1.2 leaves them
  alone.
- **Old settings load as defaults.** Sounds, kits and projects saved by voice-dac 1.0/1.1 or
  rytm-mods 0013 carry their values in the old places, which core does not read (its layout ID does
  not match): DAC FILTER reads TYP OFF etc. and DAC SUM OFF until set again. The TRACK 1/2 MIDI
  channels those builds overwrote stay as loaded until set again.
- **SysEx:** a global slot received as SysEx keeps no mod data (core's limit: the dump has no room
  for core's layout ID), so it loads DAC SUM OFF; 1.1's tag at +12 travelled with it.
- **VELOCITY MOD reset:** core keeps the route bytes' fields when the menu resets the velocity routes;
  in 1.1 that reset cleared RES, ATK and SUS (they sat in velocity routes 0..2's low bytes).
- The P_DBG diagnostic build (route-byte probe, tag counters) is gone with the storage it checked.

## Sites

27 sites (1.2 had 34, 1.1 49), from the claims rytm-mods' registry makes for its default build
(`registry/allocations.toml`, owner `0013-voice-dac`), less the 15 that only stored, loaded, cleared or
protected the values (1.2, below); the timing, prof, burn and dbg builds' extra claims are left out.
Also a handler on core-ar2's `ev_project`, `voice_dac_vd_project`.

| addr | op | |
|---|---|---|
| 0x400a2aae | jmp | `jmp voice_dac_hpf_refresh` |
| 0x400a8584 | jmp | `jmp voice_dac_flt_glyph` |
| 0x400d2e42 | jmp | `jmp voice_dac_flt_graph` |
| 0x400d901c | jmp | `jmp voice_dac_dac_menu_add` |
| 0x4011fde2 | jmp | `jmp voice_dac_vs_alt` |
| 0x401212b6 | jmp | `jmp voice_dac_route_all` |
| 0x40121364 | jmp | `jmp voice_dac_vs_main` |
| 0x401bfa28 | bytes | `00000000` -> `00007f00` |
| 0x401bfa44 | ptr | pointer -> `voice_dac_txt_frq_long` |
| 0x401bfa4c | ptr | pointer -> `voice_dac_txt_frq_short` |
| 0x401bfa90 | bytes | `00000000` -> `00007f00` |
| 0x401bfaac | ptr | pointer -> `voice_dac_txt_atk_long` |
| 0x401bfab4 | ptr | pointer -> `voice_dac_txt_atk_short` |
| 0x401bfb60 | bytes | `00000000` -> `00000700` |
| 0x401bfb7c | ptr | pointer -> `voice_dac_txt_typ_long` |
| 0x401bfb84 | ptr | pointer -> `voice_dac_txt_typ_short` |
| 0x401bfb94 | bytes | `00000000` -> `00007f00` |
| 0x401bfbb0 | ptr | pointer -> `voice_dac_txt_dep_long` |
| 0x401bfbb8 | ptr | pointer -> `voice_dac_txt_dep_short` |
| 0x401bfbc8 | bytes | `00000000` -> `00007f00` |
| 0x401bfbe4 | ptr | pointer -> `voice_dac_txt_res_long` |
| 0x401bfbec | ptr | pointer -> `voice_dac_txt_res_short` |
| 0x401bfbfc | bytes | `00000000` -> `00007f00` |
| 0x401bfc18 | ptr | pointer -> `voice_dac_txt_sus_long` |
| 0x401bfc20 | ptr | pointer -> `voice_dac_txt_sus_short` |
| 0x401c5614 | ptr | pointer -> `voice_dac_txt_pol_long` |
| 0x401c561c | ptr | pointer -> `voice_dac_txt_pol_short` |

core-ar2 0.6 entry (1.4): `core_page_fns` `voice_dac_page_fn` (page 13, DAC FILTER), whose `info`,
`vd_page_info`, answers `page_hpf`, `page_hpf_1p` (no RES, for LP1 and HP1) or `page_hpf_off` (no FRQ
or RES, for TYP OFF) from the selected sound's TYP, in place of 1.3's `core_pages` entry.

core-ar2 0.4 entries (1.3): `core_pages` `voice_dac_page` (page 13, DAC FILTER) and four `core_params` entries, `voice_dac_p5`, `voice_dac_p7`, `voice_dac_p11` (ids 11..14) and `voice_dac_p457` (`vd_param_get`, `vd_param_delta`, `vd_param_text`), in place of 1.2's four detours at the entries of page_info, page_get_value, param_apply_delta and param_value_text. FRQ, RES and TYP text still goes to stock's own ids (`text` returns 2), so filter-hz shows FRQ in Hz as before. `core_view_pages` `voice_dac_view_page` puts DAC FILTER behind the FILTER key (order 20), in place of 1.2's own list for the FILTER view; its `shown`, `vd_shown`, answers DAC SUM, so the key steps over the page while DAC SUM is off, in place of 1.2's own hook on the key's cycle (0x4003ab86).

A detour is a `jmp` site over the whole stock instructions it displaces; the stub re-emits them
as in rytm-mods. Where rytm-mods patched the address operand of a `jsr`/`lea`/`move.l #`, the
site is elemod's `keep2` (the opcode word kept, the address the mod's). A pointer in a data
table is a `ptr` site.

## Changes from rytm-mods

### 1.4: DAC FILTER's knobs follow TYP (rytm-mods-src 3a98e23)

MrScruff's update: with TYP LP1 or HP1, RES's slot on DAC FILTER is empty (no dial, no label, the
knob does nothing), as RES means nothing for the 1-pole types; with TYP OFF, FRQ's is too. The
graph clears the empty-knob marks stock draws in those slots. rytm-mods answers page_info's entry
itself; here the entry comes from core-ar2 0.6's `core_page_fns`, which asks `vd_page_info` on
every page_info call, so the page follows TYP and the selected track at each redraw, as
rytm-mods' does. The graph's code is rytm-mods'. Needs core-ar2 0.6 (`"resources": {"core":
"0.6"}`); 1.3 still links with core 0.6. Storage and the lockfile are unchanged from 1.3.

### 1.3: on core-ar2 0.4's page tables

DAC FILTER's page and its knobs now go through core-ar2 0.4, which owns the entries of the
stock page routines, instead of this mod's own detours there (Sites, above). What the unit shows
and does is unchanged. The reason is that more than one mod can now add a page: with every mod
jumping from the same entries, only one detour per instruction could link. Needs core-ar2 0.4
(`"resources": {"core": "0.4"}`), OS 1.74 only; builds of voice-dac before 1.3 do not link
with core 0.4 (their sites overlap core's), and 1.3 does not link with core 0.3.

- 1.2 keeps the settings in core-ar2's mod storage (above), so its storage code differs from
  rytm-mods 0013's; the rest is unchanged.
- Generated by `tools/port_mod.py`. The code is unchanged; each label a site names gets a
  `.globl` alias carrying the mod id on the line before it, and the stub keeps using its own
  local labels.
- rytm-mods' default build params are fixed with `.equ` (`P_...`), as its build passed them;
  claims and code its diagnostic params select are left out.
- Every section the stub had in separate caves is `.text` here, one `.run` the linker places in
  the DDR mods area.
- 0000-shared's runtime is assembled into the mod, at the end of the unit (`../shared/shared.s`): its references into it, absolute in rytm-mods, are PC-relative here, so the code is a few bytes shorter.

## Test (on a unit)

1. GLOBAL > AUDIO ROUTING > DAC SUM ON. FILTER twice: DAC FILTER.
2. TYP LP2 and FRQ down while a pattern plays: the voice darkens. ATK/SUS shape the hits.
3. DAC SUM OFF: FILTER twice stays on the stock page.
4. Listen for glitches on a busy pattern: the filter runs in the audio interrupt, now from the DDR mods area.
5. (1.2) Set different DAC FILTER values on two tracks (TRK + a pad selects one). SAVE KIT (YES +
   PLAYMODE), change them, KIT > RELOAD: the saved values come back on each track. Change one without
   saving the kit and power-cycle: it is kept. DAC SUM ON, power-cycle: still ON.
6. (1.2) GLOBAL SLOT 2: DAC SUM ON there, back to slot 1: OFF; slot 2 again: ON.
7. (1.2) MIDI CONFIG > CHANNELS: TRACK 1 and TRACK 2 keep their channels across a power cycle with DAC
   SUM on (1.1 overwrote them).
8. (1.2) With lfo-rnd 1.1 in the build: LFO RND and DAC FILTER settings on one sound both survive a
   kit save and reload and a power cycle. The VELOCITY MOD menu reads as on stock.

9. (1.4) DAC FILTER, TYP OFF: no FRQ or RES knob, label or dial, and turning those two knobs does
   nothing. TYP LP2, BP, HP2, BS, PK: FRQ and RES both there. TYP LP1 or HP1: FRQ only, RES's knob
   does nothing. No knob mark left under the graph in any of them.
10. (1.4) BD on LP1, SD on OFF: TRK + SD, then TRK + BD, on DAC FILTER: the page changes with the track.

## Results so far

### 1.4 on core-ar2 0.6

- rytm-emu, OS 1.74, core-ar2 0.6 with all eleven mods (V6A4) against the same mods with voice-dac
  1.3: a 59-screen walk (boot, DAC SUM on, DAC FILTER through every TYP, LFO and FX pages) is
  pixel-identical but for the DAC FILTER screens with TYP OFF, LP1 and HP1, where FRQ/RES and RES
  are empty as intended. RES's knob does nothing on LP1, FRQ's and RES's nothing on OFF, and the
  page follows a switch from BD (LP1) to SD (OFF) and back.
- Hardware, Analog Rytm MKII OS 1.74, 2026-10-23, V6A4 plus the analoghealth test mod for remote
  keys (V6A4 rebuilt byte for byte with it; analoghealth hooks none of core 0.6's or the mods'
  sites): every test step passes. DAC FILTER through every TYP, the empty knobs inert, the page
  following TRK + SD and back, RES kept across LP2, LP1 and LP2, the LFO RND, velocity, euclid and
  COMP preview pages as on U4A4, and BD's DAC FILTER back as saved after SAVE KIT, a power cycle
  and RELOAD. BD on LP2, LP1 and OFF: no dropouts, nothing audible. Not compared with a v1.3
  recording.

### 1.3 on core-ar2 0.4

- rytm-emu, OS 1.74, core-ar2 0.4 with all eleven mods against the v1.2 release build (core 0.3):
  DAC FILTER's page and its knobs, every screen of the same key and knob sequence pixel-identical.
- Hardware, Analog Rytm MKII OS 1.74, 2026-10-21, core-ar2 0.4 with all eleven mods (P4A4, then Q4A4 with the page-key lists): every test step passes. With core's page step (U4A4, and U4M4 with voice-dac and duck only): FILTER stays on FILTER with DAC SUM off, and steps FILTER, DAC FILTER, FILTER with it on, the header naming each page.

1.2 builds for OS 1.74 only: it needs core-ar2 0.3, which has no 1.73 port. Its 1.73 source stays
the porting master, as for every mod here (`tools/port_os.py`).

Hardware, Analog Rytm MKII OS 1.74, 2026-10-20, core-ar2 0.3 with all eleven mods: test steps 1 to 8
pass. DAC FILTER values are kept through kit save and reload, a power-cycle without a kit save, the
+Drive sound library, and a kit sent and received by SysEx and by Overbridge. The VELOCITY and
AFTERTOUCH menus behave as on stock with voice-dac's values in the route bytes.

1.2 (core-ar2 0.3 storage), 2026-10-20: `.run` 10864 B, 34 sites, 36 relocations, imports
`core_store_get`, `core_store_set`, `vd_flt`, `vd_shp`, `vd_dac`; lint OK with core-ar2 0.3 on 1.74 (and
on 1.73 before core 0.3 dropped 1.73), also together with lfo-rnd 1.1 (core 0.3 > lfo-rnd 1.1 > voice-dac 1.2; the lockfile puts
lfo_rnd_cfg at sound bits 0..15, vd_flt at 16..39, vd_shp at 40..54: 55 of 56); with core 0.2 lint
refuses it (needs 0.3). In rytm-emu (dtboot/dtpeek), each on 1.73 and 1.74, with and without lfo-rnd
1.1:

- boots to the main screen as stock does; DAC SUM ON in AUDIO ROUTING sets the active slot's
  `vd_dac` (core's global record, then the stored slot's +0x4b) and `dac_on`; stored globals
  +12..+24 stay stock's (00 01 02 ..); a second global slot keeps its own value and switching slots
  follows it;
- FILTER twice opens DAC FILTER; edits on BD and SD with different values land in each sound's
  fields and in `hpf_track`/`shp_track`; 90 screens of that flow (menu, page, edits, TRK + pad) are
  pixel-identical to voice-dac 1.1 with core-ar2 0.1, and with lfo-rnd to 1.1 + lfo-rnd 1.0 with
  core 0.1; the sound fields hold the same values 1.1 held in its bytes;
- SAVE KIT, edits (FRQ, POL), KIT > RELOAD: the saved values come back on both tracks (frames
  identical to 1.1); an unsaved edit then survives a power-off (power-fail save) and cold boot,
  as does DAC SUM ON, and the caches are refilled after the boot;
- with lfo-rnd: lfo_rnd_cfg and voice-dac's fields on one sound are both kept through kit save and
  reload and a power cycle;
- VELOCITY MOD menu (open, four amount edits, LEFT/RIGHT): 18 screens identical to stock, also on
  a sound whose route low bytes hold voice-dac's fields (edits change the high bytes as stock does;
  the low bytes are kept);
- a card saved by 1.1 (values set, kit saved, power-off) cold-boots in 1.2 with every value at its
  default and DAC SUM OFF;
- 1.73 and 1.74 gave identical screens in every scenario.

Not checked: audio (the emulator's voices cannot be heard; the audio path's code is unchanged and
reads the same caches), hardware, SysEx and Overbridge transfers, the sound pool, copy and paste, a
pattern change to another kit, project load and CREATE NEW (`ev_project` ran at every boot, where it
only clears the caches; its other branch, which reads DAC SUM inside a later load, has not run),
the VELOCITY MOD reset, and CPU cost of the core calls in the idle tick (25 calls a tick).

1.1 (MrScruff's update): `.run` 11424 B, 49 sites, 24 relocations; `tools/verify_port.py` against
rytm-mods-src 76ae299's default build: the re-assembly equals its caves, and 110 of 113 labels match;
the other three differ only in how an address is named, where two of rytm-mods' sections meet
(`hpf_state+64` is `bq_coef` here, `bq_on+8` is `bq_cos`, and `dac_rec` ends at a section's end). Not
yet run on a unit.

1.0:

- Built with elekloader at d17478b and m68k-linux-gnu binutils 2.42: `.run` 11120 B,
  49 sites, 20 relocations; lint OK; links with core-ar2 0.1 and the other ports.
- Against rytm-mods-src's default build (all of its mods at their default params; "T2" below): the original stub, re-assembled
  as rytm-mods' build does, equals T2's caves byte for byte (.text 0x4001976a, .bq 0x40026dfc, .bqt 0x400b1ab4, .shp 0x401b9a72, .shpt 0x400bb15c, .flt 0x400279c4). Each of its 107
  labels was then disassembled in T2 and in the full build with every address named by its label: the
  instructions match (two references to the end of an array, `hpf_state+64` and `bq_on+8`, are named after the next label in one build and the array in the other: the same address in both).
- Every byte the full build changes in the OS is inside one of the ports' sites, every one of these sites is
  patched in T2 too, and the `bytes` sites write exactly T2's bytes.
- rytm-emu (3c4c42c), the full build (core-ar2 with all eleven ports): DAC SUM switched ON, FILTER twice opens DAC FILTER, then 16 MIDI notes and pad hits: the main output and the modelled analog voices recorded sample-for-sample identical to T2 (both differ from stock); all 21 screens pixel-identical to T2.
- Hardware: on an Analog Rytm MKII, 2026-10-14, in the full build (core-ar2 with all eleven ports): DAC SUM on and off, compared by
  ear with rytm-mods' own build: the same on both.
