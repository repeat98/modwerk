# MKII audio and timing follow-up — 31 October 2026

These are physical observations, with separate identities for the unchanged
candidate and a private instrumented probe. They do not complete public-beta
qualification. The [stock-free receipt](evidence/mkii-audio-timing-20261031.json)
retains every operation's metrics, capture hashes, corrections and remaining gaps.

## Builds and setup

- MKII, OS 1.40C; original flashed public base `2aa35c39…`, initially empty inventory.
- Unchanged 0.1.8 candidate `3e13c46f…`, 10,048 bytes. A public-base RAM trial
  played the fixture and was undone before switching to automated testing.
- Private RAM development base `20ed7910…`, with panel and read-only memory
  controls. Its MAIN/container matched its build record; container formats,
  bootloader preservation and declared patch bounds passed offline checks.
- Separate timing probe `7ecf9700…`, 9,892 bytes. Before instrumentation, the
  same compiler, sources and flags reproduced the original 8,748-byte image.
  The instrumented image was 8,932 bytes plus 1,424 bytes BSS. It is not a release
  artifact and its timings are not measurements of unchanged candidate bytes.
- Disposable `PSLTEST_261031` / `PSL AUDIO TEST`, A01–A04, eight tracks, four
  Flex/four Static, 64 sample trigs per track. Default speed; 120 and 300 BPM.
  No companion modules. Native button/encoder gestures made every pattern edit;
  the host never injected fixture bytes into device memory.

Before each automated trial, working/saved Parts, assignments, trigs, sample
fields, pattern identity and stopped/non-recording state were checked. During
trials, complete relocated images and all three opener sites were compared with
their expected bytes. All firmware, packages, project records, PCM, screenshots
and raw memory/diagnostic records remain private outside Git.

## Unchanged candidate

Forty-three operations passed: forty changed all 512 fields, two changed only
T1's 64 fields, and one preserved all existing SAMPLE locks without writes.
This includes ten repeated maximum Lock/Clear pairs, Clear with no other locks,
another lock in the first slot, and another in the last slot. Maximum edits
also ran at 300 BPM. Stopped edits stayed stopped; playing edits kept playing.

Each successful edit compared the complete 36,568-byte pattern, all 64 active
lock-index bytes and working Part records. Non-SAMPLE data and unselected tracks
matched expectations. Native Lock restored A02–A04 after Clear; all four patterns
finally matched their pre-test bytes. Direct canonical battery-mirror readback
was unavailable through this base's allowed MEM ranges and is **not claimed**.

Separate checks passed default preservation, one-track selection, cancelled
selection recall, live-sequencer recording refusal without writes/transport
changes, and cancellation of armed confirmation on a native pattern change.
Sampler-recorder refusal was not tested. DSP errors and stalls remained zero.

The unchanged candidate's largest recorded inner publication-timer value was
573 counts, about 4.34 microseconds at 132 MHz. This is a cumulative maximum
across the run. The timer begins after masking and ends before restoring the
mask, so it does not measure the complete interrupt-masked boundary.

## Instrumented native commit timing

The probe stamps the native commit body, index planning, revalidation and
publication. Its start is before the task guard and its end after restoring
that guard. It includes intervening interrupts, native follow-up calls, timestamp
overhead and stack samples; caller and function prologue/epilogue are outside
the interval. It is elapsed time, not exclusive module CPU cycles.

DTCN3 counts use the base's documented 132 MHz scale. A host regression against
UI-tick counter samples estimated 131.80 MHz; tick quantization makes this only
a cross-check. The measured timer-read/store/read pair took 12–42 counts. No
overhead was subtracted, and this pair does not price every added probe instruction.

Five full-pattern A01 pairs per recording condition gave:

| Condition | Lock median / maximum | Clear median / maximum |
| --- | ---: | ---: |
| USB recording off | 2.15 / 3.30 ms | 4.43 / 4.80 ms |
| USB recording on | 3.62 / 3.97 ms | 7.66 / 8.36 ms |

Across three unrecorded repetitions per saved Clear fixture, the first-other-slot
case took 1.83–2.46 ms, versus 4.03–4.36 ms with no other locks and 4.07–4.66 ms
with the last other slot occupied. Index-planning intervals were respectively
0.41–0.70 ms, 2.84–2.91 ms and 2.81–2.92 ms. This supports the scan explanation;
the measurements are not universal worst-case execution bounds.

Frame-window maxima and shedding were read around operations. No shedding was
observed, but some windows had nonzero lateness. Unloaded recording baselines
also had lateness: about 37 and 34 microseconds before/after the probe trial;
the largest probe-operation window was about 49 microseconds. This does not
isolate Apply as the cause or establish zero scheduling impact.

## Audio and stack observations

Forty 20-channel USB captures contain about 232 seconds of PCM, before, through
and after operations and after Undo. At 120 BPM, all 188 complete one-second
windows passed eight track-tone and Main-mixture checks: 1,504 track-tone checks.
Partial final seconds were excluded from tone analysis but included in the
whole-capture continuity metrics.

At 300 BPM, retriggering changes the tones' spectra. A separate measurement
checked each track's peak band and compared track/Main spectral signatures with
the unloaded 300 BPM baseline; minimum cosine similarity exceeded 0.999999.
The 120 BPM detector's thresholds were not weakened.

Whole-capture checks found no adjacent repeated 16-frame blocks, no constant
sample run longer than two samples, and no exact-zero run longer than one in
the measured track/Main channels. Maximum adjacent-sample changes matched their
unloaded baselines. These checks do not prove the absence of every click or
timing defect, and USB PCM is not an independent analog recording.

Probe stack-pointer samples used at most 612 bytes of the identified 8,192-byte
task stack at the sampled points, leaving 7,580 bytes there. No stack was filled
or modified to install canaries. Stock-callee and interrupt minima were not
sampled: complete system stack safety remains unqualified.

## Recovery and limitations

All four automated trials verified Undo against the exact previous active/set
identities, empty inventory and all three original opener sites. The selector
was open immediately before teardown, but the cleanup STOP closed it before
Undo; direct removal with the selector still open was **not exercised**.
All four fixture patterns and 120 BPM were restored; no project Save, Keep or
flash occurred. After the author's power cycle, public base `2aa35c39…`, normal
upload state, empty inventory and advancing DSP frames were verified. USB was
released. Nothing was pushed or published.

The initial host runner blocked in a nested transaction queue before installation;
that host code was corrected. A probe title exceeded the builder's 15-character
limit and was corrected before device use. The first live-recording assertion
mistook sampler-recorder STATE for live sequencing state; its trial still undid
successfully, and the separate native-live-flag check passed. These attempts
remain in the receipt rather than being counted as complete passes.

Remaining coverage includes full stock/interrupt stack bounds and canaries,
unchanged-package whole-Apply instrumentation, direct battery-mirror comparison,
open-selector removal, sampler recording, track-speed/swing extremes, demanding
long Static streams, companion runtime and external MIDI stress. Automated
Apply evidence belongs to `20ed7910…`, not the public base. MKI/card support is
outside the chosen first-beta scope. Publication gates and first-release review
remain open.
