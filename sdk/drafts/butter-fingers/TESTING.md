# Butter Fingers 0.1.0 testing

Draft. Host gate, an emulator comparison against stock and a reported hardware session; no owner-verified hardware qualification, no chip timing.

## Host gate

`python3 -B verify.py`: `butter_fingers.c` compiled for the host and driven with panel events. All 20 checks pass:
- **While pressed:** the first single detent is dropped while a trig or scene key is held; later turns, and a coalesced turn of two or more detents, pass.
- **After release:** that knob's turns are dropped for 9 ticks (150 ms), then pass.
- **Untouched:** other knobs, LEVEL, and turns with no trig or scene key held pass; no key is ever taken.
- **Boot state:** a state of garbage, as card builds leave `.bss`, behaves as a fresh one.
- **Generated unit:** `butter_fingers_core.s` is what `generate.py` makes from `butter_fingers.c`.

## Package

Built through the Octabam manifest: `sdk/runtime/loader/build.py --octabam butter-fingers --stock <OS 1.40C>`, with the draft linked into `sdk/octabam/modules` for the build.
- **Size:** module `5cf69df3`, 544 bytes of code and data, 44 bytes of state, 4 relocations, 3 hooks (`module_key`, `module_enc`, `module_tick`), no stock-code sites.
- **Stock-free scans:** both strict scans pass. A first build addressed every state field absolutely, and its relocation list (small ascending offsets) matched a 19-byte run of the stock OS. The state is now reached through one pointer word, which gives one relocation per function.

## Emulator (ot_emu)

Setup:
- **Emulator:** the adapted `ot_emu` (`scripts/octatrack-emulator/build.py`) running the flashed beta base `cd39c494`, with the package installed over emulated USB.
- **Project:** an empty project, T1 with a trig on step 1 and grid REC on.
- **Measurement:** the lock is T1 step 1's STRT lock (a pattern byte), read before and after each step. Knob presses are key `0x39` (B), turns are encoder 1.

| Step | Stock | Butter Fingers |
|---|---|---|
| hold trig 1, turn B +5 | lock 5 | lock 5 |
| press B, 1 detent, release, +1 after 50 ms | 5 → 13 (×7 jump, not removed) | removed |
| press B, 3 single detents | +21 (3 × 7) | +14 (first dropped, 2 × 7) |
| +1 after 400 ms | lock +1 | lock +1 |
| no trig held: turn B +1 | Part value, no lock | the same |
| no trig held: press B, +1 while pressed | the same in both | the same in both |

The press is a lock toggle applied on release: pressing an unlocked value writes a lock at its current value, as in stock. Each step's record is in the pull request.

## Hardware (reported, not verified)

Tester Jan Kolkmeier, 25 October 2026: Octatrack MKII, OS 1.40C, flashed beta base `cd39c494`, over USB, beside Ringmod SC 0.2.0, Deja Vu, Preview Vol 0.1.2 and FM Synth.
- **Removing p-locks** with a knob press: they now stay removed.
- **The 150 ms window** still feels immediate.
- **Coarse press + turn** feels good, one detent late.
- **Scene locks and trig locks** work as described; project-name editing is unaffected.

The session ran the previous build of the same logic (`618a450d`, built directly from the C source). The reorganised package above (`5cf69df3`, same behaviour in the host gate and in ot_emu) was not yet re-run on the unit when this was written.

## Not tested

- MKI (no knob presses).
- Chip timing: the hooks are a few dozen instructions per panel event and one per UI tick; not measured.
- Power-cycle restore of a set with the module.
- Every stock page with press + turn; only the flows above were checked.
- MIDI CC input, which doesn't pass the knob hooks.
