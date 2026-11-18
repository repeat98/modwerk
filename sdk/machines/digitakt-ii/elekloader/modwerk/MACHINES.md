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

Static reads on 18 November 2026, confirmed by the coupled trace below.

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
- In both, the header read ERROR: the machine strings come from 12-byte records at `0x4020ef78` (name, short name, menu title), read by `0x400da6ac`, `0x400da6d2` and `0x400da6f8`, which return ERROR or ERR above type 6. With those three answered too (development base `4485c4c1`, 32 sites, `.run` 11,050 bytes), the header reads the test machine's name and the knobs are unchanged.
- Emulator only. Sound not checked (the sound chip still skips type 7).

### The machine menu (development base `16de57f4`, 34 sites, `.run` 11,358 bytes)

- The menu's list getter (`0x40052a08`, entered with the result vector in `a0` and one stack argument; two callers) copies a sorted static list of the seven stock types. The base runs it, then appends each added type. The stock buffer it replaces is not freed (a few words, once per list build).
- The permission check (`0x400da514`, type and track class; above type 6 it refuses) answers an added type as the stock type it stands for. The setter (`0x40051712`) then stores the type byte.
- Emulator: FUNC+SRC lists TESTGRAIN after MIDI; DOWN to it and YES twice set track 1's type byte to 7; the SRC header then reads Testgrain. The SRC page opened on its second page (the sample view), whose centre is empty for a type above 6: the view's own type test (`0x4005f6bc` callers) knows only 0-6. Still to fix.

### Saved kits and projects (development base `e31255b2`, 35 sites, `.run` 11,466 bytes)

- Save copies the runtime type byte (sound `+0xa2`) to the stored sound record (`+0xd2`) unchanged (`0x400dbb3c`).
- Load (`0x400db476`) keeps a stored type only if it is 0-6 or `0xff` and turns anything else into 0 (SAMPLE). The base replaces the 16-byte test at `0x400db47a`: it also keeps an added type whose machine is installed. A type with no installed machine still becomes SAMPLE, as on the stock OS.
- Emulator, digikit's persistence card image: choose the test machine for track 1, SAVE PROJECT, set the type byte to 0, LOAD PROJECT. With the hook the type reads 7 again and the SRC page shows the test machine; with the previous development base (`16de57f4`, no load hook) it reads 0. So the project round trip keeps the machine only with the hook. A stock OS opening the same project would load it as SAMPLE (static read; not run).

## Sound-chip hook: design (not built)

- **Site.** The type test in the per-voice loop (short-word PC `0x1c654e`-`0x1c6561`; section-7 byte address `0x28000000 + 2 * PC`, so `0x2838ca9c` onwards). On the sound chip a type of 6 or more skips the per-type setup, but an added type never arrives there as itself (below). The base replaces one 48-bit instruction there with a jump to its machine dispatcher, guarded by SHA-256 like the render and receive sites.
- **Dispatcher.** A base-owned SHARC routine: for a type below 7 it replays the displaced instruction and returns to stock; for an added type with a sound-chip routine it saves the registers the voice loop keeps, calls the module's voice routine with the voice record, and resumes at the shared continuation (`0x1c65fe`) so the stock filter, amp envelope and panning still process the voice.
- **Module routines.** Each machine package carries its sound-chip code in L2 (the free range `0x2001ab7c`-`0x200fa000`, as the render subscribers do) and names a note-on and a render entry; the base keeps a table of them by machine type.
- **Builder.** `src/engine/elektron/dt2-sharc.ts` patches exactly two fixed sites (render and receive). It needs a list of base sites and per-machine allocations, in the same verified way.
- **Traced (below).** The type dispatch only sets a voice up; rendering is a separate pass that does not look at the type. An added type does not reach the sound chip as itself: it arrives as 0 and plays as SAMPLE (emulator check below).

### Sound-chip trace of one SAMPLE voice (18 November 2026)

