# Proposal: a shared effect slot in the Digitakt II base

Status: proposed for the Digitakt II cumulative base draft (#1999), for owner review. No base code yet. The design was chosen with the developer on 25 November 2026. Implementation, an emulator proof and a unit test image follow the owner's OK.

## Why

Effect modules (a delay, a reverb, a drive, a chorus) have to process audio on the sound chip, and any set of them must run side by side. Today the only way in is the pre-send render site, which Sidechain Comp takes through a private path (`build.dt2_sharc` version 1 and a per-set dispatcher, `planDt2Render`). A second effect at that site would collide with it. The README says the core "exposes no audio-render hook yet". So the base owns the site, and every effect, Sidechain Comp included, takes a slot in a base table. The same goes for the base's machine players and frame receivers ([MACHINES.md](../../sdk/machines/digitakt-ii/elekloader/modwerk/MACHINES.md#the-bases-sound-chip-parts-registries-not-per-set-code-22-november-2026)).

## What the musician gets

- **Track inserts.** An effect works on the tracks the musician lights. It runs after each track's own sound (machine, filter, amp, pan) and before the stock delay, reverb and chorus sends, so the stock sends hear the effected sound. The stock sends and the master compressor stay as they are.
- **One FX page.** The base adds one page to the Mixer, after COMP, listing the installed effects. On it, the musician chooses an effect, lights its tracks with the TRIG keys, and sets up to eight values with knobs A-H. Effects need no screen code of their own. Sidechain Comp keeps its SC and ENV pages, since its sources and destinations need them.
- **Mixer room.** The FX page is the base's own page: it takes none of `core_mixer_pages`' four entries. The base gives it page id 37, past the modules' 33-36. `dt2_mixer_page_list` puts it after COMP (`DT2_MIXER_PAGE_CAPACITY` grows from 9 to 10), and the descriptor and draw lookups answer it before the module table. Only it appears while `core_fx` holds an effect without `DT2_FX_OWN_PAGE`. With Sidechain Comp's two pages, two entries stay free for other modules, and an effect on the shared page needs none. The stock OS has only been shown nine Mixer pages (five stock and four module), so the emulator proof checks that ten navigate and draw.
- **Saved with the project.** The FX page's settings (each effect's tracks and values) are saved by Save Project and come back on load and after a power cycle. They take no kit-data room. An effect with no track lit is off and costs no sound-chip time, so installing one changes nothing until it is switched on.
- **Fixed order.** Tone and drive first, then time effects (delay, reverb, chorus), then dynamics. Sidechain Comp ducks the whole effected sound and still listens to its untouched trigger tracks.

## Stock site

The pre-send render entry already proven by the Sidechain work ([proposal](2026-11-10-digitakt-ii-pre-send-render.md), [probe and unit results](2026-11-14-digitakt-ii-render-probe.md)): OS 1.17, SHARC section 7, short-word PC `0x1c18a6` (loader byte address `0x2838314c`), one 48-bit instruction, SHA-256 `aee4910e66f86ea483231f49e79a3a3c7bfbdecf34024052d36dd87fc34f4fe3`; resume at `0x1c18a9`. It runs once per 32-sample block, before the sends read the sixteen stereo track buffers. Track t's buffer starts at DSP byte address `0x252df8 + 0x100 * t`: 32 left floats, then 32 right.

The base's dispatcher replaces the site in every image built with at least one effect registered. It is fixed code, the same for every set of effects. With no effect registered, section 7 stays stock, as it does today without machines.

## Interfaces

### `core_fx` (table, ColdFire)

Proposed index: `digitakt-ii/tables/6`, after `core_machines`. Room 8. A module contributes one null-terminated pointer to a `const struct dt2_fx`:

```c
struct dt2_fx_value {
    char name[5];        /* four letters and a NUL, drawn above the knob */
    uint8_t max;         /* values 0..max, max <= 127 */
    uint8_t initial;     /* the value in a new project */
    uint8_t reserved;
};

struct dt2_fx {
    uint32_t magic;      /* DT2_FX_MAGIC */
    char tag[4];         /* the module's own tag, for the saved settings */
    uint16_t order;      /* band: 10-39 tone and drive, 40-69 time, 70-99 dynamics */
    uint16_t flags;      /* DT2_FX_LISTEN, DT2_FX_PROCESS, DT2_FX_OWN_PAGE */
    char name[12];       /* the FX page's row */
    uint8_t values;      /* 0-8 values on knobs A-H */
    uint8_t reserved[3];
    struct dt2_fx_value value[8];
};
```

