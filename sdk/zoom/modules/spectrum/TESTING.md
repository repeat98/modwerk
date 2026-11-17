# Spectrum testing

The listed file, Spectrum 0.2.0: `Spectrum.ZDL`, 16,798 bytes, SHA-256 `c4b79a0c1c28f5e23dd186884399a38c30a2da1b9e64efe6f4c09d4b501f6edb`, effect ID 8/468, header version 0.02; from the release [spectrum-0.02](https://github.com/repeat98/ZoomMultistompZDL/releases/tag/spectrum-0.02).

## Build

ZoomMultistompZDL at `32f3d6877d892409c6defeeeec57040ad004d31f`, TI C6000 compiler 8.5.0.LTS:

    ZDL_OWN_RUNTIME=1 ZDL_MATERIALIZE_INIT=0 python3 src/custom/spectrum/build.py

Leemuzhko's runtime in place of the LineSel/AIR handlers and NoiseGate's `Dll_`, generated ABI attributes, no divide routine, init path off.

## Results (9 November 2026)

| Check | Result |
| --- | --- |
| `build/check_no_stock.py` against the stock blobs | no stock code |
| Ziddle `effect check` | PASS |
| Ziddle `effect render`, a 220 Hz test tone | renders |
| Hardware, 10 November 2026: MS-70CDR, MIDISTOMP V2.0.1 (Zoom's 2.10 underneath), this exact file on the pedal (read back over USB, same SHA-256) | reported working by the tester: the pedal boots, the effect shows its screen and does its job; one run, no measurements |

The emulator results are not hardware evidence.

## Not tested

- Zoom's 2.10 without MIDISTOMP.
- The init path on (`ZDL_MATERIALIZE_INIT=1`) with this runtime.
