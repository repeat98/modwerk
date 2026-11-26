# Digitakt II SDK

Digitakt II is in preview for stock OS 1.17. The browser uses the pinned Modwerk base and supports local builds with library modules. Downloads stay disabled.

## Modwerk stack

The browser builds on Modwerk's pinned 1.1 base. The Digitakt II follows the Octatrack's stack ([recipe](../../../docs/MACHINE_RECIPE.md)): a Modwerk base started from that core's source, which takes the hooks mods propose, then a USB link, the loader's glue, base updates over USB, the MCP's device tools and the machine page. [GOAL.md](GOAL.md) sets out the order, where each piece stands and how contributors take one.

The [Modwerk base](elekloader/README.md) adds the audio sequencer pitch and phrase hooks and active-project lifecycle to the pinned core 1.1 source. The 1.1 additions below give mods per-frame parameter values, key LEDs and per-project and per-kit data.

## Core hooks

The [core contract](../../digitakt-ii/core-profile/interface.json) describes the UI and sequencer hooks supplied by the Modwerk base. A mod that needs one of those sites proposes a core hook first and never patches the site itself ([propose a hook](../../../docs/module-guides/README.md#propose-a-hook-on-the-digitakt-digitone-or-digitakt-ii)); the hook goes into the Digitakt II's Modwerk base ([Modwerk stack](#modwerk-stack)).

The core subscribes mods to these ColdFire/UI hooks:

| Hook | Handler | Use |
| --- | --- | --- |
| `ev_tick` | `void f(void *ctrl)` | UI compose check, approximately 30 Hz. Set `ctrl + 0x20` to 1 to request redraw. This is not an audio-rate clock. |
| `ev_draw` | `void f(void *bmp, void *ctrl)` | Draw after the OS composes its 128x64 screen. |
| `ev_key` | `int f(void *brain, void *event)` | Inspect or consume a key event; nonzero consumes it. |
| `ev_enc` | `int f(void *brain, void *event)` | Inspect or consume an encoder event; nonzero consumes it. |
| `ev_settings` | `void f(void *menu)` | Add rows while the SETTINGS menu is built. |
| `ev_personalize` | `void f(void *menu)` | Add rows while PERSONALIZE is built. |

### Core 1.1 additions

These are in [core-profile/interface.json](../../digitakt-ii/core-profile/interface.json) marked `since` 1.1, and in the base source above. Modules that use these entries target core 1.1.

| Entry | What | Handler or record |
| --- | --- | --- |
| `ev_frame_params` | each frame's per-track parameter values, once a frame in the frame interrupt, before the stock modulators add theirs | `void f(int16_t *values, int stride)`; track t's value j at `values[stride * t + j]`, stride 71; add to it, held in the parameter's range |
| `ev_key_leds` | the key-LED frame, every UI frame, after the frame clears the LEDs and before the stock views set theirs | `void f(void *mgr)`; set an LED with `fw_led_set(mgr, logical, 2, value)`; the first setter wins |
| `core_projdata` | a mod's block in the project file's header gap, saved with every project save and loaded back | table of `core_projdata_t {tag[4], size, data, loaded}`, four entries; claim `projdata:<tag>` |
| `core_kitdata` | a mod's block per kit (128), after each kit record's end mark; saved with the project and SAVE KIT and carried through pattern copy and paste, PASTE KIT and undo | table of `core_kitdata_t {tag[4], size, data, changed}`, four entries; claim `kitdata:<tag>` |
| `core_addvalue`, `fw_*` | a value row for PERSONALIZE or SETTINGS drawn like LED INTENSITY, and firmware drawing and LED routines by address | upstream `digitakt-mk2/core.h` and Modwerk's `mk2/core.h` |

One of those routines is not available to a module: `fw_card_write`, the raw block write to the +Drive, writes under the mounted file system, where one wrong block costs a musician projects and samples, so the [preflight](#build-and-recovery) refuses a build whose mod file refers to it by name or names its address, and a module keeps its data in the project and its kits (`core_projdata`, `core_kitdata`).

By the core's documentation (emulator-tested, not hardware-tested), both data areas hold bytes the stock OS writes as zeros and never reads, so a project saved with mods loads on the stock OS, which keeps them when it saves a project it loaded. Core writes them only over zeros or its own data and counts anything else in `core_store_conflicts`. **Kit data that changes alone is saved.** Core writes a kit's mod data when the OS writes that kit's record, so a change to a mod's own block alone (a module setting, no stock parameter touched) would be lost if OS 1.17 wrote only the kits the musician changed. On 25 November 2026, Claptom-music ran the check on a Digitakt II with image `8472296a8686e5484c1ba8ba1b54e6e6119776f2adfe5a6bdedba7ccfdd08dd3` (base `8650bb8a` and Euclidean Scale 0.2.0-experimental). They changed only Euclidean Scale's HI on A01 from +1 to +2, did SAVE PROJECT, loaded another project and this one again: HI read +2. With a stock filter cutoff on A01 nudged and set back and HI at +3, it read +3. With only HI changed again, to +1, it read +1. SAVE PROJECT writes a module-only change to the kit, so a musician needs no stock change before saving. **A kit record has room for 143 bytes of kit data in all** (`core_kitdata_room()`), shared by every mod's block. Core 1.1 gives it 191, but the Modwerk base keeps the record's last 48 bytes for its project archive, so its copy of core's recipe ends the kit data there (`npm run check` refuses an overlap). One mod with a 143-byte block takes all of it and leaves any other kit-data mod out, so per-kit state that several modules will want belongs to the base, as one record per module in a table the base owns ([recipe](../../../docs/MACHINE_RECIPE.md#rules)), not to the first module that asks for the room.

**Linked voices are the base's.** SETTINGS > VOICES lets a lead track play its notes on the tracks after it, for every machine, stock or added ([VOICES.md](elekloader/modwerk/VOICES.md)). A machine module that wants polyphony relies on it and never allocates voices across tracks itself; a voice track plays its lead's machine, and the machine wire gives it the lead's type.

The Digitakt II core does not start DTIM0 and exposes no audio-render hook yet ([proposal and emulator measurements](../../../docs/verification/2026-11-10-digitakt-ii-pre-send-render.md)). Audio is rendered by the separate SHARC DSP; these hooks are not sample-accurate.
The [guarded render probe](../../../docs/verification/2026-11-14-digitakt-ii-render-probe.md) records the local OS 1.17 build and dispatcher test.
**Effects wait for the base's effect slot.** An effect module (delay, reverb, drive) does not patch the render site: the [effect slot proposal](../../../docs/verification/2026-11-25-digitakt-ii-fx-slot.md) gives every effect, Sidechain Comp included, a slot in the base table `core_fx` with track inserts before the stock sends and one shared FX page in the Mixer. The owner approved its design on 26 November 2026; the base code follows.
**Filters wait for the base's filter types.** A filter module does not patch the per-voice filter on the sound chip: the [filter-type proposal](../../../docs/verification/2026-11-25-digitakt-ii-filter-types.md) lists module filters after the stock types on the FLTR page (base table `core_filters`), each standing in for a stock type's knobs and movement. The owner approved its design on 25 November 2026; the base code follows.

The proposed Mixer and frame interfaces are declared in [core-profile/interface.json](../../digitakt-ii/core-profile/interface.json).

| Interface | Timing, order and room | Arguments and permitted writes |
| --- | --- | --- |
| `core_mixer_pages` | The UI reads the collection when building the Mixer cycle and draws the active registered page. Up to four entries follow COMP, lowest contribution order first. Ties use module ID and contribution order. | Each entry points to a native page descriptor and `void draw(void *view, void *bitmap)`. Draw into the supplied bitmap and update module-owned state. The borrowed view and stock navigation state are read-only. |
| `ev_audio_frame` | ColdFire calls up to four handlers immediately before the stock DSP transfer. Lower subscription order runs first. Ties use module ID and contribution order. | `void f(unsigned int data_bytes, const void *data, unsigned int frame_bytes, const void *reply)` receives the stock transfer arguments. Write only module-owned state and explicitly reserved DSP frame-tail data words. Preserve stock data, commands and reply storage. The pointers are valid for the call. Keep the callback allocation-free and nonblocking. |

Find a screen from the frame the OS has just drawn, not from UI object pointers: digikit fills some that stay 0 on the unit (the view controller's page set at `+0x9c` on OS 1.17), so a mod that follows them works in the emulator and never on hardware. [Track Names](../../digitakt-ii/modules/track-names/) recognises the mixer this way.

### SHARC code rules

A machine module's sound-chip player is a `.sharc` source named by `build.sharc` in its `build.json` (`{ "source": "src/player.sharc", "players": [{ "type": 7, "entry": "label" }] }`, each type claimed as `machine:<type>`). Modwerk's own assembler, `src/engine/elektron/sharc-asm.ts`, builds it into the package's `build.dt2_sharc`, and the site composes it into section 7 with the base's machine parts. The assembler takes the instruction syntax of Analog Devices' public *SHARC+ Core Programming Reference* (the forms it lists) and refuses a program that breaks these rules:

- Never store a DAG register (I, M, L or B 0–7) to memory through an index register of the same DAG. It is not a legal encoding, though an assembler or emulator may accept it; route the value through a data register.
- The last 11 instructions of a hardware loop are 48-bit instructions, never compressed 16-bit ones (the program sequencer's loop restrictions).
- After writing code to memory, write the data cache back before invalidating the instruction cache (the loader's part: a player never writes code).
- An emulator run never proves SHARC code: these are silicon rules.

## Memory

- Shared DDR: `0x47F00000–0x47F40000` (262,144 bytes for core and linked mods).
- Fast-code SRAM: `0x8000F100–0x80010000` (3,840 bytes). The core copies `.fast` code on its first UI tick.
- Modwerk base footprint: 10,448 bytes `.run` plus 9,884 bytes `.bss`; the linker remains authoritative for combined sizes and overlap.
- Each hook collection has four entries. `core_fast` has sixteen copy-table entries.

## Build and recovery

Use the exact owner-supplied `Digitakt_II_OS1.17.syx`; the builder recognizes firmware by hash and keeps the bootstrap and updater sections unchanged. The source toolchain is m68k-elf GCC/binutils. From an elekloader checkout, build packages with `ELEKLOADER_CROSS=m68k-elf- python3 -m elekloader.sdk.build <module-folder> --stock <stock.syx>` and link them with `python3 -m elekloader.patch`.

A normal OS update uses Elektron Transfer. For recovery, hold FUNC while powering on, choose TRIG 4 (OS UPGRADE), then send the owner's stock `.syx` over MIDI DIN; this recovery mode does not use USB. Before the page offers a build, it checks it again with Modwerk's own reader (`src/engine/elekloader/digi-preflight.ts`): every section but the main OS is byte for byte the owner's stock, the container fits the flash, every changed byte of the main OS lies inside a site that one of the linked mod files declares and guards, nothing more is appended than the core's boot code, the run area and the storage lockfile, and no mod file refers to the raw block write to the +Drive. A refusal is a failed build; the build's details list what passed and both SHA-256 identities. Local parsing and emulator checks do not guarantee hardware safety. Do not flash an unqualified build.

## Status

The upstream core and author packages have been parsed, linted, and built against OS 1.17. Library modules live in [`sdk/digitakt-ii/modules/`](../../digitakt-ii/modules/); [Track Names](../../digitakt-ii/modules/track-names/) is the first.
