# Cycle scan

Prices the path an Octatrack DSP effect executes: each instruction's cycles from the DSP56300 manual (Table A-1) and
the idle cycles the core inserts for some sequences (pipeline stalls, sections A.2 and 3.5), with the sites that stall.
`cycle_count.py` counts words and `dsp_host -meter` counts instructions; neither sees cycles.

Imported from [sambanks/octabam](https://github.com/sambanks/octabam) at `cc7cffc1` (#1169), recorded in
[`sdk/imports/octabam-cycle-scan-cc7cffc1.json`](../imports/octabam-cycle-scan-cc7cffc1.json) with each file's licence:
`interlock_scan.py` (by Yves Rosius) and `CYCLE_SCAN.md` are octabam's own, MIT (Copyright 2026 Sam Banks, its
`LICENSE`); `dsp_host.cpp` is an addition to the dsp56300 emulator and under its licence, GPL-3.0-only (octabam's
`THIRD_PARTY.md`, [`../octabam/licenses/dsp56300.txt`](../octabam/licenses/dsp56300.txt)). [CYCLE_SCAN.md](CYCLE_SCAN.md)
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
the dearest setting's instructions, cycles and stalls, and the same at the module's defaults (`defaults_setting.py` names
that run), bound to the module's source by the hash `performance.json`'s `sourceSha256` uses. It writes nothing when the
tree it scans holds other module source than this repository. `check` fails a record whose module source has changed since
(scan it again) and a `performance.json` recording fewer than 90 % of the instructions the scan saw executing; it lists the
DSP modules without a record, without failing them. It also compares what the base's DSP admission charges the
module's package (`dsp.c`'s `charged()`: a hardware figure as it is, an emulator figure at 7/4) with the scan's dearest
cycles. A charge less than 5 % above the model is listed as a near miss; one below it is refused for a module first listed
from 24 November 2026 and reported for an earlier one. On 23 November 2026 E-Verb (669 against 664.9) and MINIVERB (720
against 698.6) were near misses, and LOFI2's hardware figure, 637, was under its 654.3 at DOWN/max. The records sit here,
not in the module folders, which belong to their authors.

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

## Checked against the unit

```bash
node scripts/cycle-scan.mjs unit              # anywhere: each record against its module's in-use reading; a report, it fails nothing
node scripts/cycle-scan.mjs unit --markdown   # the table below
node scripts/cycle-scan.mjs unit --write      # writes it here; `check` fails when the committed table differs
```

Each module's `evidence/cpu-price.json` holds a reading `npm run device:price` took on an MKII: the DSP load meter of the
slot's core with the effect picked on that slot in place of NONE, against the same scene without it (`inUseAdds`; T1-T4
are core 1's meter, T5-T8 core 0's). A fresh pick starts from the effect's defaults, so the report compares the reading's
mean with the scan's run at the defaults, and its peak (the core's busiest block, which `device:price` keeps from
24 November 2026) with the dearest run, which bounds every setting. **Scale:** one point of the meter is 45.32 cycles a
sample. `status.c`'s `busy()` gives per mille of `FRAME_CYCLES`, 72,520 (4,532 cycles a sample, the board's clock, as
`CYCLE_SCAN.md`'s "% of a frame" uses, times 16 samples a frame), from idle passes whose cycles were calibrated on the
unit with `--dsp-burn` (11 October 2026, `idle_cycles` there). A module whose package requires a base DSP feature with a
`hardware` charge in `sdk/machines/octatrack/dsp-sites.json` (the key bus) has it added to the model, since that work runs
outside the effect's proc and so outside the scan.

**Only like cases are compared.** A reading and a model are paired when they cover the same package of the record's
version, the same setting, the transport playing, the same key-bus input for a module that reads the key bus (the scan's
`dsp_host` feeds it silence; a reading names its own in `inputs.keyBus`, `live` or `silent`), and, where a base charge is added,
a reading taken on a base that charge was timed on (the identities its evidence names). Any other pair prints "not
comparable" with the reason and no ratio: re-measure on that case rather than read the gap as a model error.

