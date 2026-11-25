# The widened identity gate on Modwerk's modules (23 November 2026)

What was checked: whether octabam's widened identity gate (`sdk/cycle-scan/verify_ident.py`, from octabam `e4c207a2`)
runs on Modwerk's tree and toolchain without octabam's SEND module, and whether it catches faults the old gate
(`sdk/octabam/tools/verify/verify_ident.py`, octabam `cc6f3293`) lets through. Everything here ran in `dsp_host` on the
emulated DSP core: it is no hardware evidence.

## Setup

- Worktree of `main` at `9ab35114e`, WSL Ubuntu, `dsp_host` built by `sdk/cycle-scan/build-tools.sh` (dsp56300 at
  octabam's pin, with `-steptrace`), the owner's own OS 1.40C extraction in `sdk/octabam/out/raw/` (not committed).
- Old gate: Modwerk's copy, changed only where it cannot run here. Its scratch dump is built the way the new gate builds
  it (the module beside the stock effects, no SEND), its SEND check is dropped, and an unnamed parameter no longer stops
  it (octabam `ee85d43b`'s one-line fix; without it the old gate cannot run on MINIVERB, BBD or LOFI2 at all). It renders
  and compares exactly what it did: FX1's r7 block, payload A, 15-sample blocks, 6,000 samples, mono, audio only.
- Each fault: both gates stamped a reference on the clean module, the one-line fault was put into
  `sdk/octatrack/modules/<id>/`, the mirror refreshed, both gates checked, the file restored.

## Ten planted faults

| | Module | Fault | Old gate | New gate: caught by |
|---|---|---|---|---|
| F0 | MINIVERB | the first input allpass coefficient one bit off (`$600000` to `$600001`) | caught, 18 of 19 | 55 of 56 renders |
| F1 | VIBRATO | octabam's FX2 dry decision put back (`tpl x0,b` for Modwerk's `nop`): an FX2 instance passes dry | missed, 11 of 11 identical | 55 of 58 renders, and both controls (defaults, max and dear render the same) |
| F2 | VIBRATO | SPD and DEP glide 1/32 made 1/16 | missed | `ramp` |
| F3 | EUCLID | the R channel takes the parked L input | missed | `stereo/`, 7 renders |
| F4 | EUCLID | a dead write to a free instance word (`$7e`) | missed | the instance block, all 41 renders |
| F5 | EUCLID | #1690 undone: AMP's gain is not cleared when TYPE leaves AMP | missed | `ramp` |
| F6 | BBD | FRZ 127 writes the input into the line instead of the old bucket | missed | `long/max` only |
| F7 | BBD | TONE's low glide 1/16 made 1/8 | missed | the instance block (`$17`), 16 renders |
| F8 | MINIVERB | the sample loop runs a fixed 15 frames in place of the block's `n7` | missed, 19 of 19 identical | `f16/` (10) and `split/` (2) |
| F9 | LOFI2 | SHIFT DOWN keeps the carrier step in use positive | missed | `ramp` |

The old gate caught 1 of 10, the new one 10 of 10, as octabam measured on its own modules (19 November 2026). F2, F5 and
F9 are reached only by the ramp: the old gate's settings never step EUCLID's TYPE or LOFI2's MODE (the first small select
is RATE and RNGE), and a held knob primes VIBRATO's glide at once. F1 is the case the placement and defaults-against-max
controls exist for: the old gate renders FX1's slot, where VIBRATO runs live with or without the fault.

A first draft of F8 moved one of MINIVERB's delay taps by a word, meant to be seen only after 0.136 s; both gates caught
it at once (a tap's position in the shared ring is not its delay), so it was replaced by the block-size fault above.

Renders a module gets: MINIVERB 56, VIBRATO 58, EUCLID 41, BBD 40, LOFI2 40. A run takes 15 to 25 s, the scratch build
included. Every module renders on FX2's slot (r7 2) with FX1's as the other slot, and on both payloads.

## The control in place of SEND

octabam's gate refuses a dump in which the module's fx id dispatches to SEND's entry points: with SEND as the remix's
fallback, that is what an id the build left out resolves to. Modwerk has no SEND, and its scratch image falls back to the
stock effect on that id, or to NONE. The control here refuses entry points equal to those of the pristine stock image's
dispatch for the same id, or to NONE's (id `0x00`), on each payload it renders.

## A real port

MINIVERB with octabam's four speed-ups (`05971e11`, `af7f4112`, `0a85c45d`, `9268e8ed`) on Modwerk's 0.2.3 fork,
against a reference stamped on 0.2.3: IDENTICAL, 56 of 56, no instance-block difference. That is the module release's
own proof; its pull request carries the rest.

## Reproduce

The fault script and the old-gate shim are kept outside the repository with the run's logs; the faults are the one-line
edits in the table. With a built tree:

```bash
python3 sdk/cycle-scan/verify_ident.py vibrato ref
sed -i '69s/nop /tpl     x0,b/' sdk/octatrack/modules/vibrato/vibrato.asm && node scripts/mirror-octatrack-modules.mjs
python3 sdk/cycle-scan/verify_ident.py vibrato check      # DIFFERS, and both controls fail
git checkout -- sdk/octatrack/modules/vibrato && node scripts/mirror-octatrack-modules.mjs
```
