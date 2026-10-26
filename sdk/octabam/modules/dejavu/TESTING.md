# DEJA VU — testing (0.1.0-experimental, 24 Oct 2026)

Evidence: the owner's MKII over USB with the exact release package (below), the author's first use on their own MKII with earlier sources, host tests and ot_emu on OS 1.40C.

## Release package on hardware (owner's MKII, 24 Oct 2026)

Package `dejavu/0.1.0-experimental.mwrm`, SHA-256 `95079643d3e11914a9fcea21c3417bd95fe7083333660470147d7e89a1f53260`, from Modwerk commit `224d11dd` (byte-identical from `3bd9cc18`). Both strict stock-free scans pass (no run shared with the stock OS). Full record: [evidence/hardware.md](evidence/hardware.md).

| Check | Result |
|---|---|
| Install and Keep on the flashed beta base `b5fae2ae` | accepted, generation 1 |
| Self-test | passed: 1/1 intact, longest frame 374 µs, card set saved |
| Owner's power cycle | restored; self-test passed again (1/1, 374 µs) |
| Removal | accepted, set empty |
| WAVE list (development twin `7889c57a`) | T7, T8, DJV, DJQ, DJC with labels and icons; stops at DJC |
| DJV, MULT 1X, SPD 127, playing | output held `0x00510000` through two pattern passes |
| DJV, MULT 1X, SPD 0 | a new whole value every step |
| DJV, MULT 2X, SPD 127 | exactly two values, alternating |
| DJQ on PTCH, DEP 127, MULT 8X | only −25, 0, 35, 60 knob steps (−5, 0, +7, +12 semitones), the same each pass |
| Removal on the twin | dispatch slots back to stock SAW, WAVE count 19 |

Not tested on hardware: HOLD, TRIG, ONE and HALF; p-locks, scenes and the crossfader on SPD or DEP; trig conditions, one-shots, microtiming; a project with WAVE 19-21 without the module; listening; the card build; an MKI.

## Cost and memory (release package)

- **Static bound (ColdFire), from the compiled unit `dejavu_core.s`:** the handler's call path about 57 instructions, `dv_call` 343 plus 345 for its 116-byte set-up loop on an LFO's first use, `dv_visit` 55, `dv_quant` 116 plus at most two extra passes of each note-reach loop. At most 950 instructions an LFO in one frame (first use, DJQ), about 600 afterwards, 22,800 with all 24 LFOs calling in the same frame. Instructions, not cycles. Between value changes an LFO costs only the handler's check.
- **Memory:** one linked unit of 2,784 bytes (2,776 of text, 5 of rodata, aligned; it holds the code, the three labels and icons and space for the two grown tables) and 2,784 bytes of state (116 for each of the 24 audio-track LFOs). Stock writes: three dispatch slots (12 bytes), the WAVE count (4), two `moveq` immediates (2 each), three `lea` operands (12): 32 bytes. Card builds grow the two tables with TableGrow instead of filling the unit's space.

## Performance (`evidence/performance.json`, ot_emu, 24 Oct 2026)

`npm run perf:audit -- check sdk/octabam/modules/dejavu/evidence/performance.json`:

| Row | Verdict |
|---|---|
| cycles | ok: worst event 13,032 of 95,778 (14 %) |
| stock benchmark | note: under the same flood the longest frame interrupt grows by 32.9 µs (9.1 % of the 362.8 µs frame) and idle time falls by 1.5 points vs stock RND |
| stress | ok: 1,000 messages/s at 250 BPM for 62 s, no stuck note, no hang, 0 dropped |

What the extra interrupt time costs: the engine runs the wave handlers inside the frame interrupt, and in FREE every LFO of equally fast tracks changes in the same frame. With all 24 LFOs on DJQ at its dearest (PTCH, SPD 0, a new value every step) those frames take 32.9 µs more than the same LFOs on stock RND; other frames cost about 1,000 instructions on average. The one frame in which all 24 LFOs first set up their state, during a project load, took 202.9 µs against stock's dearest load frame of 131.8 µs, still inside the frame.