Reader: the base's FX page, its project-archive block and its settings line, in table order. `DT2_FX_OWN_PAGE` leaves an effect off the FX page: it then sets its own tracks and values through `core_fx_set`.

### `core_fx_set` (export, ColdFire)

`void core_fx_set(unsigned int slot, unsigned int index, uint32_t value)`, from the UI task. Index 0-7 is a value. `DT2_FX_TRACKS` (255) is the track mask. The FX page calls it for every effect it shows. An effect with its own page calls it for itself; its slot is its position in `core_fx`, which the base gives it through `core_fx_slot(const struct dt2_fx *)`.

### The settings line, and what it leaves for `ev_audio_frame`

The transfer to the sound chip has room for module words only in its tail. Words 0-15 are free today (Sidechain Comp writes 0-10), and words 16-66 are the base's machine wire. Past word 66 the tail is not free: two words a track there garbled every track's sound ([MACHINES.md](../../sdk/machines/digitakt-ii/elekloader/modwerk/MACHINES.md#the-machine-view-from-the-sound-chip-back-to-the-screen-19-november-2026)). Sixteen words cannot be shared out by reservation among eight effects, so the base takes words 0-15 for one mailbox. Word 0 is a magic and word 1 a sequence number, followed by up to seven `{channel << 8 | index, value}` pairs per transfer. That is about 10,000 values a second at 1,500 transfers a second. When nothing has changed, the base sends the next settings in turn, so the sound chip catches up after a load or a restart. Its frame receiver on the sound chip writes each pair into that channel's settings block. Channels 0-7 are the `core_fx` slots, written through `core_fx_set`. Channels 8-15 are kept for machine players and defined when a player needs one. Words 16-66 stay the machine wire, now sent while any machine or effect is registered, so effects get the tempo and each track's step (`DT2_BASE_SHARC.stepSamples`).

So no tail word is left for a subscriber to reserve, and this change narrows `ev_audio_frame` (event 10) to match. A subscriber may read its arguments and update its own state, and it writes no word of the transfer. A module sends data to the sound chip only through the mailbox. The interface entry's purpose and the machine guide's row say so. The preflight refuses a module's mod file that names the transfer's queue pointer (`0x400cd48c`), as it refuses the raw +Drive write, so a module cannot reach the tail even by address. Today only Sidechain Comp writes tail words (unreleased, it moves to `core_fx_set` here). No library module subscribes to event 10, so nothing released changes.

### Sound-chip slots

A module's package carries its code in `build.dt2_sharc` as for machine players, with an `fx` entry: `{ "listen": pc, "process": pc }` (either may be absent). The base keeps L2 `0x200c3000`-`0x200c4000` for its effect dispatcher, slots, context records and settings blocks. The dispatcher:

1. saves the registers the stock path keeps (R0-R15, I0-I2, I4, M4-M6, L0-L2, ASTATX, STKYX, as the proven probe does, plus I4),
2. calls the eight listen slots, then the eight process slots in band order (the builder sorts them; an empty slot is one RTS). It skips an effect whose track mask is 0,
3. restores, replays the displaced instruction and resumes.

Each call has `I4` at that slot's context record: its track mask, its eight values (0-127, as on its knobs), the block count, the playing flag, the samples per sixteenth at 1X, and the sixteen left and sixteen right buffer pointers. A listen routine reads any track. A process routine changes only the tracks in its mask, in place. A routine may change the registers the dispatcher saved, keeps every other one, never allocates and returns with RTS. Its own state and buffers sit in L2 ranges it claims as dsp-regions. The [SHARC code rules](../../sdk/machines/digitakt-ii/README.md#sharc-code-rules) apply.

### Cost and memory

A block is 32 samples, 1,500 blocks a second, with 666,667 cycles of the 1 GHz sound chip. Stock's busy instructions per block, from the coupled emulator (digikit `sharc-live`, stock OS 1.17 and its stock sound chip, card-ready snapshot of the sidechain test card, panel scripted, 25 November 2026):

| Stock scenario | Busy instructions per block (min / median / max) |
| --- | --- |
| One note on T1 | 1,024 / 208,896 / 212,992 |
| All sixteen TRIG keys pressed at once | 208,896 / 209,920 / 321,536 |
| The same, with T1's FX knobs A-H turned up first | 208,896 / 210,944 / 324,608 |
| The same, with every track's FX knobs A-H turned up first | 208,896 / 221,184 / **342,016** |

Every track sounded (peak 0.69), and the effect tails ran longer with the knobs up. No block was missed, and the sound chip never ran out of idle time. The send effects and the master compressor appear to run in every block whatever their settings: turning the knobs up added at most about 20,000. The master compressor ran at the test project's settings. The emulator's sequencer plays only its first step, so a running pattern was not measured. The knobs took four encoder events each, not their full range. A busier figure on a unit would lower the budget below.

As our own provisional assumption, not yet measured, the Digitakt II sound chip's real cycles are 1.13 (nominal) to 1.41 (high bound) times the emulator's busy instructions. The unit cycle count under "Acceptance before release" replaces this range before the base ships. Stock at its busiest is then 58-72% of the block. The slot budget is what keeps the busiest case under 85% at the high bound: 0.85 × 666,667 / 1.41 − 342,016 ≈ **60,000 busy instructions a block** for all effects together, about 19% at the nominal factor. A quarter of the block (160,000), the first draft's figure, would pass the block at the high bound, so it is dropped.

A package declares its worst case in instructions per block, all sixteen tracks lit. The builder refuses a set whose effects' sum passes 60,000. Machine players and filters share the same budget, counted the same way in the filter proposal (#2180): each counts as its cost over the stock work it replaces, at the voices it can really hold, with nothing else subtracted. A playing stock SAMPLE voice is about 3,600 a block, so a Granula voice at about 17,000 counts about 13,400; a filter counts its cost over its stand-in's case. A new effect aims for the stock reverb's cost ([effects](../module-guides/effects.md#plan-the-dsp-budget-first)). Sidechain Comp's 9,060 fits. The budget is set again from a cycle count on a unit, with stock at its busiest and the slot full, before the base ships. Free L2 is shared with machine players (Granula and Morpha hold ranges above `0x200d0000`). A delay longer than about half a second needs external memory, which is a later base proposal (a shared delay-memory pool), not part of this one.

### Saved settings

One `core_project_archive` block of the base's, tag `FXS1`: per effect its `tag`, track mask and eight values, matched by tag on load. Adding or removing an effect leaves the others' settings in place, and an effect missing from the saved block starts at its initial values with no tracks lit.

## Who patches this site today

Only Sidechain Comp (`digitakt-ii/dt2-sidechain`, the developer's own module, not in the library yet), through `build.dt2_sharc` version 1. It moves to the slot in the same base change: a listen routine for its sources, a process routine in the dynamics band for its destinations, and `core_fx_set` in place of its tail words. Its SC and ENV pages and its archive block stay. `planDt2Render` and the version 1 path are then removed. `digitakt-ii/retro-record` (claimed, a final-output EQ) would need a master site after the sends, which this slot does not cover.

## Later, not in this proposal

- A send and return (a fourth send mixed back before the master compressor) needs a site after the sends, found and proven on a unit first.
- A base filter-type hook (vowel, notch, peak) is a separate proposal.

## Acceptance before release

1. Builder tests with the owner's OS (`MODWERK_DT2_STOCK`): no effect leaves section 7 stock. Two test effects build through the same base code bytes, with only slots and records differing. A set over the budget, a ninth effect, or code outside a package's own allocation is refused.
2. Emulator, coupled ColdFire and sound chip. First, before the rest of the FX page code: ten Mixer pages (stock, FX and four module pages) navigate both ways and draw. The stock OS has only been seen with nine; if it has a fixed limit, the FX page needs another home and the design changes. Then, generated 220 Hz tone on T1 as in the earlier records: the dispatcher with no track lit gives PCM byte-identical to stock. A test effect halving T1 gives -6.02 dB on T1 only. Sidechain Comp through the slot matches its 18 November results. The FX page draws, takes TRIG and knob input, and survives a project save and reload.
3. Unit, OS 1.17, exact image named by SHA-256: boot and playback with nothing lit, the test effect on one track and not another, Sidechain Comp's existing checks, settings after Save Project, reload and a power cycle, and a cycle count with all slots busy.
