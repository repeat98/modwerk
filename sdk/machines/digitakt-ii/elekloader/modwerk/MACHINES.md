# Digitakt II machine list (work in progress)

The Digitakt II base will let modules add track machines beside the seven stock types, as `ot_machines` does on the Octatrack and `core_machines` on the Digitakt. The first subscriber is Mikrotakt, a grain sampler. Nothing here is built yet; this file records the plan and the OS 1.17 sites checked so far. Addresses, lengths and behaviour only: no stock bytes.

## Plan

1. **ColdFire side.** A base table `core_machines` (four entries to start) of records naming the machine and its five knobs. The base maps each record to a machine type after the stock ones, so the machine menu lists it, the SRC page draws its knobs and kits save it. Its values live in the track's ten machine-parameter slots (sound slots 25-34), so parameter locks, live recording and the LFO work as on stock machines. A kit that names a type no installed module provides falls back to the stock sample machine.
2. **Sound-chip side.** For a track whose type is an added machine, the voice loop calls the module's routine instead of the stock sample renderer, with the track's sample slot record, its note and its knob values. The stock filter, amp envelope and LFO still process the output. Mono first; stereo is a separate decision.
3. **Mikrotakt** subscribes to both, as its own module pull request.

## Sites checked on OS 1.17 (`Digitakt_II_OS1.17.syx`, SHA-256 `26c22f6652625ac2cfd47f7ee970d388ed8b6427dae3563c0a6a2f2d334350d5`)

Read from the decoded main image (load address `0x40000400`) on 18 November 2026. Static reads only, not yet traced in an emulator.

| Site | What it does | Use |
| --- | --- | --- |
| `0x400c89a4` | Machine descriptor lookup: types 0-6 return a 44-byte record at `0x4293b960 + type * 44`; any other type returns a default record at `0x4293ba68`. Six absolute references (`0x40017cf2`, `0x40042004`, `0x40049b72`, `0x40049fa4`, `0x4006217e`, `0x4006a5ae`). | The base answers added types here, as the Mixer already does for page ids at `0x400c898a`. |
| `0x4293b960` | The seven machine descriptors, built at start-up (`0x401c4aae` and `0x401c515e`/`0x401c519e`). | RAM, not image data. |
| `0x4020f59c` | Parameter table, `0x3c`-byte rows, formatter pointer at row `+0x34`; 53 absolute references, so rows cannot be appended in place. | Added machines show the stand-in's rows under their own names (see Own knob names); the table keeps its 275 rows. |
| `0x400da3a2` | Parameter code for (sound slot, machine type): slots 25-34 with a type up to 6 read a per-type table; a higher type returns 0 (no parameter). Six references (`0x4000ffa8`, `0x4003a960`, `0x400430cc`, `0x40050b4c`, `0x40050d1c`, `0x400e650c`). | The base answers the five knob slots for added types here. |
| `0x4005f6bc` | The SRC page view's machine type for the current track (three callers in the SRC view: `0x4001702c`, `0x40017736`, `0x40017bd2`). | Decides the SRC page's second page (sample view) per type. |
| `0x400dab9e`, `0x400dac80` | MIDI CC (up to 127) and NRPN (up to 398) to parameter mapping, five callers each. | Added machines' knobs must answer MIDI like stock knobs. |
| `0x400c89c6` | A second per-type lookup with six entries (bound 5), 44-byte records at `0x4293b858`; callers `0x40041fde`, `0x4006a5d2`, `0x40074888`. | To identify. |
| `0x400c898a` | Page descriptor lookup (ids up to 32, 44-byte records at `0x4293ba94`). | Already the base's (Mixer pages); the machine list must share that entry. |

### The stock descriptor

Start-up code (from `0x401c4aa6`) fills each 44-byte machine descriptor with the machine's name, a second label and eight parameter codes, one per knob A-H, then a final word. SAMPLE's knob C code is 0 (no parameter), as on every stock machine. Each code is a row of the parameter table at `0x4020f59c`, which holds the knob's name, short name, range, default and formatter.

Layout read from the start-up code: `+0x00` the name and `+0x04` the second label (each set by a string routine from a C string), `+0x08` to `+0x24` the eight parameter codes for knobs A-H, `+0x28` a final word.

### The parameter table cannot grow in place

