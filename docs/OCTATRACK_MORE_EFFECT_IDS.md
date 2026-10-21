# More than 32 effect ids on the Octatrack

Owner, 11 October 2026: more than 13 module effects at once, and a chooser list longer than 32 entries. What
limits it today and the two ways past it, from a read-only disassembly of stock 1.40C (sha 164f3122…) and
Octabam's notes. **[doc]** Octabam's notes, **[code]** read from the disassembly or source, **[inf]** inferred.
Nothing below has been run on the unit yet.

## What limits it

**The DSP.** One 64-word record holds init[32] at X:0x215 and proc[32] at X:0x235 in both payloads [doc]
(DSP.md §5). A slot's id is `x:(r6+$1b) >> 8` (FX2: `+$1c`), used unmasked [code]. Six two-word instructions
per payload read the tables with a full 24-bit displacement (payload A: proc P:0x4b4, 0x4ce, 0x4ea, 0x504; init
P:0x4cb, 0x501), so the tables can move by rewriting one operand word per site [code]. Stock runs init only when
a slot's id changes [code]. X:0x255 (the Y-buffer bases) and a live ring at X:0x25d-0x3dc follow the tables, so
they cannot grow in place [doc, code]. Candidate room: X:0x08d98-0x08fff (616 words, "unreferenced" in DSP.md §7,
never probed) [doc], but that is the $8000 partition where core 0's ESAI DMA lives, and dense core work there
stalls the DMA (OCTATRACK_HARDWARE_TRAPS.md, reported on an MKI); stock's unreferenced X:$7a92-$7fff in the $6000
block was clean there and is the better home. X above 36K does not work. The base's receiver refuses ids over 31 (`dsp_receiver.asm`
BIND/UNBIND/BYPASS), `dsp_loader.py` hard-codes INIT/PROC 0x215/0x235 and 32, `transfer.c` refuses id >= 32.

**The ColdFire.** FX1_IDS 0x400d5f58 and FX2_IDS 0x400d5fdc (32 entries and a zero word, 7 `lea` sites each),
FX1_ID2POS 0x400d60d0 and ID2POS 0x400d6150 (32 entries, 2 sites each) sit back to back with a code-pointer table
after them [code]. All 18 reads load the Part's id with `mvsb` and index unmasked: ids 32-127 read past the
tables, 128-255 before them [code]. The Part validator 0x40002318 (bank file load 0x4008cea0, battery restore
0x40025770) clamps FX ids to 0-31 (`moveq #31` at 0x400023b6/bc, 0x400023de/e4) and page values to the
descriptor's range [code]. Nothing else is indexed by id: LFO destinations, scenes and parameter locks address
parameter slots 0-29 [doc].

**The Part** (6,322 bytes) keeps FX1 ids at +0x00-07, FX2 at +0x08-0f, page-1 values at +0x11a + 24t, page-2
at +0x2f2 + 30t [doc]. It has no free bytes (PARTS.md §9) [doc]; whatever sits in it travels with save, reload,
paste, clear and track copy [doc, code].

**The base.** Everything per id is 32 wide: dsp.c (dl_catalog, dl_codes, owner*, moving, the uint32 masks),
fxmap.c (32 map entries in battery RAM, the line parser), fxpage.c (lists, pages, serves, wide), the transport's
allocator (DL_PACKAGES 32), manager, buffers and selection (`id > 31`), and the site's 13 custom ids.

## A. Wider ids (up to 127)

Move the DSP's init/proc tables into free X and rewrite the six operands per payload; move the four ColdFire
tables and patch their 18 `lea`s; raise the validator's clamp to the new size; widen every base structure.
Ids stay in the Part, so save, reload, paste, clear and track copy need nothing. The ceiling is 127 (108 module
ids) unless the 20 signed reads change too.

- Opened on stock or an older base, a project's ids of 32 and up are clamped to 31. On stock that is a null
  stub (dry); on an older Modwerk base 31 is a module handle (TapeHead), so the wrong effect would run and be
  saved. Keeping 31 dry in new bases makes the clamp harmless from now on.
- Unproven: the free X region (probe it on the unit across every stock effect and module; not the $8000 block),
  and how the wider
  table is filled at boot (another payload X record, or the receiver copying it at its first frame).

## B. One reserved id dispatching to a second table

Stock's tables stay 32 wide; one id R runs a dispatcher that picks the module from a selector stored in one of
R's page-2 slots (copied with the Part, reaches the DSP in r6+$c-$e, and stock cannot lock or modulate it).

- Each module behind R loses one of its 12 parameter slots, and it collides with PLOCKS P2.
- FX*_IDS[R] (the knob page) has to be swapped for the selected track on every view, and the setter takes its
  defaults from FX*_IDS[id], not from the row picked.
