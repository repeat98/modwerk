# Midiverb testing

Record what you ran, on which build and which unit, and what you saw. "Not tested" is a valid answer; never write a result you did not observe, and keep emulator runs apart from hardware ones.

## Emulator (dsp_host)

- **Program table against the original machine** (`node generate.mjs --mv1 … --mv2 … --fex …`, 25 Nov 2026): every Midiverb, Midiverb II and Midifex program that fits the 15,614-word ring unchanged runs bit-identical to the original machine's model (Brombaugh's semantics), its state exactly; the two output taps read a halved word, so they differ by at most 2 in the 16-bit domain. 24 Midiverb, 5 Midifex and 10 Midiverb II programs have their longest delay line shortened to fit (up to about 4.5 %). Midiverb II's 20 chorus and flange programs are run without their LFO: not handled yet.
- **Engine against the table** (`python3 verify.py`, commit ede56e7b6): bit-exact against a model of the table in the DSP's integer arithmetic for five cases (PROG 0, 9, 17, 21, 23; LEVL 16 to 127; MIX 0, 90 and 127), MIX 0 exact dry. One instance per `dsp_host` run: the gate's synthetic image hands every instance the same allocator buffer. Trig splits are not in the model.

## On the unit

- **Trial, 25 Nov 2026, the owner's Octatrack** on flashed base `eb6679620d0c`, from commit ede56e7b6: package `midiverb.mwrm`, SHA-256 `8184ae0826318eced0dd1053b638dd58db4eb09097fd8ed0fb30c48b87dea653`, built by `npm run module:dev -- midiverb --slots fx2 --cycles 400 --cycles-kind executed --state 32 --buffer 15870`. The base admitted it and ran it as a RAM trial. The owner reported it "working great" (reported, not observed by the agent). Not run: the test procedure, its edge cases, scenes, locks, LFOs, several instances.
- The first attempts were refused at verify, loader refusal 6 (RUNTIME_CYCLES): 824 declared cycles, then the builder's placeholder. One instance must fit beside seven stock slots on a core: 3,120 − 7 × 342 = 726 chip cycles, a draft's figure charged at 7/4, so at most 414 declared.

## Stock flows

Not tested.

## Sound quality

Not tested (`npm run fx:audit` not run).

## Performance

`dsp_host`, the 24 trial programs at MIX 127 and LEVL 127, unsplit and split at frames 1, 7 and 15: at most 391.7 executed instructions a sample (2.8 SM BRT, split 1); declared 400. All 63 Midiverb programs cost 194 to 512 (the small rooms, .2–1.2 s, 420–512, are not in the trial). Not measured: hardware cycles, `cycle_count.py`, `benchmark_stock_dsp.py`, a stress run; no `evidence/performance.json` yet.
