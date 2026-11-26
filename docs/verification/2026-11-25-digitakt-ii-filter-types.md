# Proposal: module filter types on the Digitakt II's FLTR page

Status: design approved by the owner on 25 November 2026 (types in the stock list, one type per module, stock movement, the per-voice site at `0x1c6c13`, `tables/7`), with four points folded in below: the official OS must open these kits, the fallback is the stock default, one budget per block, and how a fifth filter gets its number. No base code yet; the open points below come first.

## Why

Filter modules (the first two: a vowel/formant filter and a deep notch/ringing peak) need to replace the filter of the voices that use them. The per-voice filter is a voice site on the sound chip, so no module may patch it, and several filter modules must sit side by side. So the base owns the site and gives each filter a record in a base table, as `core_machines` does for track machines ([MACHINES.md](../../sdk/machines/digitakt-ii/elekloader/modwerk/MACHINES.md)).

## What the musician gets

- **New filter types in the stock list.** Each installed filter module adds one type after the six stock ones, under its own name, picked the same way as a stock filter type. The stock types and their sound are unchanged.
- **Its own knob names.** The FLTR page shows the module's names on the three type knobs (FREQ, the second and the third), with the ranges of the stock type it stands for.
- **Stock movement.** The new filter gets the same moving cutoff and second-knob value the stock filter would have used, so the filter envelope, ENV depth, LFO, key tracking, velocity and parameter locks sweep it as they do a stock filter. The base-width filter still runs after it.
- **Saved with the sound.** The type is saved with the kit like a stock filter type. On a build without the module, and on the official OS, the sound loads with the stock default filter type (type 0), because the stand-in lives only in the module's record. The official OS's own load check already does this (below).
- **Only its own voices pay.** A voice on a module filter runs that filter instead of the stock one. Voices on stock filters never enter base code.

## Stock sites (OS 1.17, SHA-256 `26c22f6652625ac2cfd47f7ee970d388ed8b6427dae3563c0a6a2f2d334350d5`)

Static reads on 25 November 2026. Addresses, lengths and hashes only.

### The filter types

The parameter table (`0x4020f59c`, 60-byte rows) holds six filter-type groups (row word 0 = 7 to `0xc`), each with three own knobs on sound slots 36, 37 and 35: FREQ and RESO with a continuous TYPE; FREQ and RESO; FREQ, GAIN and Q; FREQ, FDBK and LPF (twice); FREQ, RESO and a three-way TYPE. The envelope, ENV depth, key tracking and base-width rows (group `0xf`) are shared by every type. So a filter type is to slots 35-37 what a machine is to slots 25-34, and an added type can show a stand-in's three rows under its own names, as added machines do.

### ColdFire

