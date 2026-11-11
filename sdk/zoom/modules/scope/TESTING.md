# Scope testing

The listed file, Scope 0.3.0: `Scope.ZDL`, 10,114 bytes, SHA-256 `90470754e1933e8f5c6819197c3054b75a6ffa92a11d70b93278c80c5c282c34`, effect ID 8/414, header version 0.03; from the release [scope-0.03](https://github.com/repeat98/ZoomMultistompZDL/releases/tag/scope-0.03).

## Build

ZoomMultistompZDL at `32f3d6877d892409c6defeeeec57040ad004d31f`, TI C6000 compiler 8.5.0.LTS:

    ZDL_OWN_RUNTIME=1 ZDL_MATERIALIZE_INIT=0 python3 src/custom/scope/build.py

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