Commands (private, nothing committed): the Deja Vu card image from `composeStaticOs(original, ['dejavu'])`; two copies of the owner's template project with every LFO of bank A on stock RND or DJQ (written into `bank01.work` with `ot_project`'s offsets before the load); `ot_emu --image IMG --card CARD --set MODWERK --project TEMPLATE --mkii --dsp --frame --sequencer --internal-clock --frames 170888 --midi flood.midi --watch-pc 0x4000aad4,0x4000d9a6,<the four MIDI handlers>` on the original OS and on the Deja Vu image; a second run with watches on DJQ's entry and returns for the module's own instructions per frame.

## Author's first use (earlier sources)

Octatrack MKII, OS 1.40C, flashed Modwerk beta base `cd39c494`. Packages loaded over USB with `npm run device -- try … --accept` (Windows, WinUSB bridge). Observed by the agent: every version below loaded, ran its trial and was accepted; the base reported the package's module identity as active and stayed in its normal state. The latest, `dejavu.mwrm` sha256 `1347aca9…` (source `edceb9ab`, identical to the tested `51650ecc` on the developer's branch), is active as set generation 9.

Reported by the developer while playing (not measured):

| Check | Result (reported) |
|---|---|
| DJV, DJQ, DJC on the WAVE list; loop, DEJA, MULT and the TRIG modes | work as described (versions before `edceb9ab`) |
| SPD p-locked low on one trig | that step takes a new value every time, the rest of the loop stays |
| DEP p-locked to 0 on one trig (with a PTCH lock) | that step plays the locked pitch, unaffected by the LFO |
| DJQ, chromatic version (since replaced) | hard to tell from DJV by ear; measured why (25 cents on average) and replaced by root + fifth |

