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

## Still to check

- Every reader of the type byte and every per-type table: MIDI CC/NRPN tables, the machine menu list, the per-type parameter-code table, the SRC page view.
- Kit and project save and load of an added type, and the stock OS's behaviour when it loads one.
- The sound chip's per-voice dispatch and the sample slot record it passes.
- Free sound-chip time per block on a real unit, and whether an inactive track's voice still costs time (decides LINK).
