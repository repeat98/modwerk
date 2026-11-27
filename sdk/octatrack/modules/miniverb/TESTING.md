# Mini Verb 0.2.4-experimental testing

This update only lowers DSP cost; the output is meant to be identical to 0.2.3, sample for sample. It brings over the
MINIVERB speed-ups of octabam's DSP audit (Yves Rosius, sambanks/octabam, MIT, Copyright (c) 2026 Sam Banks):

- `05971e11` and `af7f4112`: each delay-tap offset (`move #>off,n5`) loads right after the access before it instead of
  just before its own access, so the three cycles the address unit waits before using a freshly written `n5` overlap
  the work between taps (DSP56300 Family Manual A.2). Straight-line code: nothing between the old and the new place
  names `n5`. Input diffuser 113's write at offset 0 is `move a,y:(r5)`, with no `n5` load.
- `0a85c45d`: a constant `#>$XX0000` moved into a data register is the one-word short immediate `#$XX` (bits 23-16):
  0.75, 0.625 and the branches' 0.5 gains, 127/128 at MIX's and TONE's top, and TONE's 1/16 crossover (Modwerk's own
  code, the same form).
- `9268e8ed`: the clear counter's `sub #>$1,a` and RATE's `add #>$1,a` are 6-bit immediates.

octabam's patch places 10 of its 16 hunks on Modwerk's fork with `patch -F0`; the input diffusers, the clear counter,
the 127/128 constants and the duplicate load of line 4's write offset were placed by hand (Modwerk's fork already keeps
`y1` for diffusers 173 and 449). The published 0.2.3 source is kept as
[upstream/miniverb-0.2.3.asm](upstream/miniverb-0.2.3.asm); earlier records are in [evidence/](evidence/testing-0.2.3.md).

## Same output

| Check | Result | Where |
| --- | --- | --- |
| Widened identity gate (`sdk/cycle-scan/verify_ident.py`), reference stamped on main's 0.2.3: own slot and the other, payload B, 15- and 16-sample blocks, 2 s, a ramp of every knob with RATE stepping, stereo input, the split call, the r7 instance block after every block | IDENTICAL, 56 of 56 settings, no instance-block difference | `dsp_host`, 23 Nov 2026 |
| `verify.py` (this folder) against published 0.2.2, which 0.2.3 matched bit for bit: eight moving instances on both cores, every trig split, hot input at each TONE, exact dry, the 15,870-word write guard, dirty state, a 30 s guarded render | 76 of 76 checks pass | `dsp_host`, 23 Nov 2026 |

Both are emulator results: they show the code computes the same samples, not how it runs on a unit.

## Cost

| Measure | 0.2.3 | 0.2.4 | Source |
| --- | ---: | ---: | --- |
| Cycle scan, dearest setting (RATE 0.34, every knob at its minimum), cycles a sample | 698.6 | **600.4** (-98.2, -14 %) | `sdk/cycle-scan/records/miniverb.json` |
| of them pipeline stalls (address unit) | 159.3 (96) | **71.3** (6) | the same |
| Executed instructions a sample at that setting | 363.4 | 362.4 | the same |
| Modeled cycles: static sample-loop word span (`cycle_count.py`), the figure the package declares | 411 | **402** | `cycle_count.measure` |
| Program words | 538 | 525 | the same |
| DSP T1-4 added in use on T1 FX2 at defaults (`device:price`, same scene, same twin) | 13.6 points | **11.7** (twice; 11.5 on Part 1) | MKII, below |

The package declares `cycles` 402, `cyclesKind` modeled: the same measure 0.2.3's 411 was, taken on this source. The
loader charges a modeled figure at 7/4, so 402 is charged 704 chip cycles (411 was 720), against the 600 the scan
models at the dearest setting.

## Test procedure

### Test procedure: miniverb 0.2.4-experimental, 27 November 2026

