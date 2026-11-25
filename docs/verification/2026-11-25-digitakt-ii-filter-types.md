# Proposal: module filter types on the Digitakt II's FLTR page

Status: proposed for the Digitakt II cumulative base draft (#1999), for owner review. No base code yet. The design was chosen with the developer on 25 November 2026. Implementation, an emulator proof and a unit test image follow the owner's OK.

## Why

Filter modules (the first two: a vowel/formant filter and a deep notch/ringing peak) need to replace the filter of the voices that use them. The per-voice filter is a voice site on the sound chip, so no module may patch it, and several filter modules must sit side by side. So the base owns the site and gives each filter a record in a base table, as `core_machines` does for track machines ([MACHINES.md](../../sdk/machines/digitakt-ii/elekloader/modwerk/MACHINES.md)).

## What the musician gets

- **New filter types in the stock list.** Each installed filter module adds one type after the six stock ones, under its own name, picked the same way as a stock filter type. The stock types and their sound are unchanged.
- **Its own knob names.** The FLTR page shows the module's names on the three type knobs (FREQ, the second and the third), with the ranges of the stock type it stands for.
- **Stock movement.** The new filter gets the same moving cutoff and second-knob value the stock filter would have used, so the filter envelope, ENV depth, LFO, key tracking, velocity and parameter locks sweep it as they do a stock filter. The base-width filter still runs after it.
- **Saved with the sound.** The type is saved with the kit like a stock filter type. On a build without the module, the sound loads with the stock type its filter stands for, as an added machine loads as SAMPLE.
- **Only its own voices pay.** A voice on a module filter runs that filter instead of the stock one. Voices on stock filters never enter base code.

## Stock sites (OS 1.17, SHA-256 `26c22f6652625ac2cfd47f7ee970d388ed8b6427dae3563c0a6a2f2d334350d5`)

Static reads on 25 November 2026. Addresses, lengths and hashes only.

### The filter types

The parameter table (`0x4020f59c`, 60-byte rows) holds six filter-type groups (row word 0 = 7 to `0xc`), each with three own knobs on sound slots 36, 37 and 35: FREQ and RESO with a continuous TYPE; FREQ and RESO; FREQ, GAIN and Q; FREQ, FDBK and LPF (twice); FREQ, RESO and a three-way TYPE. The envelope, ENV depth, key tracking and base-width rows (group `0xf`) are shared by every type. So a filter type is to slots 35-37 what a machine is to slots 25-34, and an added type can show a stand-in's three rows under its own names, as added machines do.

### ColdFire

- `0x400c89c6`: a per-type lookup with six entries (bound 5) returning 44-byte records at `0x4293b858`, three callers (`0x40041fde`, `0x4006a5d2`, `0x40074888`). By its shape and the six groups above, the filter-type descriptor lookup, the twin of the machine descriptor lookup `0x400c89a4`.
- Still to find, by the method that found the machine sites: the filter-type list getter and setter, the type's name strings, the parameter-code lookup for slots 35-37, and the kit-load check that would turn an unknown type into a stock one. Each will be guarded by SHA-256 in the base, as the machine sites are.

### Sound chip (section 7, short-word PCs, loader byte = `0x28000000 + 2 * PC`)

Pass 3 of the per-voice loop ([trace](../../sdk/machines/digitakt-ii/elekloader/modwerk/MACHINES.md#sound-chip-trace-of-one-sample-voice-18-november-2026)) dispatches every voice's filter:

| PC | What it does |
| --- | --- |
| `0x1c6c0f` | `R2` = the voice's filter type (one word per voice) |
| `0x1c6c10` | compares it, unsigned, with 7 |
| `0x1c6c13` | **the site**: a type of 7 or more jumps to `0x1c6eb7`, past every filter. One 48-bit instruction, loader byte `0x2838d826`, SHA-256 `2321e702bdf2ccdca5e0ca716efa1417ceda63e6e956bb2f2ef6eee3866e39af` |
| `0x1c6c16`-`0x1c6c25` | a type below 7 jumps through a table of case entries; `R8` holds the voice's audio (`DM(I1 + 32)`) |
| `0x1c6c61`-`0x1c6eb6` | the case bodies, which call the stock filter routines |

So on the stock OS a type of 7 or more already plays unfiltered: a module type that reaches the sound chip as itself lands on the site without changing anything for the stock types.

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

Each module filter has its own fixed type number, claimed on the agent board (`filter-id digitakt-ii/N`, 7 to 10) and kept once released, because kits save it. The base answers the descriptor lookup, the names, the list, the parameter codes and the kit-load check for registered types; an unregistered type loads as its stand-in (or the stock default when the base cannot tell), as on the stock OS.

### Sound-chip slots

A module's package carries its filter in `build.dt2_sharc` as machine players do, with `{ "filters": [{ "type": 7, "entry": "label" }] }`. The base keeps L2 `0x200c4000`-`0x200c4800` (after the effect slot's `0x200c3000`-`0x200c4000`) for its filter dispatcher, four slots (one 48-bit instruction each) and four per-voice state areas' pointers. The builder writes `JUMP entry` for a registered filter and a jump to its stand-in's stock case for a type with no code. The site at `0x1c6c13` becomes a jump to the dispatcher only for types 7 or more; types 0-5 take the stock path untouched.

The dispatcher saves the registers the voice loop keeps (the machine work found `R0` live across a nearby test; the set will be read off a register dump before code is written), reads the type in `R2`, and calls the slot. A filter routine:

- gets the voice's audio in place at `R8` (32 floats), its voice number, and pointers to the stock's per-voice cooked values for its stand-in (cutoff after envelope, LFO and key tracking; the second and third knob values), which the base locates by a register and memory dump of the stand-in's case,
- keeps its own per-voice state (32 voices) in an L2 range it claims as a dsp-region, resets it when the voice's note starts (the setup pass's note-on, `0x1c4eaf`),
- keeps every register the dispatcher does not save, never allocates and returns with RTS. The [SHARC code rules](../../sdk/machines/digitakt-ii/README.md#sharc-code-rules) apply.

The dispatcher then resumes at `0x1c6eb7`, where every stock case ends, so the voice goes on to the base-width filter, amp and pan as before.

### Cost

A filter replaces the stock one for its voices, so it is judged against the stock filter's cost per voice per block, to be measured with the stock case's instruction count in the emulator and a cycle count on a unit. A package declares its worst case per voice; the builder refuses a set whose filters exceed the stand-in's cost by more than a factor to be set with the owner after the first measurement. No frame-tail words are used: the filter reads values the stock already sends, so the effect slot's mailbox (words 0-15) and the machine wire (16-66) stay as they are.

## Fit with the effect slot

Different site (effects: pre-send `0x1c18a6`; filters: per-voice dispatch `0x1c6c13`), separate table numbers (6 and 7), separate base L2 ranges, no frame-tail words. An effect hears the voice after its module filter, as after a stock one.

## Who patches this site today

No module on the Digitakt II. On the Digitakt I, draadpiraat's Filters (#1445, draft) adds two types to the FLTR page by its own patch; that machine's base has no filter hook either, and nothing is shared between the two.

## Still to confirm before code

1. That the ColdFire sends a module type (7-10) to the sound chip as itself, or through a translation table to relocate as for machines (`0x1c2731`).
2. Where the stand-in's cooked cutoff and second value live per voice (register and memory dump at its case entry, one coupled run per stock type).
3. The registers live across `0x1c6c13` and at `0x1c6eb7`.
4. The ColdFire sites listed above.

## Acceptance before release

1. Builder tests with the owner's OS (`MODWERK_DT2_STOCK`): no filter registered leaves section 7 stock; two test filters build through the same base code bytes, with only slots differing; a fifth filter, a stock type number or code outside the package's own allocation is refused.
2. Emulator, coupled ColdFire and sound chip, generated test tone and a filter-envelope sweep on T1: every stock filter type gives PCM byte-identical to stock with the base; a test filter ("pass-through, -6 dB") on T1 gives -6.02 dB on T1 only and follows the amp envelope; a sound saved with the test type reloads with it, and loads as its stand-in without the module.
3. Unit, OS 1.17, exact image named by SHA-256: boot and playback on each stock filter type, the test filter on one track and not another, its knob names, save and reload, a build without the module, and a cycle count with 32 voices on the test filter.
