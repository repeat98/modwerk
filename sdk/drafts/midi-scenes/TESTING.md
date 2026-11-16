# MIDI Scenes testing

## 0.3.0-experimental (draft, 16 November 2026)

### Install trial on an MKII, 16 November 2026

Package SHA-256 `d32d25f1229d2680…` (`module:dev --build-only` at 9f750f1ac), on a development twin of base 0.7.4 (`31d16f88`: the beta flags without the controller rows, plus `--dev`) booted from RAM, module set empty, the loaded project's transport stopped. `npm run device -- try FILE --seconds 20`, not kept:

- The base accepted it: all 33 stock-code sites and the 11 hook subscriptions. It ran 20 s with the UI tick at 60 a second throughout, then rolled back; nothing missing before or after.
- The install handler ran (ev_modules_ready): battery RAM at 0x100f9800 went from zeros to `SCS2`, bank 0, 0 locks, a sum equal to the project id, and the project id equal to FNV-1a of the unit's "set/project" path read from 0x100f8480 and 0x100f8378. So the hook fired, the file read found no scenes.work, and the packed copy and its sum came out as designed for an empty bank.
- Before the trial, the loaded project's 64 Parts (working and saved copies, both halves of the LFO designer area) held no MIDISC 2.x blob, so the conversion had nothing to change; no file was written.

Not run in this trial: any scene gesture, the crossfader, CC output, a save, a reload, a power cycle, a project with locks.

## Commands and exact revision

Branch `module/midi-scenes` on base branch `base/module-bss-cap` (base 0.7.4, which allows a module 288 KiB of image and bss).

- `m68k-elf-as -mcpu=5475 scenes.s`: 5,430 bytes of code, 654 of data, 271,920 of bss; no undefined symbols.
- `npm run module:dev -- midi-scenes --build-only`: package `21a6ffd7`, 6,088 bytes of code and data, 271,920 of bss, 148 relocations, 11 hooks, 33 stock-code sites.
- `npm run modules:compat -- --with midi-scenes`: installs beside the 38 active modules and the base.
- `npm run module:doctor -- --draft midi-scenes`: the experimental lines are green.
- The 33 stock sites match a local OS 1.40C byte for byte (upstream's manifest bytes against the image); the manifest keeps only their SHA-256.

## Changed from octabam's module

- The project events come from the base's hooks (runtime.json): ev_banks_load/loaded, ev_bank_load/loaded, ev_project_new, ev_bank_written, ev_project_store/stored, ev_project_reloaded, ev_part_clear and ev_modules_ready. octabam's STORE prompt for a refused file is not here.
- scenes.work is read slot by slot with the CRC over all of it, instead of into a second 256 KiB buffer.
- The battery-RAM copy holds only the current bank's locks, packed, tagged with the project, at 0x100f9800 (9,984 bytes); octabam's 16,400-byte copy at 0x100fbdf0 is under the base's own records.
- At install (ev_modules_ready, the first time) the project is already loaded: every bank is read from scenes.work, then the battery-RAM copy of the current bank.
- Three detours that only jump to another stock address are pokes of the same `jmp`.

## Not tested

Everything on a unit and in the emulator: install, the scene gestures, the crossfader, CC output, the mix at a pattern or Part change, scenes.work and scenes.strd through a save, a reload and a power cycle, the battery-RAM copy, conversion of a 0.2 project, Part Clear, removal, the MKI, CPU cost.
