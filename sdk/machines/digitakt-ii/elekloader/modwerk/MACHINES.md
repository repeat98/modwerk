# Digitakt II machine list (work in progress)

The Digitakt II base will let modules add track machines beside the seven stock types, as `ot_machines` does on the Octatrack and `core_machines` on the Digitakt. The first subscriber is Mikrotakt, a grain sampler. Nothing here is built yet; this file records the plan and the OS 1.17 sites checked so far. Addresses, lengths and behaviour only: no stock bytes.

## Plan

1. **ColdFire side.** A base table `core_machines` (four entries to start) of records naming the machine, its five knob labels, parameter ranges and formatters. The base maps each record to a machine type after the stock ones, so the machine menu lists it, the SRC page draws its knobs and kits save it. Its values live in the track's ten machine-parameter slots (sound slots 25-34), so parameter locks, live recording and the LFO work as on stock machines. A kit that names a type no installed module provides falls back to the stock sample machine.
2. **Sound-chip side.** For a track whose type is an added machine, the voice loop calls the module's routine instead of the stock sample renderer, with the track's sample slot record, its note and its knob values. The stock filter, amp envelope and LFO still process the output. Mono first; stereo is a separate decision.
3. **Mikrotakt** subscribes to both, as its own module pull request.

## Sites checked on OS 1.17 (`Digitakt_II_OS1.17.syx`, SHA-256 `26c22f6652625ac2cfd47f7ee970d388ed8b6427dae3563c0a6a2f2d334350d5`)

Read from the decoded main image (load address `0x40000400`) on 18 November 2026. Static reads only, not yet traced in an emulator.

| Site | What it does | Use |
| --- | --- | --- |
| `0x400c89a4` | Machine descriptor lookup: types 0-6 return a 44-byte record at `0x4293b960 + type * 44`; any other type returns a default record at `0x4293ba68`. Six absolute references (`0x40017cf2`, `0x40042004`, `0x40049b72`, `0x40049fa4`, `0x4006217e`, `0x4006a5ae`). | The base answers added types here, as the Mixer already does for page ids at `0x400c898a`. |
| `0x4293b960` | The seven machine descriptors, built at start-up (`0x401c4aae` and `0x401c515e`/`0x401c519e`). | RAM, not image data. |
| `0x4020f59c` | Parameter table, `0x3c`-byte rows, formatter pointer at row `+0x34`; 53 absolute references, so rows cannot be appended in place. | Added machines' parameter rows need a lookup hook, not a longer table. |
| `0x400da3a2` | Parameter code for (sound slot, machine type): slots 25-34 with a type up to 6 read a per-type table; a higher type returns 0 (no parameter). Six references (`0x4000ffa8`, `0x4003a960`, `0x400430cc`, `0x40050b4c`, `0x40050d1c`, `0x400e650c`). | The base answers the five knob slots for added types here. |
| `0x4005f6bc` | The SRC page view's machine type for the current track (three callers in the SRC view: `0x4001702c`, `0x40017736`, `0x40017bd2`). | Decides the SRC page's second page (sample view) per type. |
| `0x400dab9e`, `0x400dac80` | MIDI CC (up to 127) and NRPN (up to 398) to parameter mapping, five callers each. | Added machines' knobs must answer MIDI like stock knobs. |
| `0x400c89c6` | A second per-type lookup with six entries (bound 5), 44-byte records at `0x4293b858`; callers `0x40041fde`, `0x4006a5d2`, `0x40074888`. | To identify. |
| `0x400c898a` | Page descriptor lookup (ids up to 32, 44-byte records at `0x4293ba94`). | Already the base's (Mixer pages); the machine list must share that entry. |

### The stock descriptor

Start-up code (from `0x401c4aa6`) fills each 44-byte machine descriptor with the machine's name, a second label and eight parameter codes, one per knob A-H, then a final word. SAMPLE's knob C code is 0 (no parameter), as on every stock machine. Each code is a row of the parameter table at `0x4020f59c`, which holds the knob's name, short name, range, default and formatter.

Layout read from the start-up code: `+0x00` the name and `+0x04` the second label (each set by a string routine from a C string), `+0x08` to `+0x24` the eight parameter codes for knobs A-H, `+0x28` a final word.

### The parameter table cannot grow in place

The 275 rows at `0x4020f59c` are image data. 53 absolute references load the table and about 45 bound checks compare a code with 275 (`cmpi.l #0x113`: 24 with `d0`, 2 with `d1`, 10 with `d2`) or 274 (9 with `d0`), many inline. New knob names therefore need the table relocated: a copy in the base's memory with rows appended, a pointer site at each reference and a bytes site at each bound. The Elekloader builder supports both kinds of site (`ptr` and `bytes`, and relocatable data copies). The base owns them all; no module may patch them. First step before that: a test machine whose knobs use stock rows, to prove the descriptor and parameter-code hooks in the emulator.