The 275 rows at `0x4020f59c` are image data, reached by 56 absolute references and guarded by 56 checks against 275 or 274, and the OS keeps other per-code arrays of 275 entries beside it. An added machine therefore takes no new rows: it shows its stand-in's parameters under its own names (Own knob names, below).

## The record a module contributes (draft)

One `core_machines` entry per machine:

| Field | Meaning |
| --- | --- |
| name, short name | As the machine menu and the SRC page header show them (stock lengths). |
| five knob names | Knobs B, C, E, F and G: name and short name, for the stand-in's parameters at those knobs (range, value and behaviour stay the stand-in's). Knob A stays TUNE, D the sample slot, H the track level. |
| sample flag | Whether knob D selects a sample (a sampler) or is unused (a synth). |
| sound-chip routines | Note-on and render for one voice, in the module's sound-chip package, with the voice's note, the five knob values and, for a sampler, its slot record. |

Each entry names its own fixed machine type (7 to 10), claimed on the agent board as `machine-id digitakt-ii/N` and kept once released, since kits save it (a type that followed contribution order would move when another machine module is added or removed). The base answers the descriptor lookup (`0x400c89a4`), the parameter-code lookup (`0x400da3a2`) and the parameter-row reads for those types, and dispatches the voice at `0x1c6550`. Type numbers are saved in kits, so each machine also claims a fixed id on the agent board and keeps it once released, as `core_machines` ids do on the Digitakt.

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
- **Builder.** `src/engine/elektron/dt2-sharc.ts` now takes further guarded sites beside render and receive (`Dt2RenderPlan.sites`), and `planDt2MachineSelectors` builds the longer selector table as one such site plus an L2 allocation (`combineDt2Plans` merges it with a render plan). Checked locally against OS 1.17: the built section verifies, refuses a selector outside the stock values and a table outside free L2, and packs to an image byte-identical to the one the emulator runs above used. Still open: the browser build does not add a SHARC plan yet (only `scripts/dt2-render-probe.ts` does), so the base's SHARC changes need a place in the build pipeline.
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
| Track 1 forced to type 7, stock sound-chip code | The tone plays at the same level (peak 0.063, RMS 0.04) and the sound chip's register at the type test held 0. **Not valid as a test of type 7:** the fixture wrote only the kit's type byte (`0x4265338e`) and skipped the setter, so the copy the ColdFire sends the sound chip most likely still said 0. Superseded by the next row. |
| Test machine chosen through the menu (FUNC+SRC, DOWN to it, YES twice; scripted panel `SC_SCRIPT`), stock sound-chip code | The tone plays at the same level (peak 0.0628 against 0.0630 for SAMPLE in the same run without the menu steps), but not bit for bit: aligned on the first sound, the difference is 25 dB below the tone. Consistent with the static read below (type 7 takes whatever word follows the stock table) but not proven: a register dump at the lookup during the note is still to do. |
| Track 1 forced to type 7, a local sound-chip detour at `0x1c6553` (type 7 to 0, then the displaced instruction) | Almost silent. The displaced instruction (`compu`) does not write `R0`; `R0` still holds 128.0 from `0x1c6550` and is used after `0x1c6556`. The detour used `R0` as scratch (and left the integer-overflow sticky bits set), which broke the voice. |

What it changes:

- Today an added type plays its sample through whichever stock path the word after the selector table names (types 8 and up read data). That is luck, not design: the base must give every added type a defined selector.
- A machine with its own sound (Mikrotakt's grains) needs the sound chip to tell its voices apart. It can: the ColdFire sends the raw type, and the translation happens on the sound chip (static read, 19 November 2026). In `0x1c24e9`, `M2 = DM(0x255970 + track)` loads the track's raw machine type (`0x1c26d4`), and `S2 = DM(0x2567c0 + type)` (`0x1c273c`, table address set at `0x1c2731`) reads one word per type from a seven-entry table (loader byte `0x282567c0`, 28 bytes) and stores it as the track's selector. Nothing bounds the type, so 7 and up read past the table.
- So the base needs, on the sound chip: a longer selector table in its own L2 (the seven stock words, then one per added type: the word of the stock type the machine stands for) with the address at `0x1c2731` pointed at it, so no added type reads past the table; and a render hook at `0x1c6ae8` that reads the raw type to call an added machine's own render. The builder reads the seven stock words from the owner's verified OS when it composes a build and checks their SHA-256 (`SELECTOR_TABLE_GUARD` in `dt2-sharc.ts`); the repository keeps only the address, length and hash.
- Any sound-chip detour must preserve every register and the sticky status it touches, including registers the displaced instruction only reads (`R0` here).

### A longer selector table on the sound chip (local test, 19 November 2026)

A local emulator-only DSP image changed one instruction: the table base at `0x1c2731` (`I3 = 0x2567c0`, SHA-256 of the six stock bytes `6b6ef0ae...`) now loads `0x8030040`, the normal-word address of a copy in free L2 (loader byte `0x200c0100`): the seven stock words, then SAMPLE's selector for types 7 to 10. Same scripted runs as above, each started from a ready point saved with that DSP image (a saved point carries its own copy of the DSP's code and data, so a run restored from a point saved with the stock image does not see a patch at all):

