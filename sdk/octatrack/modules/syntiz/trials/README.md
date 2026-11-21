# SYNTIZ 0.1.1 trial candidates (draft, for #1470)

Not a release. Three builds of the same module to find out why the 0.1.1 package clicks at every machine change and sometimes plays one side of MAIN, while 0.1.0 (`f501a6a4`) was clean on the same unit and gestures (author's MKII, 14 November 2026).

| id | what it is | package image | shares stock bytes? |
|---|---|---|---|
| B | 0.1.1's code, padded so the engine tables, read-only data and bss sit at 0.1.0's positions mod 16 | `2833fa5a` | no: longest run 11, `check_stock_free.py` clean |
| C | 0.1.1 with explicit alignment: the `desc` pages at 2 mod 4 (stride 460), `voices`, `wave_ratio`, `wave_tables` `aligned(16)` | `5f935c86` | no: longest run 11, `check_stock_free.py` clean |
| A | **control**: 0.1.0's code at 0.1.1's data addresses | `6e690c14` | **yes**: it holds stock runs. Its package is not in this branch; build it on your own computer, never commit or publish it |

Packages for B and C are in `packages/`. Each rebuilds byte for byte with `./build.sh B|C` from the repository root (the output file name must stay `syntiz.mwrm`, the module id derives from it).

## What the author saw on the unit (14 and 16 November 2026)

- 0.1.0 (`f501a6a4`): clean. 0.1.1 (`b01da631`): a click at each machine change and random L/R on MAIN, twice. CUE L/R was fine, FLEX/STATIC without SYNTIZ was clean.
- 16 November: B and A, and a 0.1.0 control, were all tried in a project that turned out to be silent (a new project played normally afterwards). **None of those runs counts.** B, C and A have therefore not been tried on a unit in a valid way.

## Offline (no unit)

Same function bodies and the same order of stock calls in 0.1.0 and 0.1.1; the text grew by 50 bytes, so everything after it moved. Host tests pass under ASan/UBSan. The loader zeroes bss. Placement is a hypothesis, not a finding; B and C are there to test it, A to check the test.

## Suggested run (as proposed on #1470)

Fresh project, a plain sample, sound checked on both sides before any SYNTIZ is loaded; then 0.1.0, C, B, record MAIN left and right over USB. A only if B clicks and C does not.