Build: revision `32901e0ae` (the owner's re-signed build approval of 27 November), package SHA-256
`cf610384ad37447fbd9dc5fb59d326edeeafb0fb993f3caf376f3d46f55c5f84`, the same bytes as the 23 November unit run below.
`npm run test:procedure -- miniverb --no-unit --no-emulator`, 8 s.

| # | Step | Result |
| --- | --- | --- |
| 1 | Software checks (`npm run module:doctor -- miniverb`) | passed |
| 2 | Beside every other module (`npm run modules:compat -- miniverb`) | passed |
| 3 | Name the build (`npm run module:dev -- miniverb --build-only`) | passed: `cf610384` |
| 4 | DSP cost model (`node scripts/cycle-scan.mjs check`) | passed; the unit reading (12.6 points = 571 cycles on T1 FX2) is 0.89 of the scan's 641, so the model over-charges |
| 5-10 | Emulator rehearsal and the unit steps | not run in this run: left out with `--no-emulator` and `--no-unit` |
| 11-12 | By hand, and the submitter's own stage | to do: the owner's |

On the unit, 26 November 2026, outside the runner: `device:price --write --curve --memory` of `cf610384` on the owner's
MKII (development twin `46c30886` of base 0.8.2, built from main `48f4a9b9c`; Dev17 C04, rebuilt in the working copy):
at rest frame +0, in use on T1 FX2 frame +0 and DSP T1-4 +12.6 points, module pool 3,424 bytes; curve first 0, each 0
(points 80.3, 78.7, 79, 79, 79.8 on T1, T3, T6, T7); admitted alone on the empty (52.2 %) and the medium (80.6 %)
pattern, nothing dropped, no stalls; rolled back.

Not tested on a unit for this record: the runner's scripted pass and soak (the 23 November run below is the last), a
power cycle, a listen.

### 23 November 2026

Agent's run on the owner's MKII, 23 November 2026, through the unit queue: a development twin of main's base
(`13fed04b`, `build_core.py --dev` with the beta flags) RAM-booted from the owner session's twin `9138bd29`, a private
build of this source (`module:dev --build-only`, SHA-256 `cf610384ad37447fbd9dc5fb59d326edeeafb0fb993f3caf376f3d46f55c5f84`,
declaring 402 modeled cycles), then `9138bd29` booted back. Nothing was kept and no Part was saved.

Steps 1 to 5 were not run as the procedure runs them: `module:doctor`, `modules:generate` and the package import refused
0.2.4 that day, because the owner's build approval did not name this source yet (it does since 27 November, above). Step 4's scan
record is current. The unit steps ran one by one:

| # | Step | Result |
| --- | --- | --- |
| 6 | status, inventory | twin `13fed04b`, empty inventory |
| 7 | `device:test --soak 120` (Part 2: Part 1's working copy differed from its saved copy, so it refused there) | passed: self-test with the package installed, Mini Verb on FX2 of T1 (453 per mille peak) and T5 (532) admitted in 118 ms each; all at once on eight tracks five placed and three refused by DSP admission, CPU 36.4 %, core peaks 683 and 678 per mille; Part switches 12 of 12; 120 s soak, highest core peak 736 per mille; rolled back |
| 8 | soak | inside step 7 (no MIDI bridge for `octatrack-soak.mjs` in this run) |
| 9 | `device:price` | at rest: frame +0.0 to +0.1 points (under the 0.2 limit), CPU +0.1 to +0.3; in use on T1 FX2: frame +0, DSP T1-4 +11.7 points, against published 0.2.3's +13.6 in the same run (about 86 cycles a sample less at defaults, as the scan predicts) |
| 10 | inventory | unchanged, empty |
| 11 | by hand | not run: no screenshots or USB recordings in this run; the pages and controls are unchanged from 0.2.3 |
| 12 | the submitter's own stage | not run yet |

Edge cases:

| Case | Why this change makes it a risk | How run | Result |
| --- | --- | --- | --- |
| Many instances, both cores | moved tap loads and a smaller declared cost change what is admitted beside other instances | `device:test` all-at-once pass, eight tracks | pass: five placed, three refused by admission, no fault |
| Part switches while playing | every switch re-inits the instance | `device:test`, 12 switches | pass |
| Trig splits and block sizes | the reordered loop runs for any frame count | identity gate `split/`, `f16/`; `verify.py` all 16 splits | pass (emulator) |
| Payload B, core 1 | the same code runs on both cores | identity gate `B/` (emulator); unit picks on T1 and T5 | pass |
| Sidechain Compressor's key window | the ring must still stop at 15,870 words | `verify.py`'s guarded renders and its 0.2.2 control | pass (emulator) |
| Install and rollback | the package changed | `device:test` trial | pass, inventory unchanged |
| Sound by ear, two instances by ear, Part and project reload, Keep and power cycle | only a person at the unit can judge | the submitter's stage 12 | not run: left to the owner |
| MKI | another model | none on this computer | not run |

## Not yet done for this source

- Listening, two instances by ear, Part and project reload, a Keep and a power cycle (the submitter's stage 12).
- A chip-cycle reading at the scan's dearest setting, which would let the declaration become a `hardware` figure.
- None of octabam's speed-ups has a unit reading upstream: they were proven in `dsp_host` only. The reading above is the first.
