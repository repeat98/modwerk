# Digitakt II SDK

Modwerk's Digitakt II path is experimental and targets stock OS 1.17 only. It uses elekloader kit 0.5.0 and the `core-dt2` 1.0 hook bus. The machine remains in research: builds can be checked locally, but downloads stay disabled until the exact Modwerk packages are qualified and reviewed.

## Modwerk stack

Today the core is toonst's digitakt2-perform 1.0, and builds stay local. The Digitakt II is to get the Octatrack's stack ([recipe](../../../docs/MACHINE_RECIPE.md)): a Modwerk base started from that core's source, which takes the hooks mods propose, then a USB link, the loader's glue, base updates over USB, the MCP's device tools and the machine page.

The base has started with its source (29 October 2026): core 1.1, copied unchanged into [elekloader/](elekloader/README.md) with its provenance in `sdk/imports/`. Nothing builds from it yet, and the site still links core 1.0. Its first additions, proposed below, are what a performance mode needs: per-frame parameter values, key LEDs and per-project and per-kit data. The USB link, the loader, base updates, the device tools and the machine page are not started.

## Core hooks

The core is toonst's digitakt2-perform core 1.0 (GPL-2.0-or-later), pinned by hash in [sdk/imports/elekloader-digitakt2-perform-v1.0.json](../../imports/elekloader-digitakt2-perform-v1.0.json); its contract is [core-profile/interface.json](../../digitakt-ii/core-profile/interface.json). It exposes the UI hooks below and nothing of the sequencer, the LFOs or the voices. A mod that needs one of those sites proposes a core hook first and never patches the site itself ([propose a hook](../../../docs/module-guides/README.md#propose-a-hook-on-the-digitakt-digitone-or-digitakt-ii)); the hook goes into the Digitakt II's Modwerk base ([Modwerk stack](#modwerk-stack)).

The core subscribes mods to these ColdFire/UI hooks:

| Hook | Handler | Use |
| --- | --- | --- |
| `ev_tick` | `void f(void *ctrl)` | UI compose check, approximately 30 Hz. Set `ctrl + 0x20` to 1 to request redraw. This is not an audio-rate clock. |
| `ev_draw` | `void f(void *bmp, void *ctrl)` | Draw after the OS composes its 128x64 screen. |
| `ev_key` | `int f(void *brain, void *event)` | Inspect or consume a key event; nonzero consumes it. |
| `ev_enc` | `int f(void *brain, void *event)` | Inspect or consume an encoder event; nonzero consumes it. |
| `ev_settings` | `void f(void *menu)` | Add rows while the SETTINGS menu is built. |
| `ev_personalize` | `void f(void *menu)` | Add rows while PERSONALIZE is built. |

### Proposed for core 1.1

These are in [core-profile/interface.json](../../digitakt-ii/core-profile/interface.json) marked `since` 1.1, and in the base source above. They are not in the core the site builds with (1.0), so a module that needs one waits for the base ([propose a hook](../../../docs/module-guides/README.md#propose-a-hook-on-the-digitakt-digitone-or-digitakt-ii)).

| Entry | What | Handler or record |
| --- | --- | --- |
| `ev_frame_params` | each frame's per-track parameter values, once a frame in the frame interrupt, before the stock modulators add theirs | `void f(int16_t *values, int stride)`; track t's value j at `values[stride * t + j]`, stride 71; add to it, held in the parameter's range |
| `ev_key_leds` | the key-LED frame, every UI frame, after the frame clears the LEDs and before the stock views set theirs | `void f(void *mgr)`; set an LED with `fw_led_set(mgr, logical, 2, value)`; the first setter wins |
| `core_projdata` | a mod's block in the project file's header gap, saved with every project save and loaded back | table of `core_projdata_t {tag[4], size, data, loaded}`, four entries; claim `projdata:<tag>` |
| `core_kitdata` | a mod's block per kit (128), after each kit record's end mark; saved with the project and SAVE KIT and carried through pattern copy and paste, PASTE KIT and undo | table of `core_kitdata_t {tag[4], size, data, changed}`, four entries; claim `kitdata:<tag>` |
| `core_addvalue`, `core_notice`, `core_view_top`, `fw_*` | a value row for PERSONALIZE or SETTINGS drawn like LED INTENSITY, a header message, the view on top, and firmware routines by address | `mk2/core.h` |

By the core's documentation (emulator-tested, not hardware-tested), both data areas hold bytes the stock OS writes as zeros and never reads, so a project saved with mods loads on the stock OS, which keeps them when it saves a project it loaded. Core writes them only over zeros or its own data and counts anything else in `core_store_conflicts`. **A kit record has room for 191 bytes of kit data in all** (`core_kitdata_room()`), shared by every mod's block. One mod with a 191-byte block takes all of it and leaves any other kit-data mod out, so per-kit state that several modules will want belongs to the base, as one record per module in a table the base owns ([recipe](../../../docs/MACHINE_RECIPE.md#rules)), not to the first module that asks for the room.

The Digitakt II core does not start DTIM0 and exposes no audio-render hook. Audio is rendered by the separate SHARC DSP; these hooks are not sample-accurate.

## Memory

- Shared DDR: `0x47F00000–0x47F40000` (262,144 bytes for core and linked mods).
- Fast-code SRAM: `0x8000F100–0x80010000` (3,840 bytes). The core copies `.fast` code on its first UI tick.
- Core 1.0 footprint: 480 bytes `.run` plus 20 bytes `.bss`; the linker remains authoritative for combined sizes and overlap.
- Each hook collection has four entries in core 1.0. `core_fast` has sixteen copy-table entries.

## Build and recovery

Use the exact owner-supplied `Digitakt_II_OS1.17.syx`; the builder recognizes firmware by hash and keeps the bootstrap and updater sections unchanged. The source toolchain is m68k-elf GCC/binutils. From an elekloader checkout, build packages with `ELEKLOADER_CROSS=m68k-elf- python3 -m elekloader.sdk.build <module-folder> --stock <stock.syx>` and link them with `python3 -m elekloader.patch`.

A normal OS update uses Elektron Transfer. For recovery, hold FUNC while powering on, choose TRIG 4 (OS UPGRADE), then send the owner's stock `.syx` over MIDI DIN; this recovery mode does not use USB. Local parsing and emulator checks do not guarantee hardware safety. Do not flash an unqualified build.

## Status

The upstream core and author packages have been parsed, linted, and built against OS 1.17. Modwerk's browser engine and user-facing modules are still under integration. No module in this SDK is approved or qualified for publication yet.