The readings, 18 November 2026, on development twins of base 0.7.8 (Sidechain Compressor's on another twin, `8850f539`),
one 8-second reading each; modules with no DSP code moved the same meters by -0.6 to +0.6 points (±27 cycles) in the same
runs, once 2.9. Records scanned 23 November 2026:

<!-- generated: node scripts/cycle-scan.mjs unit --write (cycle-scan check fails when it differs) -->
| Module | Unit, in use (points = cycles a sample) | Unit, peak | Defaults run | Model at defaults (+ base features) | Model, dearest (+ base features) | Unit ÷ model | Peak ÷ dearest | Verdict |
|---|---|---|---|---|---|---|---|---|
| airwindows-chorus 0.1.3 | – | – | defaults/def | 602 | 649 | – | – | no in-use reading on the unit |
| bbd 0.1.2 | 10.8 = 489 (T1 FX2) | – | STGS=1024/def | 469 | 528 | 1.04 | – | within 10 % |
| euclid 0.1.5 | 5.5 = 249 (T1 FX2) | – | RATE=1/16/def | 232 | 232 | 1.07 | – | within 10 % |
| everb 0.1.2 | 13.3 = 603 (T1 FX2) | – | REV=OFF/def | 603 | 665 | 1.00 | – | within 10 % |
| lofi2 0.1.1 | 10.3 = 467 (T1 FX2) | – | RING/def | 425 | 654 | 1.10 | – | within 10 % |
| miniverb 0.2.3 | 14.1 = 639 (T1 FX2) | – | RATE=1.01/def | 641 | 699 | 1.00 | – | within 10 % |
| ring-sc 0.2.1 | 7.5 = 340 (T1 FX2) | – | DUCK/def | 5 + 43 keybus | 122 + 43 keybus | – | – | not comparable: the reading does not say what its key bus carried, the scan's was silent; the unit read on d3d71297, the keybus charge (43) was timed on 856cbbcf |
| sidechain-compressor 0.2.2 | 5.5 = 249 (T5 FX1) | – | MON=OFF/def | 107 | 107 | – | – | not comparable: the unit measured package 9f22861f, not the published 0.2.2-experimental (f403fd92); the reading does not say what its key bus carried, the scan's was silent |
| tapehead 0.1.2 | 9.3 = 421 (T1 FX2) | – | COLOR=NORM/def | 425 | 426 | 0.99 | – | within 10 % |
| vibrato 0.1.0 | – | – | SHP=SINE/def | 204 | 207 | – | – | no in-use reading on the unit |
<!-- end of the generated table -->

- **Effects whose work is all in their proc:** the model at the defaults is 1 % above to 10 % below the unit (mean 3 %
  below), for six modules. LOFI2 (9.95 %) is the widest, and EUCLID's 7 % is within the meter's noise at its size.
  Upstream found its model 3.0 % *above* its own meter (`CYCLE_SCAN.md` section 1): the two meters differ, and Modwerk's
  reads 7 to 19 % above octabam's slot costs for the same DSP code (LOFI2, BBD, EUCLID). None of these readings kept a
  peak, so nothing is compared with the dearest run yet.
- **The key-bus effects are not comparable yet.** RINGMOD SC at its defaults runs 2.5 instructions a sample in the scan,
  whose key bus is silent, while the unit's kick on T1 fed it: the unit read 340 cycles on core 1 and +0.9 points (41) on
  core 0. Its reading was also taken on 0.7.8's 41-instruction tap, before the one-pass tap the charge (43) was timed on.
  Sidechain Compressor read 249 on its own core and +6.3 points (285) on the other, where it has no instance: its detector
  and the key-bus tap are base-resident code on both cores (`dsp-sites.json`'s `sidechain` and `keybus`), outside the
  proc, and the build it was read on is not the published package. To compare them: read both on the current base with
  what the key bus carried recorded, and scan their key path with the key bus fed.
- **No reading to compare:** VIBRATO and Air Chorus (`airwindows-chorus`) have no `cpu-price.json` in-use reading yet;
  Output Matrix has no scan record (its mix is base-resident code too).
