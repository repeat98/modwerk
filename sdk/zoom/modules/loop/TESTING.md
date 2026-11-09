# Loop testing

The listed file, Loop 0.3.0: `Loop.ZDL` from the release
[loop-0.03](https://github.com/repeat98/ZoomMultistompZDL/releases/tag/loop-0.03),
26,546 bytes, SHA-256
`696623f79f1d895b317c5230309c00b0058a2b984f4437021455bc19fe1624da`,
effect ID 8/467, header version 0.03.

## Build

ZoomMultistompZDL at `32f3d6877d892409c6defeeeec57040ad004d31f`, TI C6000
compiler 8.5.0.LTS:

    ZDL_OWN_RUNTIME=1 ZDL_MATERIALIZE_INIT=0 python3 src/custom/loop/build.py

The linker links Leemuzhko's runtime (`build/runtime/zui.asm`, `dll.asm`) in
place of the LineSel/AIR handlers and NoiseGate's `Dll_`, generates the ABI
attributes and leaves out the divide routine. The init path is off.

## Results (9 November 2026)

| Check | Result |
| --- | --- |
| `build/check_no_stock.py` against the stock blobs | no stock code |
| Ziddle `effect check` | PASS: 8 parameters, 11 handlers resolve, 71 relocations safe |
| Ziddle `effect render`, pluck and sine input, Dry moved to 40 at 1 s | renders; audio byte-identical to the stock-runtime build of the same source |
| Hardware: MS-70CDR, MIDISTOMP V2.0.1 (Zoom's 2.10 underneath), installed over USB from the pedal page | reported working by the tester: boots, Loop with eight knobs on three pages, on/off, each knob on screen and in the sound, records and plays a loop, a saved patch recalled after a power cycle with its values on the screen |

The hardware pass is one run of those checks, reported by the tester, with no
measurements. The emulator results are not hardware evidence.

## Not tested

- Zoom's 2.10 without MIDISTOMP, and Long.
- The other ZDL pedals (MS-50G, MS-60B).
- The init path on (`ZDL_MATERIALIZE_INIT=1`) with this runtime.