Removal with the waves in use (PR #869, finding 6), 24 Oct 2026, review-fixed build `675df8f7…`: T1's LFO 1/2/3 on DJV/DJQ/DJC, transport stopped, LFO SETUP closed; then a 120 s trial removal over USB (`npm run device -- remove dejavu.mwrm --seconds 120`, nothing written to the card). Reported by the developer while it ran: LFO SETUP showed track 8's design wave (icon and name) on all three LFOs, turning WAVE and paging LFO 1-3 worked, PLAY played the track with a stock wave, no hang and no garbage. Observed by the agent: the base stayed in its normal state and rolled the module back after 120 s (active `675df8f7…` again). Not tested: a permanent removal followed by a power cycle, and a project saved with WAVE 19-21 opened on stock firmware.

Review fix after this hardware use (PR #869, finding 1): PLAY now counts as a step, so FREE and HOLD play bar 1 exactly as bar 2 (verify.py covers 1-, 2- and 16-step tracks and both counter states at PLAY); not yet run on the unit.

Not tested on hardware: DJQ root + fifth (loaded, not yet played), DJC by ear, CPU load (CUE + PROJ), the self-test with Deja Vu, power-cycle restore of the kept set, a project with WAVE 19-21 opened without the module, trig conditions and one-shot trigs, microtiming in HOLD, Play Modes interplay.

## Host and emulator

| Check | Result |
|---|---|
| Host tests (`tools/otbench/tests/test_dejavu.py`, with a model of the step counter as measured) | 36/36: the DJV loop and TRIG modes as before; DJQ checked against the engine's own arithmetic (EMAC fractional, DEP word << 8): whole knob steps on any destination for DEP 1..127, on PTCH root and fifth with octaves, exact semitones, the notes in reach per DEP, equal odds, contour kept; re-snaps when DEP moves; DJC glides monotonically into each value over a step, the first value after PLAY jumps; switching waves keeps the loop; a state that starts as garbage behaves as a fresh one |
| Emulator: steps only on trigs | changes every 16th (5,514 samples) |
| Locked / fresh (ONE, MULT 4X) | repeat 1.00 / 0.00 (32 steps), measured before the TRIG modes; DEJA 64 was measured on the cubic curve, since dropped |
| TRIG modes in the emulator (T1, 16 steps, DEJA 127, 120 BPM) | FREE: a new slot every step without trigs, LEN 4 period 4, LEN 64 = the 16-step track; TRIG: slot 0 on each trig, then per step; HOLD: a trig added on step 3 leaves steps 1/5/9/13 unchanged; ONE: one slot per trig; HALF: one pass, then holds. Changes land within 0.01 step of the trig times. Probe findings: handler runs every frame in every mode; TRIG record n = mode (+8 on a trig); HOLD keeps the output held between trigs (record byte 12 = 4); the step counter moves one tick before the trig fires and shows 0 on the last step |
| p-locked SPD drives DEJA | yes (part SPD 0, locks 127 → locked) |
| Audible on PTCH | pitch follows the loop; 1 value unit ≈ 20 cents at DEP 127 |
| WAVE selector | icons + "DJV"/"DJQ"/"DJC" labels render (the cell drawer bounds the icon index at 19 in stock: poked to 21); encoder from DJV up 4 steps stops at DJC, label shown while turning (emulator) |
| Cost (24 LFOs on DJV, all tracks trig) | ≈ 580 instr/frame avg (≈ 0.6 % CPU), below stock RND, measured before the review; the fast path now also reads the track's run flag (≈ 10 instructions a call, estimated, not re-measured). The 64-value fill at first use is gone (steps fill as first visited), so no frame pays for it |
| DJQ and DJC in the emulator (T1, FREE, LEN 8) | DJQ on PTCH, root and fifth: at DEP 60 and 35 (SPD 40) the measured pitches equal the host model's notes step for step (DEP 60: 12, −5, 12, 0, −5, 0, …; DEP 35 only −5, 0, 7), each within 0.2 cents of the semitone. An earlier chromatic DJQ measured the same way: whole semitones, same notes as the model; dropped (switching DJV ↔ chromatic DJQ moves a note by 25 cents on average, too subtle to hear). PTCH: one knob step = 1/5 semitone (DJV levels 54/44 at DEP 127 = 10.8/8.8 st), LFO pitch stops at ±12 st. DJC: glides from value to value, largest frame-to-frame change under 0.5 level after the first value. WAVE cell draws DJQ and DJC icons |
| Cost (all 24 LFOs on one wave, every track trigging every step, TRIG FREE) | Deja Vu code 0.15 % (DJV), 0.17 % (DJQ), 0.15 % (DJC; 0.17 % in ONE) of all ColdFire time by ot_emu coverage; LFO engine + waves 7.3 % against 8.7 % for the same LFOs on stock RND |
| Trig kinds (emulator, T1, ONE mode, trig events counted at the handler) | sample trigs 1/5/9/13: all count; trigless trigs (step mask 1) alone: none; trigless locks: none; sample trig 1 + trigless trigs 5/9/13: all count, every bar, also with a 0.1 s sample that has ended. Not tested: trig conditions, one-shot trigs, retrigs, live trigs, microtiming |
| Uninitialised memory | the card build does not zero the module's state: earlier emulator loop values came from leftover memory. Now a magic word marks a set-up state, and both the handler and the C code set it up on first use |
| Image with module unused | audio bit-identical to stock (measured before the three-wave version) |
| Icon mask with the column index in its unused low bits (stock-free scan) | LFO SETUP capture byte-identical to the earlier one, wave turned away and back |
| USB package (`tools/packages/build.sh`) | builds (6 stock-code sites, 6 hash-guarded stock copies for the grown label/icon tables, all checked against 1.40C); both strict stock-free scans pass; not loaded on a unit |

Known issue: a project with WAVE 19 opened on firmware without the module draws a garbage WAVE icon (reads address 0); verify on hardware. The emulator builds use upstream octabam, which grows the two tables with TableGrow; the StockCopy + SymbolRef form that Modwerk builds and the USB package use has no emulator run yet. Not tested: hardware, scene/crossfader morph (static evidence only), USB install/self-test/Keep/Undo on a unit.
