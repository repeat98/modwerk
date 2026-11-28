# Digitone mk1 base

Modwerk's own base for the Digitone mk1 and Digitone Keys, OS 1.43 and 1.44: version 3.0 of interface 2.2 ([interface.json](../../../digitone/core/interface.json)), the core every Digitone mod links against. It is Modwerk's October core ([sdk/elemod/core](../../../elemod/core/README.md)) assembled with `MW_BASE` and `MODWERK_DIGITONE`, plus this folder, written from behavioural specs of the interface. GPL-3.0-or-later.

## What it does

- **Boot** (0x40000538): copies the mods' code and tables, clears their data, starts DTIM0 as a free-running timebase unless it already runs (claimed as `timer:DTIM0`; its rate is not measured), installs the parameter slots, then runs the stock boot routine. The Digitone has no fast SRAM area, so `fa_copies` stays empty.
- **Events:** `ev_tick`, `ev_draw`, `ev_key`, `ev_enc`, `ev_settings` (rows with `core_additem`), `ev_render_in`, `ev_render_out` (after the stock restores the interrupted EMAC state, the site the catalogue's cores use; the hook saves and restores EMAC around its handlers), `ev_voice_on`, `ev_hold`, `ev_midi_cc`, `ev_note_queue` (handlers run with interrupts masked) and `ev_key_leds`.
- **Parameter slots** (`core_params`, ids 182–184): the stock table that occupies those records moves to the base's RAM (three sites point the stock at it), 58 stock range checks take 185 and 184, and the slots' UI records are built on first display from the stock id each record borrows (`look`, 0 for id 24).
- **Mod pages** (`core_pages`, 27–30): the page lookup answers their records, and each key's page list gets every mod page after the stock page it names. `core_page_open` and `core_page_shown` are exported.
- **Project data** (`core_projdata`): one list in the project header, `ELKP` at 0x1c (KitBank's layout), shared with every writer: the base rewrites only its modules' records and keeps every other one, and on load also reads a list kept at 0x20 by older cores (a save moves it to 0x1c). With no record in the table it never writes the header. Save and new hook the 5 and 3 calls of the stock serializer and project init, never their entries, so KitBank keeps those.
- **Mod Menu** (`core_menu`): holding a track key on its own asks `ev_hold`; with no taker and at least one entry, a plain list opens over the screen: UP, DOWN or the data encoders move, YES or trig *n* picks, NO, a page key or another hold closes. PLAY, STOP, FUNC and the track keys pass through.
- **Output owner** (`core_audio`): each block the first record that is on owns the output: exclusive (the master stage does not run; `CORE_AUDIO_MUTE_VOICES` also skips the main CPU's voice filter loop) or `CORE_AUDIO_INSERT` (after the master stage).

Every site displaces whole stock instructions and re-authors their effect in [sites.s](sites.s); [base.json](base.json) names each of the 90 by address, length and SHA-256 only. The C parts are [params.c](params.c), [pages.c](pages.c), [projdata.c](projdata.c), [menu.c](menu.c) and [audio.c](audio.c).

## Build and check

```sh
npm run elemod:base -- digitone              # build both OSes from source, compare with base-binding.json
npm run elemod:base -- digitone --write      # record a deliberate change (packages in sdk/imports/packages/modwerk-base-digitone/)
npm run digi:link-all -- --machine digitone --pairs --core sdk/imports/packages/modwerk-base-digitone/<base>.elemod [--stock <your OS .syx>]
```

[scripts/elemod-base.mjs](../../../../scripts/elemod-base.mjs) uses Modwerk's own path (m68k-elf `as`, `gcc`, `ld -r`, then `scripts/elemod-elf.mjs`); no firmware is read. Version 3.0 is below 4.0 on purpose: every linker gives it interface 2.2's 128 KiB area (0x47BE0000–0x47C00000). `scripts/elemod-base.test.mjs` checks the stored packages and the hook registry, links every mod, runs [tests/base-test.c](tests/base-test.c) on the host and, with the recorded toolchain, rebuilds the packages.

## Results (28 November 2026)

`digi:link-all` with this base, stockless and with the stock OS: OS 1.44 KitBank links (on the catalogue's core 5.4 it is refused, and builds fall back to 2.0a); OS 1.43 the base links alone (no mod ships for 1.43). The stock links check all 90 guards.

Not shown yet: the base has not run on a unit or in an emulator, on a Digitone Keys neither. The site entries were checked by reading their disassembly against the stock code around each site, not by running them. Until a tester has run it on both OSes (and a Keys for `core_audio`), site builds keep the catalogue's cores, and the base is not in the catalogue.
