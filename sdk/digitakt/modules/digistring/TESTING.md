# STRING testing

Module version 0.9.0, Digitakt I OS 1.53 (stock file SHA-256 `9bdd44bb…cc92`) and 1.54 (`f78ba80f…3cf6`), Core 2.1 with Machine Pages 1.2. Source: [Alez22/digistring](https://github.com/Alez22/digistring) commit `69ab74811956a69a1d6349f30b23f747343f8257`. Firmware, linked images and emulator state stay on the developer's computer; none of it is committed.

## Evidence tier

`author-hardware`: the author ran the Modwerk build M003 on a Digitakt I, on OS 1.53 for 5 minutes and on OS 1.54 for 15 minutes, and measured the track count and DSP load in three more OS 1.54 builds ([hardware-testing.json](evidence/hardware-testing.json)).

## 1. Source build

- `bash scripts/build-elemod-isolated.sh` in the pinned toolchain image (GCC 16.2.0, image `sha256:230c6c02…04fc`).
- `node scripts/package-elemod-recipe.mjs` exports both committed packages:
  - OS 1.53: `digistring-0.9.0-os1.53.elemod`, SHA-256 `9e3ca5570ec7e3521e2e2c3df576db08287f3329624dee9373808fa7fe63bc8f`
  - OS 1.54: `digistring-0.9.0-os1.54.elemod`, SHA-256 `247aba7f6d56f1081a94677b2c665322e5e3754a1b420bf12760f4762f4ccf0b`
- Source identity: [evidence/source-identity.json](evidence/source-identity.json), `9a96a39d…40ec7`.
- `scripts/gen_tables.py` and `scripts/gen_icons.py` regenerate `src/ks_tables.inc` and `src/ks_icons.inc` byte for byte.
- No sites: STRING contributes its machine to `core_machines`, Machine Pages draws its SRC page from its `cm_ui` descriptor and calls its render through `ev_render_voices` (order 20). The 1.54 package differs only by the `-DDIGISTRING_OS154` cflag.

## 2. Link

Linked with elekloader's Python patcher (commit a401967) against each stock file, from the catalogue's Core 2.1, Machine Pages 1.2, RAM Machines 1.3.1, Note Accumulator 1.1.1 and digihealth 1.0 packages and the STRING packages above. `elekloader.lint` accepts STRING with Core 2.1, Machine Pages, RAM Machines and Note Accumulator on both releases.

| Build | OS | Modules | Main image SHA-256 | .syx SHA-256 |
| --- | --- | --- | --- | --- |
| M003 | 1.53 | Core, Machine Pages, STRING, RAM Machines, Note Accumulator | `c5d00673…5201` | `73d4f1f3924c90c7114e60d1d89be86647a9cb08fe80514bf072c4670cf2148f` |
| M003 | 1.54 | Core, Machine Pages, STRING, RAM Machines, Note Accumulator | `2c340db8…f0c4` | `ef1a7631d27e832888edc34d21c61fcbc5b5ecd69a7710928f93c82c509256ed` |
| M004 | 1.54 | Core, Machine Pages, STRING | `76e40bf4…c8ec` | `a4f139e213da4f0186d135e0b40b0ffe086b46811561a95cd584e64f1e9139a2` |
| M005 | 1.54 | Core, digihealth, Machine Pages, STRING 0.9.0 | `b32d7825…f2ca` | `48b73042188657cb1474fee10801820739248a6539cbac94f8e4b9f47742cd21` |
| M006 | 1.54 | Core, digihealth, STRING 0.8.0 (comparison) | `17775fa9…ab17` | `a37f15d537a99bdfcd9f4a686b33bd9af764936aa87d1527eef1f9c9eada6496` |

Memory: `.run` 7,141 bytes and `.bss` 17,152 bytes (a 2 KB delay line per track) in the shared mod RAM; no fast SRAM.

## 3. Screens (pinned digiemu c1b5735)

[capture.json](media/capture.json): the machine list, the SRC page and EXC turned to BOW with 48 single encoder steps, from the M004 build. A build with the same modules for OS 1.53 gives byte-identical PNGs with the same plan.

## 4. Hardware

Alez22, Digitakt I, 2026-10-28, flashed with `amidi` in upgrade mode. M003 (Core 2.1, Machine Pages, STRING, RAM Machines, Note Accumulator), OS 1.53 for 5 minutes and OS 1.54 for 15 minutes:

| Check | 1.53 | 1.54 |
| --- | --- | --- |
| STRING in the FUNC + SRC list with its icon; SRC page names, EXC icons, knob D blank, POS and TONE scaling | Works | Works |
| STRING's own defaults when a track switches to STRING | Applied | Applied |
| LFO destinations named and grouped as STRG | Work | Work |
| Project save, power cycle and reload | Comes back unchanged | Comes back unchanged |
| Note Accumulator (ACC +1, RNG 3) on a STRING track | Transposes step by step | Transposes step by step |
| RAM-R1 recording STRING from MAIN, RAM-P1 playing it back | Works | Works |
| Several STRING tracks at once | Not stated | Three clean; from four the UI lags |

A project saved with STRING 0.8.0 was loaded on the author's elekloader builds K014 (OS 1.53) and K015 (OS 1.54) of the same source commit, with elekloader Core 4.1 and Machine Pages 1.5: it keeps its exciter and values. Not repeated on M003.

Judged by ear and by the UI's response. On OS 1.54, M004 (without RAM Machines and Note Accumulator) also lags from four tracks.

DSP load read on digihealth, OS 1.54, same pattern on both builds:

| STRING tracks | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| M005: STRING 0.9.0 with Machine Pages | 81% | 87% | 91% | 95% | 96% | 98% |
| M006: STRING 0.8.0, own sites | 82% | 89% | 91% | 92% | 96% | 100% |

Both builds lag from four tracks on this pattern. Moving onto Machine Pages costs no measurable DSP load. The 0.8.0 session (build M002, 2026-10-27) played four tracks cleanly on a lighter pattern: the track count depends on the sounds, as long DECAY, BOW and low notes cost more.

## Stock flows compared

| Flow | Result |
| --- | --- |
| Machine list | Stock machines unchanged; STRING added below SLICE (emulator and hardware) |
| Project save, reload, power cycle | Normal (hardware, OS 1.53 and 1.54) |

## Still to test

- Track count on OS 1.53.
- CPU load in the emulator with eight STRING tracks.
- Beside every other catalogue module on hardware. Machine Pages conflicts with DigiChain, so Digi Mono and Digi Poly cannot be installed with STRING.
