# Butter Fingers 0.1.0 testing

Host gate, an emulator comparison against stock, emulator cycle and stress records, and hardware sessions reported by the author; no owner-verified hardware qualification, no chip timing.

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

## Performance (ot_emu, not hardware)

Record: `evidence/performance.json`, checked with `npm run perf:audit -- check sdk/octatrack/modules/butter-fingers/evidence/performance.json` (all rows pass).

Setup:
- **Emulator:** Modwerk's adapted `ot_emu` (`python3 -B scripts/octatrack-emulator/build.py --native <octabam checkout>`, octabam `f7d72906`), `--dsp --frame --max 4000000000`, a staged card with a mounted project. The plain upstream build refuses every USB submission at SETUP.
- **Base and package:** beta base `771f160f` (0.7.3, built locally from main with `npm run octatrack:base -- --beta`), package `c470e87a` installed over emulated USB with `scripts/device.mjs --emulator`.
- **Counting:** executed instructions from each handler's entry to its return, with ot_emu's `watch`/`hits` on the linked addresses of `bf_key`, `bf_enc` and `bf_tick`.

| Handler | Calls | Own dearest path (instructions) |
|---|---|---|
| `bf_key` | 48 | 46 |
| `bf_enc` | 66 | 30 |
| `bf_tick` | 474 | 8 |

- **Gestures:** TRIG 1, SCENE A and SCENE B held in turn; knobs A, D and F turned to set a lock, pressed, turned while pressed and within 150 ms of release; then every knob pressed and turned with nothing held.
- **Dearest whole call:** 28,352 instructions, one `bf_enc` call that a frame interrupt landed in (stock and interrupts included). Budget: 26,600,000 (perf:audit's key trigger).
- **Stress:** 21 rounds of PLAY (all eight tracks running), the dearest gesture (about 1,546 audio frames), STOP and a Part change (PART + UP or DOWN; the Part changed every round). Playing afterwards, frames still advanced (216,045). No hang.

## Memory

From the assembled unit (`m68k-elf-as -mcpu=5407`, `m68k-elf-size -A`): `.text` 540 bytes, `.data` 4, state `bf` 42 (`.comm`, set up on first use through its magic word). Package `c470e87a`: 652 bytes, 4 relocations, 3 hooks, no stock-code sites. Stack: each handler pushes one register (4 bytes) on the caller's stack. No heap.

## CPU price

`npm run device:price -- butter-fingers` on 18 November 2026: the author's MKII, RAM-booted into a development twin of the current base (`build_core.py` with the beta flags but the controller rows, plus `--dev`; base `37319f9a`) with `npm run device -- boot DIR --chunk 1024`, then `npm run device -- serve --share /tmp/modwerk-share.sock`. Scene: the author's scratch project, a pattern with STATIC and FLEX tracks playing; 8 s per reading; installed as a trial and used nowhere (it has no slot).

| Run | Frame interrupt before → installed | CPU meter before → installed | Skipped |
|---|---|---|---|
| 1 | 39.3 → 39.4 % (+0.1) | 55.9 → 55.8 % | 0 |
| 2 | 39.5 → 39.5 % (+0.0) | 56.3 → 55.8 % | 0 |

Recorded price: +0.1 points (`resources.cpuPrice`). Both trials were rolled back.

The boot needed more patience than the client gives: on the flashed base `dd683f35` the unit refused a frame for over a second at times while staging the 1.3 MB image, and the client's 8 retries (about 0.1 s) gave up. With the retries raised to 300 for that run only (a local change, reverted), the image staged in about three minutes. 4 KB frames stalled on this base.

## Hardware (reported, not verified)

**18 November 2026, release candidate.** Tester Jan Kolkmeier (author): Octatrack MKII, OS 1.40C, flashed Modwerk base 0.7.1 `dd683f35`, package `c470e87a` (module `5cf69df3`) kept beside FM Synth 0.1.3, over USB. The agent read the kept set back from the unit (`npm run device -- do inventory`: FM Synth, Butter Fingers) before the session and after the power cycle. The author reported every step as expected:
- **Trig locks:** with a TRIG held, set a lock, then pressed the knob to remove it, letting the finger slip; no stray lock was written.
- **Press + turn:** about seven times on different knobs, the coarse edit still works.
- **Scene locks:** the same with SCENE A and with SCENE B held.
- **Untouched controls:** plain knob turns, TEMPO and LEVEL as stock.
- **Power cycle:** lock removal worked again after it.

**25 October 2026, earlier build.** Tester Jan Kolkmeier: Octatrack MKII, OS 1.40C, flashed beta base `cd39c494`, over USB, beside Ringmod SC 0.2.0, Deja Vu, Preview Vol 0.1.2 and FM Synth.
- **Removing p-locks** with a knob press: they now stay removed.
- **The 150 ms window** still feels immediate.
- **Coarse press + turn** feels good, one detent late.
- **Scene locks and trig locks** work as described; project-name editing is unaffected.

That session ran the previous build of the same logic (`618a450d`, built directly from the C source).

## Not tested

- MKI (no knob presses).
- Chip timing on the unit: only emulator instruction counts (above).
- Beside MIDI Scenes on MIDI tracks, and beside Arp Key Locks in MIDI ARP SETUP.
- Every stock page with press + turn; only the flows above were checked.
- MIDI CC input, which doesn't pass the knob hooks.
