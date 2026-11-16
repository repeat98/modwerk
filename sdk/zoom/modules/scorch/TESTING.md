# Scorch testing

The listed file, Scorch 2.0.0: `Scorch.ZDL`, 5,214 bytes, SHA-256 `da68b74d1e01486d1deb175ef10705d4f2991fb8df0acc31eec37f6a656a7353`, effect ID 8/457, header version 2.00; from the release [scorch-2.00](https://github.com/repeat98/ZoomMultistompZDL/releases/tag/scorch-2.00).

## Build

ZoomMultistompZDL at `32f3d6877d892409c6defeeeec57040ad004d31f`, TI C6000 compiler 8.5.0.LTS:

    ZDL_OWN_RUNTIME=1 ZDL_MATERIALIZE_INIT=0 python3 src/custom/scorch/build.py

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