Coupled emulator run (ColdFire and SHARC together, digikit `sharc_live`, interpreter only: `SHARC_AOT=0`, no fast regions) of the stock OS 1.17 from a card-ready snapshot with one 1 s, 48 kHz mono test tone on the card, `NOTE_EVENTS=trig` (track 1 trig). Register dumps (`SHARC_PCDUMP`) at the sites, then every instruction of the note-on block. The run's audio hash matched the same run with the fast tiers on, so the trace is of the normal behaviour. Emulator only; instruction counts are emulator instructions, not silicon cycles.

The per-voice loop (`0x1c642a`) runs once per 32-sample block and walks 32 voice slots in three passes:

| Pass | What happens | Cost per block |
| --- | --- | --- |
| 1. Setup, `0x1c654c`-`0x1c6ad1` | Per voice: on a trig, the note-on reset `0x1c4eaf` (called at `0x1c6582`, before the type test, so it runs for every type). Then the type test `0x1c6550`-`0x1c6561` (type in `R6`) and the jump at `0x1c6579` through `0x8055c840` (indexed by type; type 0 lands at `0x1c65bd`), which calls the sample setter `0x1c4afe` with the voice state in `R4`. All types meet at `0x1c65fe` for the parameter work that follows (about 530 instructions). | About 1,000 instructions per voice (1,440 on the trig), 33,400 for 32 voices |
| 2. Render, `0x1c6ae8`-`0x1c6b09` | Per voice: a per-voice flag word (bit 1) picks `0x1c5576` or `0x1c4ecf`; the SAMPLE voices took `0x1c4ecf`. It tests the voice's playing bit (state word at `+0x1b8`, test at `0x1c4f21`-`0x1c4f25`) and branches to `0x1c4f81` only when the voice plays: that is how the "uncalled" renderer is reached. No machine-type test in this pass. | 109 instructions for a silent voice, about 3,600 for a playing one |
| 3. Per-voice processing, `0x1c6b0f` onwards | Six routines for every voice slot, playing or not (`0x1cdd8b`, `0x1cb3d8`, `0x1cdecb`, `0x1ccbd8`, `0x1cdbb2`, `0x1cbb57`). The third dispatch at `0x1c6c10`-`0x1c6c19` (value below 7, table `0x8055c874`) reads a different per-voice field (1 for every voice in this kit), not the machine type; probably the filter type. Then `0x1c71ec` once per track (16), then the mix `0x1c308a`. | About 55,500 for 32 voices; 8,100 per 16 tracks; 81,000 for the mix |

