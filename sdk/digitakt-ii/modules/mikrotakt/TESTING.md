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

Not tested: knob values reaching the player (the settings are defaults until the knob mapping is decided), several Mikrotakt tracks at once, CPU load on a unit, other modules alongside it, saving and reloading a kit with Mikrotakt, hardware.
