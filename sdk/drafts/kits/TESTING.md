# Kits testing

## 0.1.0-experimental (draft, 16 November 2026)

Assembled and packaged only. Nothing has run on a unit or in the emulator: the base side of `ot_sample_memory` (hook 52), which lends Kits its pages, is not written yet, so the package cannot be installed with pages on any base today.

## Commands and exact revision

Branch `module/kits` on base branch `base/module-bss-cap` at `e39515311` (the `ot_sample_memory` contract; base 0.7.4 allows a module 288 KiB of image and bss).

- `m68k-elf-as -mcpu=5475 kits.s`: 10,548 bytes of code, 196 of data, 38,968 of bss; `m68k-elf-nm -u` lists no undefined symbol.
- `npm run module:dev -- kits --build-only`: package `f1c13a07…` (SHA-256; the same on a rebuild), 10,744 bytes of code and data, 38,968 of bss (49,712 bytes, under the 294,912-byte limit), 294 relocations, 14 hooks (12 base hooks, `module_enc`, the `ot_sample_memory` record), 15 stock-code sites.
- `npm run modules:compat -- --with kits` (with the draft staged, as `module:doctor` stages it): installs beside the 38 active modules and the base; `ot_sample_memory` is then full (room 1).
- `npm run module:doctor -- --draft kits`: the experimental lines are green.
- `python3 -X utf8 -B -m unittest discover -s sdk/tests -p test_battery_ram.py`: green, with Kits' two ranges in `battery-ram.json`.
- The 15 stock sites match a local OS 1.40C byte for byte (upstream's manifest bytes against the image); the manifest keeps only their SHA-256. None overlaps a site of the MIDI Scenes draft.

### The library and the edit pool

octabam's `KIMG` (the kits.work image, 1,622,944 bytes) and `EDREC` (the edit pool's 64 records, 405,632 bytes) were bss. Here they are the 331 pages the base lends: `kits_ready` takes `at` from the `ot_sample_memory` record into `KBASE` and `KBASE + 1,622,944` into `EDBASE`, and every one of upstream's 56 code references in its version-1 build (61 with the MIDI SCENES code) goes through those two longs (46 `KLEA`, 7 `moveal KBASE`, 2 `moveal EDBASE`, 1 `addl KBASE`) (`KLEA off,An` = `moveal KBASE,An` / `lea An@(off),An`, neither of which changes the condition codes; `kit_at` adds `KBASE`; the two `KIMG+12` operands go through `a0` where it is free). Checked by: no `KIMG` or `EDREC` token anywhere in kits.s; `m68k-elf-nm` of the object lists no such symbol and `nm -u` nothing undefined (a reference left behind would assemble as an undefined symbol); upstream's bss with MSCKIT 0 (2,067,544 bytes) minus this port's (38,968) is exactly the two buffers (2,028,576); every `.bss` relocation addend is below the bss size.

## Changed from octabam's module

- The project events come from the base's hooks (runtime.json): ev_banks_load/loaded, ev_bank_load/loaded (the caller tells the loads apart, as STORE's d2 did), ev_project_new, ev_bank_written, ev_project_store/stored, ev_project_reloaded, ev_part_saved, ev_part_clear and ev_modules_ready, through one shim that keeps d2-d7/a2-a6. STORE's file and CRC helpers were already Kits' own.
- STORE's prompt for a refused kits.work (IGNORE, OVERWRITE, BACKUP) is not here: the file is never overwritten and the project plays as stock.
- The library and the edit pool are in borrowed sample memory (above). Until the base writes `at`, Kits is inactive: no hook handler runs, and every detour takes the stock path because READY stays 0.
- At install (ev_modules_ready, the first time `at` is set) the loaded project is read as octabam's power-up load read it: kits.work, else the Octakit import or the migration, then the battery-RAM RESID and ASSIGN. The follow-up load that only a LOAD PROJECT has does not come, so its flag is cleared.
- The battery-RAM copy moved: ASSIGN from 0x100ffe00 (now the base's machine map) to 0x100fbf00; RESID stays at 0x100f85a0. Its sum starts from the project directory's FNV-1a, so a copy left by another project is not applied.
- No MIDI scene locks in a Kit: kits.work version 1 only (octabam's MSCKIT 0 build).
- Part Clear marks the clear only while Kits is READY. In octabam a clear while READY was 0 (a refused kits.work) left the mark set, so the next SAVE KIT after a later load forgot its slot and marked a Kit valid that it never filled; in borrowed sample memory that record can hold anything.
- Not here: the detour on the boot's blank path (modules install after the boot; ev_modules_ready reads that project), and the FUNC+YES quick save (Temp Save patches 0x4005e3d8).
- The LEVEL scroll in the lists answers the core's encoder event (`module_enc`) instead of patching the encoder dispatch call, which the base owns.
- The state moved from `.text` to `.data`.

## Not tested

Everything on a unit and in the emulator: install with and without pages, the migration and the Octakit import, LOAD KIT, SAVE KIT and the name editor, UNDO KIT, FUNC+CUE, the list copy, paste, clear and undo, the LEVEL scroll, pattern changes and chains while playing (with an external clock too), the edit pool, the pattern clipboard, PTN+FUNC+RIGHT, PTN+FUNC+TRIG, the status line, kits.work and kits.strd through a save, a reload and a power cycle, the battery-RAM copy and its project tag, Part Clear, removal, the MKI key map, CPU cost, and running beside MIDI Scenes and Temp Save.

octabam's own results for KITS (its README, "Measured" and "On the unit": under its emulator port and on Sam's MKII, 6 October 2026) are for octabam's image with STORE, not for this package.
