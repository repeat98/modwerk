# kitbank testing

## In Modwerk

No hardware qualification is claimed for this Modwerk build. Evidence tier: `none`. All runs below are in the digiemu emulator (revision `f57c2f237e84b8ff91bc3adb2a2931bccf9928e9`, not the reviewed `c1b5735…`, see [capture.json](media/capture.json)), on a local image linked with `node scripts/link-image.mjs --version XX01` from the stock OS 1.44 file (`d4f200d0…`), core-dn1 2.0a for 1.44 and this module. Built-image SHA-256: `13c0595b442bc1c68d78069eea4ee451a917b26f9990c79753037de288762e04`. Firmware and derived images stay private.

## Behaviour (emulator, real panel inputs)

Scripts kept with the author's notes (`re/test_kitbank.py`, `re/test_kitbank_save.py`); they read the live pattern and kit pointers (`0x4138f214`, `0x4138f220`) and the 128 live kits, and drive the unit only through panel keys and encoders.

| Run | Result |
| --- | --- |
| Unticked (power-on): A02, A16, B01, B05, H16, an edit on A03, queued changes while playing | PASS: every pattern plays and edits its own kit, as the stock OS does |
| Ticked (SETTINGS, last row, YES): A01, A02, A16 → kit A01; B01, B05 → kit B01; H16 → kit H01 | PASS |
| Ticked: filter edit on A03 changes only kit A01, and A01 shows it | PASS |
| Ticked, playing: queued changes A01→A02, →B01, →B02, →A01 each take the bank's kit | PASS |
| Ticked then unticked: A02 plays its own kit again, A01 its own | PASS |
| Ticked, project saved: on A02 edit, FUNC+YES, edit, FUNC+NO → kit A01 back to the saved state; FUNC+NO on A01 → the same; A02's own kit never touched | PASS |
| Playback with pattern changes | no halt, audio present |

## Full check against stock

`python -m emu.portable --check <image> --baseline <stock 1.44> --timing` (switch at its power-on state, unticked): **PASS**.
10 of 10 screens identical to stock (start, TRIG/SYN1/SYN2/FLTR/AMP/LFO pages, trig, playing, stopped), **audio identical
to stock over 8.3 s**, audio render margin 40.5 % and CPU busy 58 % as stock. The stock reference itself is marked FAIL by
this emulator for a known read at `0x12a`, unrelated to the module.

## Memory

Object sizes: 548 B `.run`, 4 B `.bss`: **552 B**, excluding the core and linker alignment. No audio-rate code.

## Not tested

Hardware with this Modwerk build; song mode; copy, paste and clear of patterns while ticked; OS 1.43.
