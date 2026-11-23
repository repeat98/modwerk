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

## The identity gate: proof that a speed-up changes no sample

A change that only reorders or re-spells DSP code (the remedies in [CYCLE_SCAN.md](CYCLE_SCAN.md)) must render exactly
what it rendered before. `verify_ident.py` is octabam's widened gate (Yves Rosius, octabam `e4c207a2`, MIT), recorded in
[`sdk/imports/octabam-verify-ident-e4c207a2.json`](../imports/octabam-verify-ident-e4c207a2.json). Stamp a reference on
the tree you trust, then check the candidate against it:

```bash
OCTABAM_ROOT=<trusted worktree>/sdk/octabam python3 sdk/cycle-scan/verify_ident.py miniverb ref
cp <trusted worktree>/sdk/octabam/out/ident_miniverb_ref.json sdk/octabam/out/
python3 sdk/cycle-scan/verify_ident.py miniverb check       # IDENTICAL: 56/56 settings bit-identical
```

It builds a scratch image with the module beside the stock effects every run and renders 40 to 60 settings through
`dsp_host`: every value of the first small select, hot, cool, zeros, max and the manifest's `dear` knobs, on the module's
own slot and the other one, on payload B, in 16-sample blocks, over 2 s, with a ramp of every knob, with different L and
R inputs and with the dispatcher's split call, and it compares the instance block (r7 `$00..$83`) after every block. A
word the change stopped writing on purpose is named with `--scratch 0c,47`. Two controls fail a run that never reaches the
module: its fx id must dispatch to other code than the stock image's and NONE's (Modwerk's control: octabam's compares
with its SEND module, which Modwerk does not have), and `defaults` must render other audio than `max` or `dear`. On ten
faults planted in Modwerk's modules the old gate caught one and this one all ten
([record](../../docs/verification/2026-11-23-widened-identity-gate.md)).

CYCLE_SCAN.md's `make verify-ident MOD=<name>` means this script here. The copy under `sdk/octabam/tools/verify/` is the
old gate as octabam's tree had it at the 16 November import; it asks for SEND and cannot run in Modwerk, and it stays
because that folder is part of the module-source fingerprint. Neither the gate nor the scan is hardware evidence: a
bit-identical render on the emulator's DSP core says nothing about timing on a unit.

It is a model, not a measurement: the unit stays the judge ([MODULE_PERFORMANCE.md](../../docs/MODULE_PERFORMANCE.md)).