- Track 1 on SAMPLE: PCM byte-identical to the stock DSP image (`da40d90b...`). The copied table changes nothing for stock types.
- Test machine chosen through the menu: PCM byte-identical to the same run on the stock DSP image (`2129ca6e...`). So the word type 7 reads (past the stock table, SAMPLE's here) is not what makes the test machine differ from SAMPLE by -25 dB; that difference comes from somewhere else (the ColdFire's per-type tables or the parameter values it sends are the next suspects).
- The base still needs the longer table for safety (types 8 and up would read data addresses as selectors); this test shows the relocation itself is harmless.

### The render hook (local test, 19 November 2026)

Facts used: the render pass calls the stock sample voice player once per voice (`CALL 0x1c4ecf` at `0x1c6b00`, a 48-bit type 25a call, SHA-256 of the stock bytes `4e25f0a1...`; `R14` counts the 32 voices down, so the voice is `32 - R14`); voices come in pairs per track (voice `v` belongs to track `v >> 1`); the track's raw machine type is the word `DM(0x255970 + track)` (a register dump of `0x1c273c` showed the lookup's index `M4` running 0-15 over the tracks each block). The stock player returns with `I12 = DM(I6, M7)`, `RETURN` and the return-frame slot (`0x1c4f56`, `0x1c4f7c`-`0x1c4f80`).

A local DSP image pointed that call at a dispatcher in free L2 (code at loader byte `0x200c1000`, data at `0x200c2000`): it saves `R0`, `R1`, `I0`, `M0`, `ASTATX` and `STKYX`, finds the voice's track type through a 32-word voice-to-address table, restores everything and jumps either to the stock player or, for type 7, to a stand-in player that returns at once without writing (silence). Scripted coupled runs from a ready point saved with that image:

- Track 1 on SAMPLE: PCM byte-identical to stock (`da40d90b...`). Every stock voice goes through the dispatcher and plays exactly as before.
- Test machine chosen through the menu: track 1 is silent for both notes (PCM `7a0ecce5...`), no halt, no missing blocks; the same run without the hook plays the tone. The dispatcher picks out the added machine's voices and hands them to their own player, and the render loop carries on after it returns.

In the builder: `planDt2MachinePlayers` in `dt2-sharc.ts` generates the dispatcher for up to four added types (7-10), each with its player's entry, and returns it as a guarded site plus two L2 allocations. With the stand-in player as a separate allocation at the test's address, the built section loads the same bytes as the emulator-tested image at the call site, the dispatcher and its data (it differs only in having the player as a block of its own). It refuses a stock type, more than four players and an entry outside L2.

### The voice player contract (draft)

What an added machine's sound-chip player gets and must do, taken from the stock player it stands in for (`0x1c4ecf`); the parts marked open are still to trace.

