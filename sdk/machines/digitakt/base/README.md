# Digitakt mk1 base

Modwerk's own base for the Digitakt mk1, OS 1.53 and 1.54: version 5.0 of interface 2.1 ([interface.json](../../../digitakt/core/interface.json)), the core every Digitakt mod links against. It is Modwerk's October core ([sdk/elemod/core](../../../elemod/core/README.md)) assembled with `MW_BASE`, plus this folder, written from behavioural specs of the interface. GPL-3.0-or-later.

## What it does

- **Boot** (0x40000538): copies the mods' code and tables, clears their data, copies `.fast` rows to SRAM (`fa_copies`), starts DTIM0 as a free-running timebase unless it already runs (claimed as `timer:DTIM0`; its rate is not measured yet), fills the sample-knob table and the page registry, then runs the stock boot routine.
- **Events:** `ev_tick`, `ev_draw`, `ev_key`, `ev_enc`, `ev_settings` (rows with `core_additem`), `ev_render_in`, `ev_render_out` (at 0x400784c8, the site the catalogue's cores use; the hook saves and restores EMAC around its handlers) and `ev_render_voices` (0x40077fba, EMAC saved too).
- **SRC machines** (`core_machines`, ids 4–127): the machine menu lists, steps, opens and sets them, kits keep them, the menu draws their icons, names come from the descriptor, and parameters, CC and NRPN maps, ownership, knob D and the render follow the stock machine the descriptor stands in for. `core_track_machine[8]`, `core_machine(id)` and `core_machine_ui(id)` are exported.
- **Machine pages:** a descriptor tagged `UI30` with a page (`abi` = `cm_ui_v3` or `cm_ui_v31`) gets its own SRC labels, value texts, graphics, ranges, hidden knobs, LFO names and `on_switch` (an `ev_tick` handler at order 20). Machine Pages' 20 sites are the base's now; the [code-free `machine-pages` package](#the-machine-pages-package) keeps the mods that require it building unchanged.

Every site displaces whole stock instructions and re-authors their effect in [machines.s](machines.s), [pages.s](pages.s) and [resumes.s](resumes.s); [base.json](base.json) names each by address, length and SHA-256 only. The C parts are [machines.c](machines.c) and [pages.c](pages.c).

## Build and check

```sh
npm run elemod:base -- digitakt              # build both OSes from source, compare with base-binding.json
npm run elemod:base -- digitakt --write      # record a deliberate change (packages in sdk/imports/packages/modwerk-base-digitakt/)
npm run digi:link-all -- --machine digitakt --pairs --core sdk/imports/packages/modwerk-base-digitakt/<base>.elemod \
  --package sdk/imports/packages/modwerk-base-digitakt/machine-pages-2.0-os<OS>.elemod [--stock <your OS .syx>]
```

[scripts/elemod-base.mjs](../../../../scripts/elemod-base.mjs) uses Modwerk's own path (m68k-elf `as`, `gcc`, `ld -r`, then `scripts/elemod-elf.mjs`); no firmware is read. Each package must declare every event and table of the interface, export its names, claim its claims, and keep core 2.1's id, collections, requires and conflicts. Version 5.0 gives the mods the 256 KiB area (0x47BC0000–0x47C00000). `scripts/elemod-base.test.mjs` checks the stored packages, links every mod, runs [tests/base-test.c](tests/base-test.c) on the host and, with the recorded toolchain, rebuilds the packages.

## The machine-pages package

`machine-pages` 2.0 has no code: it requires `core` 5.0 (this base) and keeps Machine Pages 1.2's conflict with digichain, so digistring, ram-machines and live-looper, which require `machine-pages`, build on this base without a re-release. It is authored by Modwerk.

## Results (28 November 2026)

`digi:link-all` with this base and the code-free `machine-pages`, with the stock OS and stockless, matches the catalogue's core: OS 1.53 11 singles and 54 pairs, OS 1.54 18 singles and 151 pairs, all linked, no clashes.

Not shown yet: the base has not run on a unit or in an emulator. The CPU harness (`sdk/elemod/core/tests`) needs a patched Unicorn this checkout lacks, so the site entries were checked by reading their disassembly against the stock code around each site, not by running them. Until a tester has run it on both OSes, site builds keep the catalogue's core, and the base is not in the catalogue.
