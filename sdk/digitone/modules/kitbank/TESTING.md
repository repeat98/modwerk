# kitbank testing

## In Modwerk

No hardware qualification is claimed for this Modwerk build. Evidence tier: `none`. All runs below are in the digiemu emulator (revision `f57c2f237e84b8ff91bc3adb2a2931bccf9928e9`, not the reviewed `c1b5735…`, see [capture.json](media/capture.json)), on a local image linked with `node scripts/link-image.mjs --version XX05` from the stock OS 1.44 file (`d4f200d0…`), core-dn1 2.0a for 1.44 and this module (0.2.0-experimental). Built-image SHA-256: `fd4cf27d419295343c53893501ee01ee513a57ccb9e7dae533be974f5694fd2b`. Firmware and derived images stay private.

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
| Every run: no halt | PASS |

## Full check against stock

`python -m emu.portable --check <image> --baseline <stock 1.44> --timing` (switch at its default, unticked): result recorded below when the run ends.

## Memory

Object sizes: 1,280 B `.run`, 28 B `.bss`: **1,308 B**, excluding the core and linker alignment. No audio-rate code.

## Not tested

Hardware with this Modwerk build; undo of a paste; chains built with PTN+trigs while playing (queued changes were); OS 1.43.
