# MIDI Scenes testing

## 0.3.1-experimental (draft, 25 November 2026)

0.3.0 kept a 4,096-byte lock table for each of the project's 64 Parts: 266 KiB of bss, 35 % of the base's 768 KiB
module pool, whether or not a Part had a lock. On 25 November a set of 42 unused published packages, 0.3.0 among them,
was refused on the owner's MKII with RUNTIME_MEMORY (the packages' code, data and bss came to 791 KiB). 0.3.1 keeps 24
tables and gives one to a Part when it is displayed or gets locks; every other Part reads one shared empty table. The
crossfader's mix never allocates (it runs in the sequencer step). A table with no lock goes back when another Part needs
one, unless its Part is displayed or mixed. scenes.work keeps 0.3.0's format: all 64 slots, a Part without a table
written as empty.

### Sizes

`m68k-elf-as -mcpu=5475 scenes.s`: 6,468 bytes of code, 726 of data, 116,368 of bss (0.3.0: 5,430, 654, 271,920).
`npm run module:dev -- midi-scenes --build-only`: package `17f934ff`, 7,196 bytes of code and data, 116,368 of bss,
11 hooks, 33 stock-code sites, the same sites as 0.3.0.

### MKII, 26 November: gestures, the crossfader, in use and the price

The owner's MKII on OS 1.40C, RAM-booted into the development twin `8fd6d456` of base 0.8.1 (`eb667962` with `--dev`),
the owner's loaded project as the twin booted it (bank G, pattern 1), package `17f934ff` (built the same from main and
from base/octatrack-next at 0.8.2's head `e7d07acf1`). Two rolled-back trials and `device:price`; SAVE never pressed,
nothing kept or flashed; the flashed base and its four kept modules came back afterwards. Script and log:
`unit-ms.sh` (local). MIDI track 1's record read at 0x46c76dc0 (byte 0 is encoder A on the NOTE page, base 48); the
crossfader is 0-255 over USB, 0 being the scene B end here.

| Step | Observed |
|---|---|
| `memory` empty, then installed | pool 0, then 126,768 bytes used, one free run of 659,664 |
| Lock T1 encoder A: scene A +10, scene B −10 | battery copy count 1, then 2 |
| Crossfader 0 / 127 / 64 | 38 (scene B, 48 − 10) / 49 / 43 |
| Clear scene B (hold SCENE B, push A), crossfader 127 | count 1; 53, halfway from 48 to scene A's 58 |
| Roll back, install again | the battery copy brought scene A's lock back (count 1); crossfader 0 read 48 |
| 16 locks: T1-T8 encoder A, scenes A and B | count 16; T1 at crossfader 0 read 38, at 127 read 55 |
| Clear all 16 | count 0, the record back to 48 |

Playing, with the crossfader swept end to end every 250 ms for 8 s (`guard`, then `stats`):

| | Frame interrupt | Longest frame | CPU meter |
|---|---|---|---|
| No module | 28.5 % | 56.4 % | 44.4 % |
| Installed, no lock | 28.6 % | 56.3 % | 43.1 % |
| 16 locks | 28.5 % | 57.2 % | 44.2 % |

No render skipped; both trials ended with "no crash, stall, freeze or skipped track logged during the trial".
`npm run device:price -- --write --memory` (3 readings of 8 s a state, playing): +0 points of the frame interrupt at
rest (28.5 % before and after) and +0.3 on the CPU meter, written into `octamod.module.json` and
`evidence/cpu-price.json`.

### Power cycle: owner's steps

Not run: it needs the owner. With a test project, never one the owner needs unchanged:

1. Agent: `npm run device -- do inventory` and note the kept set. Install 0.3.1 and keep it
   (`npm run device -- try midi-scenes.mwrm --seconds 600 --accept`) on the flashed base.
2. Agent: in the test project, lock MIDI track 1's encoder A in scene A in Part 1, and in scene B in Part 2.
   SAVE the project. Read the battery copy (`mem:0x100f9800:16`: count 2).
3. Owner: switch the Octatrack off and on again.
4. Agent: `inventory` and `restore` show MIDI Scenes loaded with the set. The battery copy still counts 2, and the
   crossfader still morphs Part 1's record. RELOAD the project: both locks are back from scenes.work.
