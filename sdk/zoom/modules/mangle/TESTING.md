# Mangle testing

The listed file, Mangle 9.0.0: `Mangle.ZDL`, 7,022 bytes, SHA-256 `2838303ac0ac2714ed1fffef1890e05dd8b7e86db1cc179b77cf6273781aec59`, effect ID 8/470, header version 9.00; from the release [mangle-9.00](https://github.com/repeat98/ZoomMultistompZDL/releases/tag/mangle-9.00).

## Build

ZoomMultistompZDL at `32f3d6877d892409c6defeeeec57040ad004d31f`, TI C6000 compiler 8.5.0.LTS:

    ZDL_OWN_RUNTIME=1 ZDL_MATERIALIZE_INIT=0 python3 src/custom/mangle/build.py

Leemuzhko's runtime in place of the LineSel/AIR handlers and NoiseGate's `Dll_`, generated ABI attributes, no divide routine, init path off.

## Results (9 November 2026)

| Check | Result |
| --- | --- |
| `build/check_no_stock.py` against the stock blobs | no stock code |
| Ziddle `effect check` | PASS |
| Ziddle `effect render`, a 220 Hz test tone | renders |
| Hardware, 10 November 2026: MS-70CDR, MIDISTOMP V2.0.1 (Zoom's 2.10 underneath), this file installed over USB through the site's link and read back identical (effect list read back: its own ID) | reported by the tester: after a power cycle the pedal boots with the effect installed; one run, no measurements |

The emulator results are not hardware evidence.

## Not tested

- Its sound and its knobs on a pedal (the hardware report covers the boot and the install).
- Zoom's 2.10 without MIDISTOMP.
- The init path on (`ZDL_MATERIALIZE_INIT=1`) with this runtime.