- **Records.** Voice parameter record in `I14`, 32 records of `0xdc` bytes from `0x250738`. Voice state record of `0x1d8` bytes from `0x2412cc` (`I15` points `0x188` into it; the setter and the renderer get its start in `R4`).
- **Render path of a playing voice.** `0x1c4f81` reads the sample from external memory (`0x84xxxxxx` in this run) and stages 64 words in the voice state record (loop `0x1c5099`-`0x1c5101`, about 2,500 instructions), then calls the interpolator `0xb80000` (32 iterations of about 27 instructions) and returns through `0x1c4f56`.
- **Output buffer.** Each voice writes its 32 samples, one 32-bit word each, to its own slot of a shared area: voice 0 at `0x8045b3c0`, voice 1 at `0x8045b440`, so `0x8045b3c0 + 0x80 * voice` up to `0x8045c3c0` (pass 3 loads `0x8045c3c0` just after). One trig on track 1 played two voice slots (0 and 1), both rendering for the whole note.
- **Registers across the dispatch.** The continuation at `0x1c65fe` reads, before writing them, the frame and stack (`I6`, `I7`), both voice pointers (`I14`, `I15`), `I0`-`I3`, `I5`, `I8`-`I11`, the modify registers (`M1`-`M3`, `M5`-`M11`, `M13`), `MODE1` and the float registers `F0`, `F1`, `F6`-`F10`, `F12`-`F15`. The type of 6 or more already reaches it straight from `0x1c6561` with what the code before the test left, so the dispatcher's rule is: for an added type, save every register, run the module's setup, restore them all and jump to `0x1c65fe`, exactly like the skip path. The setup leaves its results in the voice state record, as `0x1c4afe` does, not in registers.
- **Cost and budget.** The block is 666,667 instructions (`DSP_PERIOD`); stock with one note used about 199,000 to 211,000 (median busy 210,896; 68% idle). A playing SAMPLE voice costs about 3,500 more per block than a silent one, about 110 per output sample; 32 playing voices would add about 112,000. So an added machine's render can cost about as much as a SAMPLE voice without trouble, but the real unit's cycle count (external memory waits) is still to measure.
- **What this means for the hook.** Two sites, not one: the setup dispatch at `0x1c6550` (an added type gets its own setup, or SAMPLE's when its machine plays samples the stock way) and, for a machine that renders its own sound, the render choice at `0x1c6ae8`-`0x1c6afd`, where the base would call the module's render for an added type's voice and write into the same voice slot at `0x8045b3c0 + 0x80 * voice`. The third dispatch (`0x1c6c10`) is not by machine type and needs nothing.
- **Line input.** Not reached in this trace: the block's own work (passes 1-3 and the mix) reads no input buffer that could be told apart. Finding where the input arrives each block (for a SOURCE = SAMPLE or INPUT setting) needs a run with audio on the input, watching the mix `0x1c308a`.

### Emulator check: an added type on the sound chip (19 November 2026)

Coupled runs (digikit `sharc_live`, `NOTE_EVENTS=trig` on track 1, the sidechain work's test card and DSP state, `SAVE_QUIET_FRAMES=200` so the trig comes after the card's samples have loaded; without that wait every run, stock included, was silent). Development base with the test machine; for the forced runs a local, uncommitted ev_tick fixture kept track 1's type byte at 7.

| Run | Result |
| --- | --- |
| Base, track 1 left on SAMPLE (type 0), stock sound-chip code | The test tone plays; PCM since ready is byte-identical to the stock OS run (`164c7c67...`). The base changes nothing in normal playback. |
| Track 1 forced to type 7, stock sound-chip code | The tone plays at the same level (peak 0.063, RMS 0.04). The sound chip's register at the type test held 0 for every voice: the ColdFire sends the DSP a translated machine value, and type 7 arrives as 0. |
| Track 1 forced to type 7, a local sound-chip detour at `0x1c6553` (type 7 to 0, then the displaced instruction) | Almost silent. The displaced instruction (`compu`) does not write `R0`; `R0` still holds 128.0 from `0x1c6550` and is used after `0x1c6556`. The detour used `R0` as scratch (and left the integer-overflow sticky bits set), which broke the voice. |

What it changes:

- A machine that plays its sample the stock way needs no sound-chip hook: the ColdFire side alone (menu, name, knobs, saving) already gives it working sound in the emulator.
- A machine with its own sound (Mikrotakt's grains) needs the sound chip to tell its voices apart. It can: the ColdFire sends the raw type, and the translation happens on the sound chip (static read, 19 November 2026). In `0x1c24e9`, `M2 = DM(0x255970 + track)` loads the track's raw machine type (`0x1c26d4`), and `S2 = DM(0x2567c0 + type)` (`0x1c273c`, table address set at `0x1c2731`) reads one word per type from a seven-entry table and stores it as the track's selector. A type of 7 reads the word after the table, which held a SAMPLE selector in the run above; higher types read whatever data follows.
- So the base needs, on the sound chip: a longer selector table in its own L2 (the seven stock words, then one per added machine: SAMPLE's for a sample-backed machine) with the address at `0x1c2731` pointed at it, so no added type reads past the table; and a render hook at `0x1c6ae8` that reads the raw type (`DM(0x255970 + track)`) to call an added machine's own render.
- Any sound-chip detour must preserve every register and the sticky status it touches, including registers the displaced instruction only reads (`R0` here).

## Still to check


- Every reader of the type byte and every per-type table: MIDI CC/NRPN tables, the machine menu list, the per-type parameter-code table, the SRC page view.
- Kit and project save and load of an added type, and the stock OS's behaviour when it loads one.
- The sample slot record the setup passes, and which per-voice flag picks `0x1c5576` over `0x1c4ecf` in the render pass.
- Free sound-chip time per block on a real unit, and whether an inactive track's voice still costs time (decides LINK).