5. Agent: remove MIDI Scenes, or leave it if the owner wants it kept. `inventory` then equals the set noted in step 1.

### Emulator: locks, the limit, save, reload and a project over the limit

`ot_emu` (the adapted build, paced to the wall clock, no DSP) on the development twin `8fd6d456` of base 0.8.1, with a
throwaway card (set MODWERK, project DRUMS), never the owner's card. Two builds of this source: `17f934ff` (24 tables)
and a test build `1d80e110` with NBLK 2 (two tables, never committed), each installed with `device try` and rolled
back. Gestures over USB (`MIDI`, `T1`, `+SCENEA encA+N -SCENEA`, `PUSHA`, `part1`-`part3`, PROJECT > SAVE / RELOAD);
locks read from the battery-RAM copy at 0x100f9800 (bank 0's count and entries).

| Step | Build | Observed |
|---|---|---|
| Install | 2 tables | ev_modules_ready ran: SCS2, bank 0, 0 locks |
| Lock in Part 1, then Part 2 | 2 tables | 1, then 2 locks (Part 1 value 53, Part 2 value 53) |
| Lock in Part 3 | 2 tables | refused: the toast LOCKS: 24 PARTS, still 2 locks |
| Clear Part 1's lock (PUSHA), lock in Part 3 | 2 tables | Part 1's empty table went to Part 3: Part 2 = 53, Part 3 = 55 |
| SAVE, clear Part 2's lock, RELOAD | 2 tables | the saved state came back: Part 2 = 53, Part 3 = 55 |
| Install over that project, lock in Part 1, SAVE | 24 tables | Parts 2 and 3 read from scenes.work at the install; 3 Parts saved (57, 53, 55) |
| Install over the 3-Part project | 2 tables | Parts 1 and 2 loaded, Part 3 left out; the battery copy's magic 0; LOCKS NOT LOADED at the next scene gesture, the edit there applied |
| SAVE in that state, then install the 24-table build | 24 tables | all 3 Parts loaded with the values saved before (57, 53, 55): scenes.work was not written over |

Every trial rolled back with "no crash, stall, freeze or skipped track logged during the trial".

### MKII: the largest set, idle

The owner's MKII on OS 1.40C, RAM-booted into the development twin `8fd6d456` (the flashed release `eb667962`'s source
with `--dev` and controller rows), the loaded project unchanged, no module assigned anywhere, measured as the other idle
records ([MODULE_PERFORMANCE.md](../../../../docs/MODULE_PERFORMANCE.md)): `guard` over 8 s after a settle, the mean of
ten `stats`, three `profile:3` windows. Every set was a rolled-back trial; nothing was kept or flashed, and the release
image was RAM-booted back afterwards with the nine kept modules.

- The 42 packages with 0.3.1 in place of 0.3.0 now pass the memory check; the set was refused instead with
  RUNTIME_STOCK, which 15 s trials of the 32 others plus each of the last ten traced to Recorder Loop Fix 0.1.0 alone
  (its stock bytes differ under base 0.8.1). The other nine each installed beside the 32.
- The remaining 41 (every published Octatrack package but Recorder Loop Fix, USB Audio, Analog BD, Sidechain and
  Output Matrix) installed in one trial and rolled back: "no crash, stall, freeze or skipped track logged".

| Set | Frame interrupt stopped / playing | CPU meter stopped / playing | Longest frame playing | Module UI tick stopped / playing |
|---|---|---|---|---|
| none (before) | 23.6 / 29.3 % | 35.4 / 44.5 % | 62.8 % | 139 / 168 µs |
| none (between) | 24.9 / 29.4 % | 36.8 / 44.7 % | 62.6 % | 142 / 160 µs |
| 41 unused, MIDI Scenes 0.3.1 among them | 27.0 / 34.9 % | 41.6 / 51.2 % | 72.2 % | 595 / 744 µs |
| none (after) | 23.8 / 29.6 % | 38.5 / 48.3 % | 62.8 % | 140 / 169 µs |

No render was skipped in any window. The crash and stall records (12 and 56) did not change.

