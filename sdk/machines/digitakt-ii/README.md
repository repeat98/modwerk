# Digitakt II SDK

Modwerk's Digitakt II path is experimental and targets stock OS 1.17 only. It uses elekloader kit 0.5.0 and the `core-dt2` 1.0 hook bus. The machine remains in research: builds can be checked locally, but downloads stay disabled until the exact Modwerk packages are qualified and reviewed.

## Core hooks

The core is toonst's digitakt2-perform core 1.0 (GPL-2.0-or-later), pinned by hash in [sdk/imports/elekloader-digitakt2-perform-v1.0.json](../../imports/elekloader-digitakt2-perform-v1.0.json); its contract is [core-profile/interface.json](../../digitakt-ii/core-profile/interface.json). It exposes the UI hooks below and nothing of the sequencer, the LFOs or the voices. A mod that needs one of those sites proposes a core hook first and never patches the site itself ([propose a hook](../../../docs/module-guides/README.md#propose-a-hook-on-the-digitakt-digitone-or-digitakt-ii)); a new core release is pinned the same way.

The core subscribes mods to these ColdFire/UI hooks:

| Hook | Handler | Use |
| --- | --- | --- |
| `ev_tick` | `void f(void *ctrl)` | UI compose check, approximately 30 Hz. Set `ctrl + 0x20` to 1 to request redraw. This is not an audio-rate clock. |
| `ev_draw` | `void f(void *bmp, void *ctrl)` | Draw after the OS composes its 128x64 screen. |
| `ev_key` | `int f(void *brain, void *event)` | Inspect or consume a key event; nonzero consumes it. |
| `ev_enc` | `int f(void *brain, void *event)` | Inspect or consume an encoder event; nonzero consumes it. |
| `ev_settings` | `void f(void *menu)` | Add rows while the SETTINGS menu is built. |
| `ev_personalize` | `void f(void *menu)` | Add rows while PERSONALIZE is built. |

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
