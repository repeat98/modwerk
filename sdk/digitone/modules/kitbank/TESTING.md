# kitbank testing

## In Modwerk

### Hardware (author-reported)

Evidence tier: `author-hardware`. On 2026-11-14 the author flashed the module-alone build XX07 (core dn1 2.0a + kitbank 0.2.0-experimental, SHA-256 `30e54a811681c0bcc57f8b1dd026473d346afcaf86e83c4332b6331c4a97eaf0`) on their Digitone, OS 1.44, with a nine-step list (the switch, bank kits while playing, an edit shared by the bank, PTN+YES, project save and power cycle, paste, song mode), and reported: "it worked". The result was one statement, not step by step; which steps were tried and for how long was not reported. Details: [evidence/hardware-testing.json](evidence/hardware-testing.json).

### Emulator

The XX07 build passes `test_kitlock_modwerk`, `test_kitbank_copy` and `test_kitbank_song`, and the full check against stock with the switch off: build PASS, 10 of 10 screens identical, audio identical over 8.3 s, render margin 40.5 % and CPU busy 58 % as stock (the screen stream first differs at 7.8 s, between captures). The runs below are in the digiemu emulator (revision `f57c2f237e84b8ff91bc3adb2a2931bccf9928e9`, not the reviewed `c1b5735…`, see [capture.json](media/capture.json)), on a local image linked with `node scripts/link-image.mjs --version XX06` from the stock OS 1.44 file (`d4f200d0…`), core-dn1 2.0a for 1.44 and this module (0.2.0-experimental). Built-image SHA-256: `7d14c8272d861704983903f36a5018edef5647f708ad3658a8899e8a86e798be`. Firmware and derived images stay private.

## Behaviour (emulator, real panel inputs)

The scripts read the live pattern and engine kit pointers (`0x4138f214`, `0x4138f220`) and the 128 live kits, and drive the unit only through panel keys and encoders. The same redirections were first built as a standalone always-on patch and run on the author's own unit; that build is not a Modwerk build and is not part of this evidence.

| Run | Result |
| --- | --- |
| Unticked (power-on, stock project): A02, A16, B01, B05, H16, an edit on A03, queued changes while playing | PASS: every pattern plays and edits its own kit, as on the stock OS |
| Ticked: A01, A02, A16 → kit A01; B01, B05 → kit B01; H16 → kit H01; an edit on A03 changes only kit A01 | PASS |
| Ticked, playing: queued changes A01→A02, →B01, →B02, →A01 each take the bank's kit; unticked again, A02 plays its own kit | PASS |
| Ticked, project saved: FUNC+YES on A02, edit, FUNC+NO → kit A01 back to the saved state; FUNC+NO on A01 → the same | PASS |
| PTN+YES on A03: its kit becomes a copy of A01's, the engine moves to it (KIT LOCKED); an edit on A03 leaves A01 untouched; A02 still plays A01's kit | PASS |
| Project saved as 002; project 001 (no KBLK block) loaded → switch off, A02 plays its own kit; 002 loaded again → switch on, A03 still locked with its edited sound | PASS |
| PTN+YES on A03 again → shared (KIT SHARED); on A01 → BANK KIT, nothing locked; PTN+NO → nothing | PASS |
| Paste A05 (shared) → A06: bank kit untouched, A06 shares it; paste A05 → A01: bank kit unchanged | PASS |
| Paste A03 (locked, edited) → A07: bank kit untouched, A07 locked with A03's sound; paste B02 → A08: bank A untouched, A08 locked with B01's sound | PASS |
| Clear A06: bank kit unchanged, A06 still shares it | PASS |
| Song mode, song A01 → A02 → B01 looping twice: (pattern, kit) = (A01, A01) (A02, A01) (B01, B01); with A02 locked: (A02, A02) | PASS |
| PTN+YES while playing on A05: A05 keeps playing, locked; again: shared | PASS |
| After PTN+YES the SELECT PTN popup does not open (the module reselects the active pattern) | PASS (screens) |
| Every run: no halt | PASS |

## Full check against stock

`python -m emu.portable --check <image> --baseline <stock 1.44> --timing` (switch at its default, unticked), run on the XX05 build of the same behaviour before the popup fix: **PASS**, 10 of 10 screens identical to stock, **audio identical to stock over 8.3 s**, render margin 40.5 % and CPU busy 58 % as stock. The stock reference itself is marked FAIL by this emulator for a known read at `0x12a`. Unticked, the popup fix adds no code path: the PTN+YES branch is only taken while ticked.

## Memory

Object sizes: 1,432 B `.run`, 96 B `.bss`: **1,528 B**, excluding the core and linker alignment. No audio-rate code.

## Measured limit

For under a second after PTN+YES, a knob turn can be ignored while the OS reloads the kit into the tracks; the tests wait one second. The stock OS reselecting a pattern by hand does not do this.

## Not tested

Step-by-step hardware results; undo of a paste; chains built with PTN+trigs while playing (queued changes were); OS 1.43.