- The validator clamps R's slots to the installed descriptor at load, so it must be made permissive.
- Stock never re-inits when only the selector changes: the dispatcher has to run sub-inits itself, restore
  X:$213 and keep r1, and map instances from r7 (DSP.md §7).
- ID2POS[R] gives one cursor row for every module behind R; the selection guard's no-change test must include
  the selector.

## Recommendation

A. It keeps Part semantics free (the hardest part of B), touches a known, finite set of sites, and the DSP side
is six operand words per payload. First step: prove a home for the tables free on the unit with every stock effect and module
running, preferring X:$7a92-$7fff (the $6000 block) over the ESAI block, then move the DSP tables with 64 ids,
then the ColdFire tables, then widen the base. The dispatch reads are a few per slot a frame, not dense work.

## Decision and plan (owner, 12 October 2026)

**A, with 128 ids: every installed effect module has its own id, up to 128 modules installed** (owner, 12 October
2026: "all the installed modules available on demand, only limited by load"). First decided as 64; then the owner
asked whether 32 would do, since at most 16 effects run at once (8 tracks, two slots; machines take no effect id).
Running effects are not the limit: an id is per effect type, stock keeps 19 of the 32, and each installed effect
module holds one, so today a 14th is refused as FULL whatever runs. Handing ids out only when a project names a
module would cap a project at 13 different module effects; the owner wants none but load. 160 was considered,
then 128 chosen (owner, same day): stock reads the Part's id as a signed byte (`mvs.b`) in at least 26 places,
some through pointers, so ids from 128 up would misread somewhere unfound; below 128 every read is right as it is.
So 128: 19 stock, 109 for effect modules, each with its id from install, as today; machine, MIDI and system modules
take none, up to 128 modules installed.

Everything per id goes behind one constant (`fxids.h`), so the width is a rebuild, not a redesign. The chooser
lists grow with it: the owner's "a longer list than 32 entries" is the lists' row capacity (`modwerk_fx*_list`,
`selection.c`'s row bound, `dsp.c`'s pick row bound), at most one row an id; stock counts a list's rows to its 0,
so no code changes for that. 128 installed modules also needs the loader's live-module cap (`RUNTIME_MODULES`, 32)
at 128 and a larger module pool: about 5 KB a module today, so 768 KiB instead of 256 KiB, taken from sample
memory at boot, and the saved set's buffer (`modset.c`) to match.

An inventory of every 32-wide site (12 October 2026, about 120 sites) found these traps beyond the list above:

- **Masks that alias.** `LIVE_FX[i] & 31u` and `& 31u` on handles (dsp.c, status.c, fxmap.c) would map ids 32-63
  onto 0-31 without a warning. Every id mask (`modwerk_dsp_modules`, `dl_stub_at_boot`, used, dry, keep, held,
  stubbed, the MISSING handles) becomes an id set, and every `& 31` a bound check instead.
- **32 as "no id".** `choose(..., 32u, ...)` for a pinned module and `blame(32u, ...)` for a module without an
  effect: both become the new constant.
- **Wire and reply sizes.** MISSING (request 14) is fixed at 316 bytes, 13 entries; MEMORY MAP (24) at 276. Wider,
  both pass the base's 512-byte reply: they need paging (and lengths that are not whole 64-byte packets).
  The loader report's used and dry masks gain words (78 words at 32 ids, 85 at 128, never a multiple of 16).
  Parsers: `scripts/device.mjs`, `src/engine/elekloader/upload-usb.ts`. The DSP packet's id field is already
  16 bits; a package carries its preferred id in one byte.
- **Battery RAM.** The handle map (`fxmap.c`, 0x100fe000) grows from 780 to 3,084 bytes at 128 ids, still below
  the crash record at 0x100ff800 (checked at compile time); give it a new magic so an old map is dropped on purpose, not by a checksum miss. The
  `#MODWERK_FX=` lines keep their format, the id in decimal (three digits from 100; until the 21 October 2026
  fix the writer printed two, so a handle of 100-127 was not saved); an older base ignores lines with ids of 32 and up.
- **The DSP's saved region** is two words per id at the arena's head (`DL_CODE_START`, `SAVED`, the receiver's
  `#>64`). Only stock's 32 ids have originals to keep: ids from 32 up go back to the null stub, so the region stays
  64 words and the code arena keeps its size. The receiver's `r1+32` (proc = init + 32) becomes the table width.
- **Transport copies.** `allocator`, `manager`, `transfer`, `selection` and `buffers` are Octabam's files, changed
  only by `build_core.py`'s exact-match `DSP_EDITS`; the widening goes there (and `manager.c`'s `[32]`
  declarations are matched by those edits, so both sides change together).

Order, each step host-tested before the next:

1. **On the unit:** prove the tables' new home in X (stock's unreferenced $7a92-$7fff in the $6000 block, not the
   ESAI block) free with every stock effect and module running: a probe base that fills it with a pattern and
   reads it back over USB while effects change. The one step that needs the unit before the rest. **Proven on the
   owner's MKII (12 October 2026):** `build_core.py --dsp-probe X` makes each receiver fill X:$7a92-$7fff with its
   address xor $a5a5a5 (139 words a frame, ending at $8000) and then check 8 words a frame, counting what changed
   (dev request 26, `npm run device -- do xwatch`). With playback, `scripts/octatrack-xwatch.py` picked every
   effect both choosers list on T1 (core 1) and T5 (core 0): 19 stock effects and seven modules (E-Verb, Euclid,
   Air Chorus, TapeHead, Mini Verb, Spectrum, Modulation), 63 picks, 3 refused by the cycle ledger; then the
   self-test ran all seven together. About 11,700 passes over the region on each core: no word changed, no loader
   error, no crash or stall.
2. **The base at N ids** behind `MODWERK_FX_IDS` (32 until step 5): the masks, sentinels and arrays above in
   dsp.c, fxmap.c (new magic), fxpage.c, status.c; MISSING and MEMORY MAP paged; the report's masks widened.
   With N = 32 this changes no behaviour, so the unit's runs so far stay valid. **Done (12 October 2026, S56):**
   `fxids.h` holds the count and an id set of 32-bit words (no 64-bit shifts, so no libgcc); `build_core.py` passes
   `FX_IDS` and emits `modwerk_fx_modules` beside the transport's one-word `modwerk_dsp_modules` (step 3 retires it).
   The handle map keeps 'MWFX' at 32 and takes 'MWF' + the count otherwise. MISSING pages by its first entry (13 a
   page), MEMORY MAP by 32 packages (a stall past the last), the report appends the masks' other words and a pad
   (78 words at 32, 85 at 128, version 12); `device.mjs` and the site's `upload-usb.ts` read all of them. The host
   tests run at 32 and at 128 ids (`test_recipe.py`: a module at handle 40 counts as 40, never as 8). S56 builds
   and draws PROJ > MODWERK in `ot_emu`.
3. **The transport** at N: `DL_PACKAGES`, the manager's per-id loops and masks, `transfer.c`'s and `selection.c`'s
   id bounds. **Done (12 October 2026, S57):** `build_core.py`'s `WIDTH_EDITS`, applied after `DSP_EDITS`: allocator,
   manager, transfer, selection and buffers sized by `MODWERK_FX_IDS`, their masks (keep, named, soft, held,
   stubbed, `dl_stub_at_boot`) id sets; the one-word `modwerk_dsp_modules` is gone. `DL_CODE_START` stays 64 (the
   saved region keeps stock's 32, step 4). At 32 the ColdFire code of selection, buffers and transfer is identical;
   place, parts, advance and dl_residency_tick compile differently, so S57 ran
   `scripts/verify-octatrack-dsp-loader.mjs` under `ot_emu --frame --dsp` (a drum template project staged with
   Octabam's `stage_card.py`): pick, remove, queue, beside and union (Modulation, Spectrum and TapeHead named by an
   inactive Part) all passed. `build_core.py --fx-ids 128` compiles and links the whole base and transport (no image
   kept).
4. **The DSP**: the receiver's id bound and saved region, init and proc tables at the new home (`dsp_loader.py`
   writes them and rewrites the six operand words per payload), ids 32 and up free from the start. **Done (12 October
   2026):** init[ids] and proc[ids] at X:$7a92. No payload record loads that region, so each receiver's first frame
   hook copies stock's 32 entries and puts every later id on the null stub before any effect runs. Stock's six reads
   per payload (`0x0a71d2` and $215 or $235: A P:$4b5-$505, B P:$2aa-$2fa) are repointed, found and counted at build
   time. The saved originals stay at stock's 32: past them BIND keeps nothing and UNBIND and BYPASS put the null stub
   back (a shared null pair). At 32 ids S60 passed pick, remove, queue, beside and union in `ot_emu --dsp`; at 128,
   S61 passed pick and `wide` (14 modules, the last at effect id 32, dispatched from X:$7ab2).
   **On the owner's MKII (S63, 128 ids):** seven modules and seven Mini Verb copies under their own ids
   (`build.py --page-from`): the seventh copy took id 32, picked by id (`device -- do pickid:T5:FX2:32`) on T5 and
   T1 while playing, each core holding its code (`id 32 @441+536`); movestress 40 steps (27 picks, 13 refused by the
   ledger, gaps under 430 us); the self-test with all 14 together (14/14 intact and ran, peaks T1-4 64 %, T5-8 60 %).
   No loader error, crash or stall. The copies were removed afterwards.
   **The handle map across the switch:** the first 128-id boot dropped the 32-id battery map (another magic), and a
   RAM boot restores the project from battery RAM, not the card, so nothing named the project's handles: installs
   took other ids (E-Verb 6) and the project's ran dry. Now a wider base widens a 32-id map in place (the first 32
   entries sit where they sat), and a map no base can read starts from today's catalogue assignments, as a project
   without `#MODWERK_FX=` lines does (fxmap.c `widened`, `seeded`; host-tested at 128). On the unit: S62 (32) seeded
   the unreadable map, S63 (128) widened it, and every module took its catalogue id again.
