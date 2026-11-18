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
| `0x400c898a` | Page descriptor lookup (ids up to 32, 44-byte records at `0x4293ba94`). | Already the base's (Mixer pages); the machine list must share that entry. |

## Sound-chip sites (SHARC section 7, short-word addresses)

Static reads on 18 November 2026; not yet traced.

| Site | What it does | Use |
| --- | --- | --- |
| `0x1c642a` | The per-voice loop. For each voice it reads the voice's machine type from its record, then dispatches the type's setup. | Where an added machine's voice is handed to its module. |
| `0x1c6550`-`0x1c6579` | The type check and dispatch: a type of 6 or more skips to the shared continuation at `0x1c65fe`; a type below 6 jumps through an eight-byte-stride table at `0x8055c840` (first entry `0x1c65bd`, the sample setup). An added type (7 or more) would take the skip path and get no setup. | The base's site: route added types to `core_machines` before the skip. |
| `0x1c4afe` | Per-voice sample setter, called three times from the loop (`0x1c65f4`, `0x1c6774`, `0x1c6982`) every block: step from note and TUNE, direction, loop flag, START/LEN positions. | What Mikrotakt replaces or reads around. |
| `0x1c3f78` | Sample slot lookup: slot numbers up to `0x400`, 20-byte rows (address fields, length, rate, stereo). Ten callers, including the trigger-time load in `0x1c3289`. | How a module machine finds its sample's memory. |

## Design choice still open

Mikrotakt either stands in for the stock sample machine (the stock setup loads the slot and positions, the module replaces only the playback) or takes its own type with its own setup. Standing in keeps sample choice, the sample view and stock behaviour; its own type gives a clean voice. To decide after a trace in the emulator.

## Still to check

- Every reader of the type byte and every per-type table: MIDI CC/NRPN tables, the machine menu list, the per-type parameter-code table, the SRC page view.
- Kit and project save and load of an added type, and the stock OS's behaviour when it loads one.
- The sound chip's per-voice dispatch and the sample slot record it passes.
- Free sound-chip time per block on a real unit, and whether an inactive track's voice still costs time (decides LINK).
