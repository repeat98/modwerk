# Cycle scan

Prices the path an Octatrack DSP effect executes: each instruction's cycles from the DSP56300 manual (Table A-1) and
the idle cycles the core inserts for some sequences (pipeline stalls, sections A.2 and 3.5), with the sites that stall.
`cycle_count.py` counts words and `dsp_host -meter` counts instructions; neither sees cycles.

Imported from [sambanks/octabam](https://github.com/sambanks/octabam) at `cc7cffc1` (#1169, GPL-3), recorded in
[`sdk/imports/octabam-cycle-scan-cc7cffc1.json`](../imports/octabam-cycle-scan-cc7cffc1.json). [CYCLE_SCAN.md](CYCLE_SCAN.md)
is upstream's page: its results for octabam's effects and how the model compares with their unit (3.0 % above it on
average over 38 settings of 22 effects).

It lives here, not under `sdk/octabam/tools`, because that folder is part of the module-source fingerprint
(`scripts/module-source.mjs`): no compiler reads these files, so they must not make every package count as rebuilt.

```bash
sdk/cycle-scan/build-tools.sh                                   # once: dsp56300 at the pin, dsp_host with -steptrace
cd sdk/octabam                                                  # needs your own OS extraction in out/raw/
python3 ../cycle-scan/interlock_scan.py --selftest              # the manual's own examples
python3 ../cycle-scan/interlock_scan.py lofi2 --sweep --json out/scan/lofi2.json
python3 ../cycle-scan/interlock_scan.py "PLATE REV" --sweep     # a stock effect, from your OS file
```

Modwerk's adaptations, both recorded: the scanner finds the octabam tree at `sdk/octabam` (`OCTABAM_ROOT` overrides),
and, since Modwerk has no SEND module (FX2 id 0x09 is LOFI2's), its scratch image is the module beside the stock
effects with no fallback, as the modules' own `perf.py` build theirs.

It is a model, not a measurement: the unit stays the judge ([MODULE_PERFORMANCE.md](../../docs/MODULE_PERFORMANCE.md)).
