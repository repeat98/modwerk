# Mikrotakt testing

Work in progress. Nothing has run on a Digitakt II yet: every result below is from the emulator, which never proves sound-chip code (sdk/machines/digitakt-ii/README.md, SHARC code rules).

## Emulator, 19 November 2026 (OS 1.17)

Setup: a development base (test machine as type 7, standing for SAMPLE; base `d26c8874` for the last row, `37b4db44` for the others), Mikrotakt's player assembled from `src/player.sharc` and composed with the base's machine parts by `composeDt2MachineBuild`, the sound chip taken from that composed file. Scripted coupled runs: the test machine chosen through the machine menu on track 1, then two notes of a one-second 220 Hz test sample.

| Check | Result |
| --- | --- |
| Build preflight of the composed file | Passed: sections 2, 4, 5 and 8 stock, section 7 verified against the plan. |
| Sound | Each note plays as a cloud of grains at 220 Hz, peak 0.03-0.06 (SAMPLE: 0.063). No halt, no missing blocks. |
| Clicks | Largest sample-to-sample step 2.9% of the peak, as a clean 220 Hz sine (no steps at grain edges). |
| Pass-through player (the stock player only) in the same build | Plays as SAMPLE. |
| Base `d26c8874` (own knob names) | Same sound as on `37b4db44`, peak for peak. |
| Knob C (SIZE) at 0 and at the top, turned on the SRC page before the notes | At 0 the same sound as before, peak for peak; at the top an evener cloud of long grains. Both click-free (largest step 2.9% of the peak). |

| Knobs named (SIZE, POS, LEN, SPRD on C, E, F, G); SPRD read from knob G, at 0 (base `41a864e2`) | Plays, no halt; peak 0.0997, about 4 dB above SAMPLE: without spread the grains add in step, while the gain assumed they add out of step. Fixed in the next row. |
| Gain between the in-step rule (no spread) and the out-of-step rule (an eighth of the spread and up) | SPRD at 0: peak 0.064, RMS about 0.04, as SAMPLE (0.063, 0.04). SPRD turned up: peak 0.052. Largest step 3.3% and 2.9% of the peak (no clicks). |

Not tested: the other knobs (their grain roles are not decided), trig locks on SIZE, several Mikrotakt tracks at once, CPU load on a unit, other modules alongside it, saving and reloading a kit with Mikrotakt, hardware.