- `0x400c89c6`: a per-type lookup with six entries (bound 5) returning 44-byte records at `0x4293b858`, three callers (`0x40041fde`, `0x4006a5d2`, `0x40074888`). By its shape and the six groups above, the filter-type descriptor lookup, the twin of the machine descriptor lookup `0x400c89a4`.
- The filter type is the byte after the machine type in each track's sound (`+0xa3`; the machine type is `+0xa2`), read by `0x400506ac`, the twin of the machine-type reader `0x4005063e`. Track t's views reach it through `0x400362be` (sound at `+0x6c + 0x3c0 * t` of the view's object), the twin of `0x40036266`. All three callers above pass that byte to the lookup.
- **Kit load.** In the sound loader `0x400db476`, right after the machine type's check, `0x400db48e`-`0x400db4a5` copies the stored filter type (stored sound `+0xd3`) to the runtime sound (`+0xa3`). It keeps it only if it is 0-5 or `0xff` (`(type + 1) & 0xff` below 7) and stores 0 otherwise. So the official OS 1.17 opens a kit saved with type 7 with the stock default filter, by the same code path that turns an unknown machine into SAMPLE. The base replaces the 16 bytes at `0x400db492` (SHA-256 `3f7c0914e158f38eeed2b22d145a76b742f97bf1cbed7f18de2fcc310a1a6c2a`) to also keep a registered module type, as it does for machines at `0x400db47a`. An unregistered type still loads as 0.
- Still to find, by the method that found the machine sites: the filter-type list getter and setter, the type's name strings and the parameter-code lookup for slots 35-37. Each will be guarded by SHA-256 in the base, as the machine sites are.

### Sound chip (section 7, short-word PCs, loader byte = `0x28000000 + 2 * PC`)

**From track type to voice field.** As for machine types, the sound chip receives each track's raw filter type (`M0 = DM(0x255990 + track)`, `0x1c26c5`) and translates it through a table at DM `0x2567a0` (base loaded at `0x1c26df`, one 48-bit instruction, loader byte `0x28384dbe`, SHA-256 `3a695e102cc6d47f610f4884407ddf01bff13903ab77f02a5d9635cc127ef12d`). The table maps raw types 0-5 to the voice field 1, 3, 2, 4, 5, 6. Raw 3 and 5 map to the same filter routine, matching the two comb types' identical knobs. Nothing bounds the index: raw 6 to 8 read 0 (no filter), raw 9 and 10 read 1 and 2. So, as for machines, the base points `0x1c26df` at a longer table in its own L2: the six stock words, then the field equal to the type itself for every registered module type (7 or more), so they reach the site below and nothing else.

Pass 3 of the per-voice loop ([trace](../../sdk/machines/digitakt-ii/elekloader/modwerk/MACHINES.md#sound-chip-trace-of-one-sample-voice-18-november-2026)) dispatches every voice's filter:

| PC | What it does |
| --- | --- |
| `0x1c6c0f` | `R2` = the voice's filter type (one word per voice) |
| `0x1c6c10` | compares it, unsigned, with 7 |
| `0x1c6c13` | **the site**: a type of 7 or more jumps to `0x1c6eb7`, past every filter. One 48-bit instruction, loader byte `0x2838d826`, SHA-256 `2321e702bdf2ccdca5e0ca716efa1417ceda63e6e956bb2f2ef6eee3866e39af` |
| `0x1c6c16`-`0x1c6c25` | a field below 7 jumps through a seven-entry case table; `I3` holds the voice's audio (`DM(I1 + 32)`) |
| cases | field 0: no filter (straight to `0x1c6eb7`); 1: `0x1cdbb2`; 2: `0x1cd286`; 3: `0x1cc79e`; 4 and 6: `0x1cbf07`; 5: `0x1ccd96` and a mix. Each case calls its routine like a compiled function (`R4` the voice's state for that filter, `R8` or `R12` the audio, `R15` saved around the call) and jumps to `0x1c6eb7` |
| `0x1c6eb7` | the loop's tail: next voice, each filter's state pointer advanced by its own stride |

So a module type mapped to a field of 7 or more lands on the site without changing anything for the stock types.

## Interfaces

### `core_filters` (table, ColdFire)

Proposed index: `digitakt-ii/tables/7`, after `core_fx` (tables/6, the effect slot proposal in #2146). Room 4. A module contributes one null-terminated pointer to a `const struct dt2_filter`:

```c
struct dt2_filter_knob {
    char name[16];       /* as the parameter's long name */
    char short_name[6];  /* as on the FLTR page */
    uint8_t reserved[2];
};

struct dt2_filter {
    uint32_t magic;      /* DT2_FILTER_MAGIC */
    uint8_t type;        /* fixed filter type 7-10, claimed as filter:<type>, saved with kits */
    uint8_t stands_for;  /* stock type 0-5 whose rows, ranges and per-voice values it borrows */
    uint8_t reserved[2];
    char name[12];       /* the filter-type list and FLTR header */
    char short_name[6];
    uint8_t reserved2[2];
    struct dt2_filter_knob knob[3]; /* FREQ, second, third; an empty name keeps the stand-in's */
};
```

Each module filter has its own fixed type number, claimed on the agent board and kept once released, because kits save it, so it needs the same protection as a machine id. The base code adds a board kind `filter-id` (`filter-id digitakt-ii/N`, in `KINDS` in `scripts/agent-board.mjs`), and `pr:ready` detects a package's new `filter:<type>` the way it detects a new `machine:<id>`. Until that kind exists, types 7 and 8 for the first two filters are claimed by hand as `machine-id` claims named `digitakt-ii/filter-7` and `digitakt-ii/filter-8`. Numbers start at 7 and have no fixed end below 127 (the stored byte is signed, and `0xff` means "none"): the fifth filter module claims 11, the sixth 12, and so on. Room 4 limits how many filters are installed together, not which numbers exist, so a fifth module only needs the room raised in a base update, and its type number never moves. The base's sound-chip table covers types up to the highest registered number. The base answers the descriptor lookup, the names, the list, the parameter codes and the kit-load check for registered types. An unregistered type loads as the stock default (type 0), as on the official OS.

### Sound-chip slots

A module's package carries its filter in `build.dt2_sharc` as machine players do, with `{ "filters": [{ "type": 7, "entry": "label" }] }`. The base keeps L2 `0x200c4000`-`0x200c4800` (after the effect slot's `0x200c3000`-`0x200c4000`) for its filter dispatcher, four slots (one 48-bit instruction each) and four per-voice state areas' pointers. The builder writes `JUMP entry` for a registered filter and a jump to its stand-in's stock case for a type with no code. The site at `0x1c6c13` becomes a jump to the dispatcher only for types 7 or more; types 0-5 take the stock path untouched.

The dispatcher saves the registers the voice loop keeps (the machine work found `R0` live across a nearby test; the set will be read off a register dump before code is written), reads the type in `R2`, and calls the slot. A filter routine:

- gets the voice's audio in place at `R8` (32 floats), its voice number, and pointers to the stock's per-voice cooked values for its stand-in (cutoff after envelope, LFO and key tracking; the second and third knob values), which the base locates by a register and memory dump of the stand-in's case,
- keeps its own per-voice state (32 voices) in an L2 range it claims as a dsp-region, resets it when the voice's note starts (the setup pass's note-on, `0x1c4eaf`),
- keeps every register the dispatcher does not save, never allocates and returns with RTS. The [SHARC code rules](../../sdk/machines/digitakt-ii/README.md#sharc-code-rules) apply.

The dispatcher then resumes at `0x1c6eb7`, where every stock case ends, so the voice goes on to the base-width filter, amp and pan as before.

### Cost

A filter replaces the stock one for its voices. **One budget per block** covers everything modules add to the sound chip: machine renders, filters and effects run in the same block, so the builder counts them against one figure, the effect slot's cap (60,000 instructions a block for now, set again after a unit cycle count). A package declares its worst case per voice for a filter or a machine and per block for an effect. The builder counts a machine or a filter as its cost over the stock work it replaces (a playing stock SAMPLE voice, about 3,600 a block, for a machine; the stand-in's filter case for a filter), at the voices it can really hold, adds every effect, and refuses a set over the figure. The effect slot proposal (#2146) counts it the same way. No frame-tail words are used: the filter reads values the stock already sends, so the effect slot's mailbox (words 0-15) and the machine wire (16-66) stay as they are.

## Fit with the effect slot

Different site (effects: pre-send `0x1c18a6`; filters: per-voice dispatch `0x1c6c13`), separate table numbers (6 and 7), separate base L2 ranges, no frame-tail words. An effect hears the voice after its module filter, as after a stock one.

## Who patches this site today

No module on the Digitakt II. On the Digitakt I, draadpiraat's Filters (#1445, draft) adds two types to the FLTR page by its own patch; that machine's base has no filter hook either, and nothing is shared between the two.

## Still to confirm before code

1. In a coupled run: that `DM(0x255990 + track)` follows the FLTR type the musician picks, and the field each stock type gives. A first scripted run (25 November, FUNC+FLTR, DOWN, YES twice, then a trig) left every voice's field at 1, the default type's, so that key sequence did not change the type; the next run picks it by the path the OS's list really uses.
2. Where the stand-in's cooked cutoff and second value live per voice: inside each filter's own per-voice state (`R4` at its case). Whether that state is updated for a voice on another type decides whether a module filter reads it there or the base computes it.
3. Registers: the stock cases call their routine as a compiled function, so the module routine's contract is the same (keep the compiler's preserved registers, `R15` saved by the caller); `R0` holds the comparison from `0x1c6c10` when the branch is taken.
4. The ColdFire list, names and parameter-code sites.

## Acceptance before release

1. Builder tests with the owner's OS (`MODWERK_DT2_STOCK`): no filter registered leaves section 7 stock; two test filters build through the same base code bytes, with only slots differing; a fifth installed filter, a stock type number or code outside the package's own allocation is refused; a set whose machines, filters and effects together pass the one budget is refused.
2. **The official OS opens these kits.** Emulator now, unit before release: a kit saved with a module filter (type 7) opens on stock OS 1.17 without a fault, with the stock default filter type, and the rest of the kit as saved.
3. Emulator, coupled ColdFire and sound chip, generated test tone and a filter-envelope sweep on T1: every stock filter type gives PCM byte-identical to stock with the base; a test filter ("pass-through, -6 dB") on T1 gives -6.02 dB on T1 only and follows the amp envelope; a sound saved with the test type reloads with it, and loads with the stock default filter type (type 0) without the module.
4. Unit, OS 1.17, exact image named by SHA-256: boot and playback on each stock filter type, the test filter on one track and not another, its knob names, save and reload, the saved project on a build without the module and on the official OS, and a cycle count with 32 voices on the test filter.