5. **The ColdFire tables and N = 128**: FX1_IDS, FX2_IDS, FX1_ID2POS and ID2POS copied to 128 entries with their
   18 `lea` sites patched, the Part validator's clamp raised to 127 (four `moveq #31`), the lists' row capacity
   raised. **ColdFire part built (12 October 2026, S59):** `dsp_loader.py choosers()` writes the base's copies of the
   four tables at the base's width (stock's entries; module ids and every id past 31 with NONE and no row) and
   repoints the 18 `lea` operands, found by the tables' addresses and checked to be `lea` (7, 7, 2, 2); stock's own
   tables are no longer patched. The validator's clamp is patched only past 32 ids. The lists are `MODWERK_FX_IDS`
   long; stock counts their rows to the 0. The scripts find the tables through the `lea` operands, so they read
   old and new bases alike. At 32 ids, S59 passed the DSP loader's pick and beside in `ot_emu --dsp`, and the FX2
   chooser opens on the track's effect with its knobs and scrolls. `--fx-ids 128` links. Waits for step 4: the DSP's
   tables, before any id past 31 can run.
6. **128 installed modules**: `RUNTIME_MODULES` 128, the module pool about 768 KiB, the saved set's buffer with it;
   the hook events' cost with many modules measured on the unit. **Built (12 October 2026, S58):** `loader.h` keeps
   32 and 256 KiB as defaults and `build_core.py` raises them for the Octatrack (`RUNTIME_MODULES`,
   `RUNTIME_POOL_BYTES`); modset.c's set buffer follows the pool. The base's RAM grows from about 2.1 to 3.1 MiB,
   taken from sample memory at boot. The self-test's site check masks interrupts a module at a time instead of over
   all of them. The loader's host test fills all 128 slots; S58 boots and passes `pick` in `ot_emu --dsp`. Not yet:
   128 real modules installed, and their tick and key cost, on the unit.
7. **Compatibility:** id 31 stays dry from step 5 on, so a project opened on an older base or stock (which clamp
   to 31) plays dry there instead of running another module. TapeHead's preferred handle moves off 31; the
   project map keeps existing projects on their handles until they are opened on the new base.
   **Changed (owner, 12 October 2026):** TapeHead keeps id 31, so projects real users saved on static firmware
   keep playing it. The edge case: a project with ids above 31 opened where id 31 is TapeHead (an older base,
   static firmware) plays TapeHead in those slots; stock plays them dry. To write into
   [OCTATRACK_MODULE_EDGE_CASES.md](OCTATRACK_MODULE_EDGE_CASES.md).
   **Persistence on the unit (S63, 128 ids, 12 October 2026):** with Mini Verb clones installed at handles up to
   32, a project with T5 FX2 at id 32 was saved (`mapWritten` 5), then RELOAD restored it (RELOAD does not read
   `project.work`, `mapRead` 0), then PROJECT > CHANGE loaded it from the card: `mapRead` 4, `mapGeneration` 3,
   nothing missing, T5 FX2 Mini Verb and core 0 holding `id 32 @441+536`.
   **128 is the default (12 October 2026, `d3f13a60`):** `build_core.py` builds 128 ids unless `--fx-ids 32` asks for
   the old width (kept to bisect). Host tests pass at both widths (`test_recipe.py`, `npm run upload:verify`, the
   runtime loader's). The clones were gone before anyone removed them: the unit had restarted onto the flashed
   `usbtest9` (cause unknown), and the next base refused S63's card set as another base's, so nothing was installed.
   **What that restart did to the project:** bank B Part 2's working copy held T5 FX2 at id 31 (TapeHead's handle),
   where the S63 run had left the Mini Verb copy at id 32; its saved copy says DELAY. `usbtest9`'s Part validator
   clamps ids above 31 to 31 (the battery restore runs it), and the clamped byte stayed when the 128-id base came
   back: the edge case of step 7 on the unit, in the working copy, without a save. RELOAD could not undo it after the
   RAM boot (SAVE PART FIRST!); the Part was left so (a scratch project).
8. **On the unit:** more than 13 module effects at once on both cores, a project saved with ids above 31 opened
   on the old flashed base (dry, nothing else running), the edge-case runs again.