Not run for 0.3.1: a power cycle (above, the owner's steps), CC output measured at a MIDI port, a unit on base 0.8.2,
a MIDISC 2.x project over the limit, the MKI. The gestures, the crossfader, in-use cost and `device:price` ran on 26
November (above). CC output was tried in `ot_emu` on 26 November. The lock on CTRL1's CC1 morphed MIDI track 1's record:
107 at the scene B end, 117 halfway, 127 at scene A. But the throwaway project's track sent nothing: its CC values stayed
OFF whatever the encoder did, so no byte reached UART0. Stock sends from the record, and 0.3.1 changes where locks are
stored, not the mix.

## 0.3.0-experimental (draft, 16 November 2026)

### Install trial on an MKII, 16 November 2026

Package SHA-256 `d32d25f1229d2680…` (`module:dev --build-only` at 9f750f1ac), on a development twin of base 0.7.4 (`31d16f88`: the beta flags without the controller rows, plus `--dev`) booted from RAM, module set empty, the loaded project's transport stopped. `npm run device -- try FILE --seconds 20`, not kept:

- The base accepted it: all 33 stock-code sites and the 11 hook subscriptions. It ran 20 s with the UI tick at 60 a second throughout, then rolled back; nothing missing before or after.
- The install handler ran (ev_modules_ready): battery RAM at 0x100f9800 went from zeros to `SCS2`, bank 0, 0 locks, a sum equal to the project id, and the project id equal to FNV-1a of the unit's "set/project" path read from 0x100f8480 and 0x100f8378. So the hook fired, the file read found no scenes.work, and the packed copy and its sum came out as designed for an empty bank.
- Before the trial, the loaded project's 64 Parts (working and saved copies, both halves of the LFO designer area) held no MIDISC 2.x blob, so the conversion had nothing to change; no file was written.

Not run in this trial: any scene gesture, the crossfader, CC output, a save, a reload, a power cycle, a project with locks.

### Hand test by the owner, 16 November 2026

Same package as the install trial, a one-hour trial on the same twin, ended after 7 minutes: the owner locked MIDI parameters in scenes and moved the crossfader, and reported "ok, worked". No details recorded.

### CPU and stress, 16 November 2026

Package from 4a6de480a (the battery-RAM range ending at 0x100fbf00), twin `31d16f88`, the owner's project. Each in-use run played a pattern with a trig on every step of all eight MIDI tracks, scene 1 on A and scene 2 on B, MIDI channels off (so no CC or note went out). The CPU meter is the mean of `stats` readings; the frame interrupt's share is the `guard` reading over the run.

| Run | CPU meter | Frame interrupt | Skipped renders |
|---|---|---|---|
| `device:price`, pattern A01, at rest, without / with MIDI Scenes | 46.5 / 46.8 % | 28.5 / 28.7 % | 0 |
| No modules, crossfader still / sweeping | 42.6 / 42.6 % | 24.8 / 24.8 % | 0 |
| MIDI Scenes, 480 locks (every knob of the five MIDI pages, both scenes, eight tracks), still / sweeping | 42.8 / 42.8 % | 24.8 / 24.9 % | 0 |
| Stress: sweeps and pattern changes B16-B15, 12 rounds, about 1 min | 42.8 % (max 43.2) | 24.8 % | 0 |
| 14 other modules installed (POLY8, FM Synth, Amiga, Repitch, Mute Modes, Euclid, Tape Echo, Mini Verb, E-Verb, Apply Scene, Arp Key Locks, Direct Jump, Temp Save, Track Solo), sweeping | 48.1 % | 29.3 % | 0 |
| The same 14 plus MIDI Scenes, 96 locks, sweeping | 48.2 % | 29.3 % | 0 |
| The same, stress: 4 rounds of pattern changes, 2-minute trial | 48.2 % (max 48.3) | 29.3 % | 0 |

- The morph ran: MIDI track 1's record (0x46c76dc0) held scene A's values at the crossfader's A end, scene B's at the B end and values between them in the middle.
- The battery copy counted 480 and then 96 locks as they were set.
- No crash or stall record was added (crash 12 and stall 45 before and after).
- Every trial rolled back; the set installed beside 14 modules in one go.

Not measured: CC output with MIDI channels on, a CC flood at 240 BPM, MKI.

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