## The record a module contributes (draft)

One `core_machines` entry per machine:

| Field | Meaning |
| --- | --- |
| name, short name | As the machine menu and the SRC page header show them (stock lengths). |
| five knob rows | Knobs B, C, E, F and G: name, short name, minimum, maximum, default, and a formatter (the stock ones, or the module's). Knob A stays TUNE, D the sample slot, H the track level. |
| sample flag | Whether knob D selects a sample (a sampler) or is unused (a synth). |
| sound-chip routines | Note-on and render for one voice, in the module's sound-chip package, with the voice's note, the five knob values and, for a sampler, its slot record. |

The base gives each entry a machine type after the stock seven in contribution order, answers the descriptor lookup (`0x400c89a4`), the parameter-code lookup (`0x400da3a2`) and the parameter-row reads for those types, and dispatches the voice at `0x1c6550`. Type numbers are saved in kits, so each machine also claims a fixed id on the agent board and keeps it once released, as `core_machines` ids do on the Digitakt.

## Sound-chip sites (SHARC section 7, short-word addresses)

Static reads on 18 November 2026; not yet traced.

| Site | What it does | Use |
| --- | --- | --- |
| `0x1c642a` | The per-voice loop. For each voice it reads the voice's machine type from its record, then dispatches the type's setup. | Where an added machine's voice is handed to its module. |
| `0x1c6550`-`0x1c6579` | The type check and dispatch: a type of 6 or more skips to the shared continuation at `0x1c65fe`; a type below 6 jumps through an eight-byte-stride table at `0x8055c840` (first entry `0x1c65bd`, the sample setup). An added type (7 or more) would take the skip path and get no setup. | The base's site: route added types to `core_machines` before the skip. |
| `0x1c4afe` | Per-voice sample setter, called three times from the loop (`0x1c65f4`, `0x1c6774`, `0x1c6982`) every block: step from note and TUNE, direction, loop flag, START/LEN positions. | What Mikrotakt replaces or reads around. |
| `0x1c3f78` | Sample slot lookup: slot numbers up to `0x400`, 20-byte rows (address fields, length, rate, stereo). Ten callers, including the trigger-time load in `0x1c3289`. | How a module machine finds its sample's memory. |

## Decision: an added machine is its own type

Decided with the developer on 18 November 2026: each added machine gets its own machine type after the stock seven, with its own voice setup, rather than standing in for a stock machine. The base dispatches added types at `0x1c6550`; the module's voice routine loads its sample through the slot lookup at trigger time and renders the voice. A machine that plays a sample keeps knob D as its sample slot, so sample choice works as on stock machines.

## Emulator check of the first hooks (18 November 2026)

Development base `7edbd8bf` (29 sites; `.run` 10,732 bytes, 284 more than base `0e3cbcd0`) with one test machine at type 7 standing for SAMPLE, linked into a private OS 1.17 image (RAM `0x47f00000`-`0x47f050e4`, 241,436 bytes spare; fast SRAM unused). Digikit `panel_persist_probe` booted it, opened track 1's SRC page, set track 1's type byte (`0x4265338e`, active kit `+0x34 + 0xa2`) to 7 and opened SRC again.

- Type 7 with the hooks: the SRC page shows SAMPLE's knobs (TUNE, PLAY, SAMP, LEV; STRT, LEN, LOOP, LEV). No fault.
- Type 7 on base `0e3cbcd0` (control): the SRC page shows the default descriptor's knobs (SLICE, LEN). So the two hooks are what changed the page.
- In both, the header reads ERROR: the machine name comes from another per-type table, still to find.
- Emulator only. Sound not checked (the sound chip still skips type 7).

## Still to check

- The machine name shown in the SRC header and the machine menu.
- The machine menu list (built once at start-up) and the type check in the machine setter (`0x400dcab8`, types above 6 refused).
- Kit and project load: the stock load turns a stored type of 7 or more into 0 (SAMPLE). That is the safe fallback on a unit without the base; with the base installed the load must keep the added types.

- Every reader of the type byte and every per-type table: MIDI CC/NRPN tables, the machine menu list, the per-type parameter-code table, the SRC page view.
- Kit and project save and load of an added type, and the stock OS's behaviour when it loads one.
- The sound chip's per-voice dispatch and the sample slot record it passes.
- Free sound-chip time per block on a real unit, and whether an inactive track's voice still costs time (decides LINK).