- **Entry.** Called once per voice per block (32-sample block, 32 voices) by the render pass, exactly as the stock player: a linked call with the caller's frame (`I6`, `I7`); `R8` holds the address of the voice's output slot (register dump of the stock player on a playing voice: `0x8045b3c0` for voice 0, `0x8045b440` for voice 1), `R4` and `R13` its voice state record, `R14` the voice counter (voice `32 - R14`), `R12` the samples per block (32; see "Grains through the stock player").
- **Registers.** Keep every register the stock player keeps (it saves `R3`, `R5`-`R7`, `R9`-`R11`, `R13`-`R15`, `M1`-`M3`, `B3`, `I0`-`I3`, `I5` in its frame and restores them). Never leave a stock register changed (lesson of the setup detour above).
- **Return.** `I12 = DM(I6, M7)`, then the `RETURN` and return-frame pair, as the stock epilogue (`0x1c4f56`, `0x1c4f7c`-`0x1c4f80`).
- **Output.** 32 samples as 32-bit floats into the slot at `R8`, one word apart (post-modify by 1; a modifier of 4 wrote every fourth word and spilled into the next voices' slots). The stock filter, amp envelope and level then process them.
- **Playing state.** The stock player renders only while the voice's playing bit (state word at `+0x1b8`) is set, and at the end of a sample clears it and fades the last block. Open: how a player that is never "finished" (a held grain cloud) ends with the amp envelope.
- **Cost.** A playing stock voice costs about 3,500 emulator instructions per block. A player should stay near that until the real unit's spare time per block is measured.


### A test tone from an added machine's own player (19 November 2026)

Local DSP image: the dispatcher above with, for type 7, a player that saves the four registers it uses, writes a square wave (16 samples at +0.1, 16 at -0.1) into the slot at `R8`, restores them and returns as the stock player. Test machine chosen through the menu, two trigs on track 1 (scripted coupled run from a ready point saved with that image): the tone appears with each note at 1,498 Hz by zero crossings (expected 1,500: one period per 32-sample block), follows the amp envelope down, peak 0.024 at the output; no halt, no missing blocks. So an added machine's player makes the sound of its voices, and the stock voice chain after it still shapes that sound.

### Grains through the stock player (19 November 2026)

The stock player's arguments (its prologue at `0x1c4ecf` and the render loop at `0x1c6afd`): `R4` is the voice's record (a byte address, `0x2412cc + 0x1d8 * voice`), `R8` the output slot, `R12` the samples per block (32). It renders only when the record's word 0 (the sample address) and word `0x6e` (playing) are nonzero, and writes silence otherwise. Record words (emulator memory dump of voice 0 over 150 blocks of a one-second 48 kHz test sample): `0` sample address (external memory), `1`-`0x40` and `0x45`-`0x50` the player's working state (64 interpolated values per block and history), `0x41`-`0x44` constants, `0x61`/`0x62` length in samples, `0x69` length in words, `0x6a`/`0x6b` step (fraction, words), `0x6c`/`0x6d` play position (fraction, words; one word holds two 16-bit samples, so the position advances 16 per block at the original pitch), `0x6e` playing. A new note starts with words `1`-`0x50` and the position at zero.

So a grain is a record of its own: a copy of the voice's record with its own position, kept in free L2 at a fixed offset from the voice's record, rendered by calling the stock player with `R4` pointing at it. Local test player (type 7, called by the render hook): when a note starts it copies the voice's 118-word record to grain B and sets B's position; every block it re-copies the voice's settings (words `0`, `0x41`-`0x44`, `0x51`-`0x6b`, `0x6f`-`0x75`) but not B's play state, calls the stock player for the voice (into the slot) and for B (into a scratch buffer), and writes a weighted sum into the slot. Scripted coupled runs, test machine through the menu, two notes of a 220 Hz test sample:

- A and B at one half each, B half a second ahead (a whole number of cycles, so in phase): the first half second equals stock; when B reaches the sample's end the level drops to exactly half (peak 0.0464 to 0.0232) for the rest of the note.
- B alone, a quarter second ahead: each note plays as stock and ends a quarter second early (last quarter second silent where stock still sounds).

No halt and no missing blocks; stock voices on other tracks are untouched. The stock player clobbers `R0`-`R2`, `R4`, `R8`, `R12`, `I4`, `I12`, `I13`, `M4`, `B4`, `L3` and `L4`, so a player keeps what it needs across calls in its own memory.

### Where a machine's knob values are (19 November 2026)

- **ColdFire, the kit's values.** Track `t`'s sound is at `0x426532ec + 0x450 * t` (the track's type byte at `+0xa2`). Its machine slots 25-34 are big-endian halfwords from `+0x46` (value << 8): slot 31 (START) at `+0x52`, 32 (LENGTH) at `+0x54`, so 26 at `+0x48`, 27 at `+0x4a`, 33 at `+0x56`. Panel probe: turning knob E and F on the SRC page changed exactly those bytes.
- **Sound chip, per voice.** The voice parameter record (`0xdc` bytes per voice from `0x250738`, byte addresses) holds the SRC values the setup uses: word `0x25` START, `0x26` LENGTH, `0x27` LOOP as floats 0-1, word `0x2a` START and `0x2b` LENGTH as whole numbers, `0x2d` the loop start as a whole number (it followed START when LOOP was 0), `0x28` the crossfade (knob C on an added machine) as a float 0-1 (turned on the test machine's SRC page, base `d26c8874`). PLAY did not change this record (twice). Coupled runs from the same ready point, knobs turned on the SRC page before the note, record dumped at the renderer: these words, and only these, changed. A value that reaches the sound chip with each note, as this one does, is where a trig lock arrives too (not yet tested with a lock).
- **Turning a knob in a coupled run.** Press SRC first, then send separate small encoder events (`enc 5 100` every 2.5 M instructions; encoder 1-8 are knobs A-H). One large turn (`enc 5 1920`, queued as many packets at once) changed nothing. The encoder accelerates: twenty turns of 100 took START from 0 to 119.

### The machine wire: the tempo on the sound chip (19 November 2026)

The base's audio-frame entry first calls `core_machine_frame` (`machine-frame.c`), which writes two frame-tail words after a module's (the sidechain prototype's 0-10): `DT2_MACHINE_WIRE_MAGIC` at word 16, then the samples per sixteenth step at the sequencer's tempo. The tempo is the current pattern's word at `+0x1db70`, in BPM * 120, read while the sequencer's source is the patterns (`0x4316513c == 0x402a1bf8`, the rule seq-note-bridge.c uses); the OS points its active tempo there (`0x400d7f4c`; with another source it uses `0x4316512c`, not handled). Then sixteen words: each track's step at its speed (the pattern's speed, or the track's own in per-track mode, as pulses per step from `0x4020e28c`: 3, 4, 6, 8, 12, 24, 48 for 2X to 1/8X, against 1X's 6). On the sound chip the base takes the receive site (`planDt2MachineWire`): its receiver checks the magic at `DM(16, I3 + 0x804)` (the modifier, not a byte offset: `I3` holds a byte address) and copies the next seventeen words to `DT2_BASE_SHARC.stepSamples` (L2 `0x200c2c20`: the 1X step, then tracks 1-16), which players read; 6,000 until the first frame. In the coupled run all seventeen arrive (7,058 each: every track of the test project at 1X); a changed speed was not tried.

Emulator: the panel probe's project has 14,400 at `+0x1db70` (120 BPM). In the coupled runs (development base `140611`, Mikrotakt composed) the receiver reads the magic every transfer and the step word is a steady 7,058, which is 102 BPM: the same value an earlier version measured from the transport's tick counter (`0x80004880`, 21,600,000 per quarter note), so the coupled test project is most likely at 102 BPM. Not checked by changing the tempo. The base owns the receive site; other consumers of the frame (the sidechain prototype took the site for itself) register in its frame slots instead (below).
### Machine modules' sound-chip parts in the build (19 November 2026)

A machine module carries its player in its package as `build.dt2_sharc` version 2: L2 allocations at fixed addresses (claim each range as a dsp-region), each marked `code` or data, and `{type, entry}` for each machine type it plays. The base keeps L2 `0x200c0100`-`0x200c3000` for its own machine parts. After the kit build, `preflightBuiltFile` (Digitakt II only) and `scripts/link-image.mjs` both call `composeDt2MachineBuild`, so the same stock file, packages and version give the same image: it reads the machines each package registers in `core_machines` (type and stand-in, from the record each entry points at) and every sound-chip part, adds the base's parts and the modules' allocations to section 7, and runs the preflight with that plan. A set that registers no machine and carries no part leaves the kit build as it is: the sound chip stays stock.

### The base's sound-chip parts: registries, not per-set code (22 November 2026)

After review, the base's sound-chip code is the same for every set of modules; what follows the set lives in fixed slots and words:

- **Player registry.** The dispatcher (entries for both render-pass calls) reads the voice's track type and, for types 7-10, jumps through that type's slot at `DT2_BASE_SHARC.playerSlots` (one 48-bit instruction per type). The builder writes `JUMP entry` for a registered player and a jump back to the stock path for an empty slot; a runtime loader can write or clear the same slots later. A player's entry must lie in a code block of its own package (`readDt2SharcPart`), and a package may only play types it registers.
- **Selectors from the machines.** Types 7-10 take the selector of the stock type each registered machine stands for (SAMPLE's for an unregistered type, as kit load turns it into SAMPLE), so a machine with no player of its own plays as its stand-in.
- **Frame receivers.** The base's receiver keeps the receive site, does the machine wire's work only when the frame carries its magic, then calls four frame slots at `DT2_BASE_SHARC.frameSlots` (an empty slot returns at once). A receiver is called with `I3` at the frame and `L0`-`L2` zero, may change `R0`, `R1`, `I0`-`I2`, `M0`, `L0`-`L2`, `ASTATX` and `STKYX`, and returns with `RTS`. A render plan's bridge (`planDt2Render`) is now such a receiver, not the site's owner.
- **Idle without machines.** On the ColdFire, `core_machine_frame` returns at once while `core_machines` is empty: no tail words, no reads of the 16 types, no reply copy. The reply is read only while a module's page has set a view track.

Checked by `src/engine/elekloader/dt2-render-build.test.ts` with the owner's OS (`MODWERK_DT2_STOCK`): an empty set leaves the sound chip stock; a machine with no player gets its stand-in's selector and empty slots; two machines, one with a player, build through the same base code bytes and sites, with only the slots and selector words differing.

Local end-to-end check: OS 1.17, the development base `37b4db44` linked by Elekloader, and a stand-in module part (the silent player at `0x200d0000`, type 7). The composed image passed the preflight: sections 2, 4, 5 and 8 byte for byte stock, section 7 verified against the plan, 36 changed ranges and 11,632 appended bytes in the main OS (the base), flash headroom 1,395,888 bytes. Not yet run in the emulator as a whole file (the emulator runs so far used the DSP images directly).

### Own knob names (19 November 2026)

An added machine's knobs are its stand-in's own parameters, shown under the machine's names. `machine-knobs.c`: the descriptor lookup's entry (`0x400c89a4`) calls `core_machine_knob_names(type)` for every type a page asks for; for an added machine with knob names it points the names of the stand-in's parameter rows at those knobs (row `+0x28` name, `+0x30` short name, in the OS's own table at `0x4020f59c`, which is in RAM) and puts the stock names back when a page asks for any other machine. Knob C, which SAMPLE does not show (its descriptor has code 0 there), gets SAMPLE's crossfade parameter (code `0xcc`, sound slot 27) when a machine standing for SAMPLE names it; the parameter-code lookup answers an added type as its stand-in, which gives slot 27 that same code. Saving, trig locks, live recording, MIDI and the values the sound chip receives are the stand-in's, unchanged. A knob may also name its values (a list indexed by the stand-in's value): the base then points the row's formatter (`+0x34`, called as (value << 8, text out); the stock ones copy their text with `0x40000e82` (out, text)) at a routine for that knob position, which writes the machine's name for the value and calls the stock formatter past the list. Panel probe (development base `57ba35ce`): the test machine's knob B shows its own value name (TFWD for FWD), and SAMPLE's shows FWD again.

Emulator (panel probe, development base `d26c8874`, test machine naming all five knobs): the type-7 SRC page shows TMOD, TSIZ (knob C), TPOS, TLEN and TSPR with the stand-in's knob graphics, a turned knob shows its value, and back on SAMPLE the page shows PLAY, STRT, LEN, LOOP and no knob C again. No fault.

### The machine view: from the sound chip back to the screen (19 November 2026)

The wire's word 34 is the view track (`core_machine_view_track`, which a module's page sets; 16 for none), copied with the step words to `DT2_BASE_SHARC.viewTrack` (L2 `0x200c2c64`). A player posts 32 words about that track's voice at `DT2_BASE_SHARC.view` (`0x200c2c68`; its own magic first, then the track). The receiver copies them into words 600-631 of both reply records (`0x266220`, `0x267220`; stock changes only words 0, 5 and 679), and the next transfer's reply brings them to the ColdFire at `0x8000488c`, the stock call's fourth argument. It arrives as 16-bit units, each word low half first. `core_machine_frame` keeps them in `core_machine_view` (`machine-frame.c`). A first probe that read the reply as the transmit queue's 8-byte entries ran past its 2,748 bytes. A loopback of the receiver's default words read them back intact.

**Knobs at full resolution.** The sound chip's parameter record gets SAMPLE's crossfade (knob C on an added machine, word `0x28`) as 0 or 1 only: a trace while knob C turned during a held note showed 0, then 1.0 at the first detent and nothing after (base `61e5e2ee`). So the wire's words 51-66 carry each track's knob C and E from the ColdFire's parameter targets, `C | E << 16`, each value << 8 (C 0-`0x7f00`, E 0-`0x7800`), copied to `DT2_BASE_SHARC.trackKnobs`. The targets are 71 int16 a track from `0x80003362`, indexed by the parameter rows' sound slot (`+0x04`): a probe of slots 20-47 while knobs C and E turned moved slot 27 (crossfade: `0x0a00`, `0x1400`, `0x3200`, `0x6400`, `0x7f00` under the accelerating encoder) and showed START at 31, LENGTH at 32, LOOP at 33. Two words a track (words 51-82, adding F and G) garbled the sound of every track: the tail past word 66 is not free, so a new wire word needs a probe that the stock audio is unchanged.

Where the screen shows it: of the SRC view's three type calls, `0x40017736` runs in every frame composed while the second page (the sample view) shows, and stops on the first page. Panel probe counts: 144 calls in 71 frames on the second page, none added on the first. The base counts it in `core_machine_sample_views` (`core_machine_sample_view_entry`), so an `ev_draw` handler draws only over a frame that shows the sample view. The waveform spans the whole sample from x 25 to 121, rows 26-54, and `fw_fillrect` counts rows from the bottom.

Emulator, base `2f8a60d2` with Mikrotakt: in a coupled run the reply carried the player's view: track 1, a 24,000-word sample, the play head advancing 32 words a transfer, grains with their positions and window progress. The view track was set, so Mikrotakt's page had seen the sample view. Panel probe with the copy loop bypassed and a fixed view written: the play head and five grain bars are drawn over the waveform on the second page and nothing on the first, and the view track goes back to 16. Not yet seen on a unit.

### The sample list of an added machine (19 November 2026)

First unit run (base `2f8a60d2` with Mikrotakt): on a Mikrotakt track the SRC page's sample list opened but would not scroll or choose. A sample chosen on SAMPLE before switching played as grains. The SRC page reads a per-type byte at `0x401eda30` (the sample slot parameter's code: `0xcd` for SAMPLE) at seven places (`0x40016cec`, `0x40016da6`, `0x40017748`, `0x40017d56`, `0x40017f74`, `0x400183f4`, `0x4001844c`), each `cmp.l type,6` then the table or 0. The base takes each comparison and answers an added machine with its stand-in's byte (`core_machine_sample_slot`, `SLOT_ENTRY`). Panel probe: before, DOWN left a Mikrotakt list on its first row; after, it moves as on SAMPLE, and YES opens ASSIGN SAMPLE. Found by counting the callers of the track-type routine `0x4005063e` that run only while the list scrolls. Other per-type reads remain unchecked: `0x400da4d6` (`0x4020f0cc`, -1 above type 6) and `0x400da4f0`, which has no bound.

Why not new parameter rows (the first attempt, a copy of the table with five rows per added machine, 56 pointer sites and 56 bound checks raised): opening the type-7 SRC page jumped to address 1. The lookup `0x400c892e` returns code `c`'s object at `0x4293c040 + 0x44 * c`, an array of 275 per-code objects in RAM built at start-up; with its bound raised, code 278 read past the array. Of the 56 bound checks, 17 guard arrays other than the parameter table (local disassembly of each), so new codes would need every such array grown. Reusing the stand-in's parameters needs none of them.
## Still to check


- Every reader of the type byte and every per-type table: MIDI CC/NRPN tables, the machine menu list, the per-type parameter-code table, the SRC page view.
- Kit and project save and load of an added type, and the stock OS's behaviour when it loads one.
- The sample slot record the setup passes, and which per-voice flag picks `0x1c5576` over `0x1c4ecf` in the render pass.
- Free sound-chip time per block on a real unit, and whether an inactive track's voice still costs time (decides LINK).
