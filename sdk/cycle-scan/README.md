# Cycle scan

Prices the path an Octatrack DSP effect executes: each instruction's cycles from the DSP56300 manual (Table A-1) and
the idle cycles the core inserts for some sequences (pipeline stalls, sections A.2 and 3.5), with the sites that stall.
`cycle_count.py` counts words and `dsp_host -meter` counts instructions; neither sees cycles.

Imported from [sambanks/octabam](https://github.com/sambanks/octabam) at `cc7cffc1` (#1169, GPL-3), recorded in
[`sdk/imports/octabam-cycle-scan-cc7cffc1.json`](../imports/octabam-cycle-scan-cc7cffc1.json). [CYCLE_SCAN.md](CYCLE_SCAN.md)
is upstream's page: its results for octabam's effects and how the model compares with their unit (3.0 % above it on
average over 38 settings of 22 effects). It is kept byte for byte, so its links to `COSTS.md`, the unit's measured
figures, lead nowhere here: read
[upstream's COSTS.md](https://github.com/sambanks/octabam/blob/cc7cffc1a675a763c5b8d6fbe1659f2b322cc540/docs/contributing/COSTS.md)
at the same revision.

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

## Records and the check

```bash
node scripts/cycle-scan.mjs record lofi2 vibrato   # on your computer; OCTABAM_ROOT names a built tree other than sdk/octabam
node scripts/cycle-scan.mjs check                  # anywhere; npm run check runs it through scripts/cycle-scan.test.mjs
```

`record` scans the module and the stock effect its `performance.json` compares it with, and writes `records/<id>.json`:
the dearest setting's instructions, cycles and stalls, bound to the module's source by the hash `performance.json`'s
`sourceSha256` uses. It writes nothing when the tree it scans holds other module source than this repository. `check` fails
a record whose module source has changed since (scan it again) and a `performance.json` recording fewer than 90 % of the
instructions the scan saw executing; it lists the DSP modules without a record, without failing them. The records sit
here, not in the module folders, which belong to their authors.

It is a model, not a measurement: the unit stays the judge ([MODULE_PERFORMANCE.md](../../docs/MODULE_PERFORMANCE.md)).
