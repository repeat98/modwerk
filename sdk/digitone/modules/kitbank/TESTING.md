# kitbank testing

Everything below describes one build, the one submitted: core-dn1 2.0a + kitbank 0.2.0-experimental, linked for OS 1.44 from the stock file (`d4f200d0…`) with `node scripts/link-image.mjs --version XX08`. Built-image SHA-256: `6c94a77ef70ae10ebdde390bce1252dffdc946f47aca168b42cd880b9494c49c`. Firmware and derived images stay private.

## Hardware (author-reported)

Build XX08 (SHA-256 `6c94a77e…`, above), flashed with Transfer's protocol on the author's Digitone, OS 1.44, on 2026-11-20. The author (ZOGV) went through the steps one at a time and reported each one; about 10 minutes in all (the author's estimate). Recorded in [evidence/hardware-testing.json](evidence/hardware-testing.json).

| Step on the unit | Reported |
| --- | --- |
| Power-on with the author's current project, saved by the author's own always-on kit-per-bank OS (which writes kitbank's record with the switch on) | KIT PER BANK ticked, as that record says |
| Switch unticked, A02's filter closed: A01 | unchanged: OK |
| Switch ticked, then A01 and A02 | A02 plays A01's sound: OK |
| Switch unticked again, A02 | muffled again: OK |
| Switch ticked, a filter knob turned on A02, then A01 | A01 has the change too: OK |
| Stopped on A01; PTN held, trigs 5 then 6, YES, PTN released, PLAY | A05 A06 A05 A06, nothing added: OK |
| A03 locked with PTN+YES (KIT LOCKED); project saved as new; power off and on; project reloaded | KIT PER BANK still ticked; PTN+YES on A03 then shows KIT SHARED, so it was still locked: OK |
| An older project loaded | KIT PER BANK unticked, plays as before: OK |

Not tried on the unit in this run: queued pattern changes while playing, FUNC+YES / FUNC+NO, copy and paste of a locked pattern, song mode (emulator only, below). The XX07 run of 2026-11-14 (one statement, "it worked") is not evidence for this build.

## Emulator

digiemu revision `c1b5735835923e328f8b4950d6ba927875e5b669` (the reviewed one), with its six pinned Unicorn patches (`tools/install-patched-unicorn.sh`; `emu.unicorn_compat`: compatible). The scripts drive the unit only through panel keys and encoders, and read the live pattern and engine kit pointers (`0x4138f214`, `0x4138f220`), the 128 live kits and, for the project data, the header the stock save and load routines receive. The emulator is not hardware evidence.

| Run | Result |
| --- | --- |
| Unticked (power-on, stock project): A02, A16, B01, B05, H16, an edit on A03, queued changes while playing | PASS: every pattern plays and edits its own kit, as on the stock OS |
| Ticked: A01, A02, A16 → kit A01; B01, B05 → kit B01; H16 → kit H01; an edit on A03 changes only kit A01 | PASS |
| Ticked, playing: queued changes A01→A02, →B01, →B02, →A01 each take the bank's kit; unticked again, A02 plays its own kit | PASS |
| Ticked, project saved: FUNC+YES on A02, edit, FUNC+NO → kit A01 back to the saved state; FUNC+NO on A01 → the same | PASS |
| PTN+YES on A03: its kit becomes a copy of A01's, the engine moves to it (KIT LOCKED); an edit on A03 leaves A01 untouched; A02 still plays A01's kit | PASS |
| Project saved as 002; project 001 (no KBLK record) loaded → switch off, A02 plays its own kit; 002 loaded again → switch on, A03 still locked with its edited sound | PASS |
| PTN+YES on A03 again → shared (KIT SHARED); on A01 → BANK KIT, nothing locked; PTN+NO → nothing | PASS |
| Paste A05 (shared) → A06: bank kit untouched, A06 shares it; paste A05 → A01: bank kit unchanged | PASS |
| Paste A03 (locked, edited) → A07: bank kit untouched, A07 locked with A03's sound; paste B02 → A08: bank A untouched, A08 locked with B01's sound | PASS |
| Clear A06: bank kit unchanged, A06 still shares it | PASS |
| Song mode, song A01 → A02 → B01 looping twice: (pattern, kit) = (A01, A01) (A02, A01) (B01, B01); with A02 locked: (A02, A02) | PASS |
| PTN+YES while playing on A05: A05 keeps playing, locked; again: shared | PASS |
| After PTN+YES the SELECT PTN popup does not open (the module reselects the active pattern) | PASS (screens) |
| **Project data, other tools' records.** The header handed to the stock save is set to an `ELKP` list `ZZZ1` (6 B), a stale `KBLK` of 8 B, `ZZZ2` (4 B); saved as 002 | PASS: each of the three serializations of that save holds `ZZZ1`, `ZZZ2`, then a new 20-byte `KBLK` |
| 001 loaded, then 002: the header read from the card is `ZZZ1`, `ZZZ2`, `KBLK`; `KBLK`, third in the list, is found: switch on, A03 locked | PASS |
| A03 shared again, saved as 003: `KBLK` rewritten in place (same size) after `ZZZ1` and `ZZZ2` in the serialization that started from the loaded header; 003 loaded: switch on, A03 shared | PASS. The two later serializations of that save started from a header without the other records, which kitbank does not change |
| A header that is not an `ELKP` list (`XXXX` and 12 bytes) handed to the save: left as it is in every serialization | PASS |
| **Chain with PTN+trigs.** A05 and A06 locked (own kits), A01 playing; PTN held, trigs 5 and 6 held together (the chain gesture digiemu recognises), released: the kits played follow A05 A06 A05 A06 | PASS |
| The same with YES pressed while PTN and the trigs are held | PASS: A05 A06 A05 A06, the chain is unchanged and A01 is not added. The earlier build (XX07, before this fix) played A05 A06 A01 here: its handed trig joined the chain |
| Every run: no halt | PASS |

Scripts (in the author's working copy, not in this repository): `test_kitbank --stock` (unticked) and `--on`, `test_kitbank_save --on`, `test_kitlock_modwerk`, `test_kitbank_copy`, `test_kitbank_song`, `test_kitbank_projdata`, `test_kitbank_chain`: all PASS on XX08. `test_kitbank_chain` FAILs on XX07, as described.

## Full check against stock

`python -m emu.portable --check <XX08> --baseline <stock 1.44> --timing` with digiemu `c1b5735`, switch at its default (unticked): **PASS**. Boot, bootloader and run pass; 10 of 10 screens identical to stock (the screen stream first differs at 7.8 s, between captures); **audio identical to stock over 8.3 s**; render margin 40.5 % and CPU busy 58 %, as stock. The stock reference itself is marked FAIL by this emulator for a known read at `0x12a`.

## Stock flows compared

With the switch unticked, the full check above compares XX08 with the stock OS (boot, screens, audio). With it ticked, the runs above cover each listed change to a stock flow in the README: the SETTINGS row, FUNC+YES / FUNC+NO and the kit save and reload menus, pastes, PTN+YES (alone, while playing, and while building a chain), and project save, load and new. Neighbouring flows run beside them: pattern changes (immediate, queued, chains, song mode), clear, copy, sound edits. Not run: undo of a paste.

## Memory

Object sizes: 1,664 B `.run`, 100 B `.bss`: **1,764 B**, excluding the core and linker alignment. No audio-rate code.

## Measured limit

For under a second after PTN+YES, a knob turn can be ignored while the OS reloads the kit into the tracks; the tests wait one second. The stock OS reselecting a pattern by hand does not do this.

## Not tested

Undo of a paste; OS 1.43; the Digitone Keys. On the unit (emulator only): queued pattern changes while playing, FUNC+YES / FUNC+NO, copy and paste of a locked pattern, song mode.
