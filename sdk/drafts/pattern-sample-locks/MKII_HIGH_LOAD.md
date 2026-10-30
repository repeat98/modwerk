# MKII companion-load test — 31 October 2026

This is scoped hardware evidence for unchanged Sample Locks 0.1.8 candidate
`3e13c46f…` on private RAM development base `20ed7910…`. It does not complete
public-beta qualification. The [receipt](evidence/mkii-companion-load-20261031.json)
records exact package identities, observations, interrupted attempts and recovery.
No module runtime changed for this test.

## Method

One retained RAM trial held Sample Locks, TapeHead, E-Verb and Air Chorus.
The disposable audio fixture used four Flex and four Static tracks, eight original
test samples, 64 sample trigs per track and 120 BPM. TapeHead ran in FX1 on all
eight tracks; E-Verb occupied T1/T2 FX2, Air Chorus T5 FX2 and stock COMPRESSOR
T6 FX2. The author later filled T3/T4/T7/T8 FX2 with stock DELAY and reported
enabling all LFOs. Live FX assignments and complete working Part records were
read back; the LFO configuration remains author-reported.

Closed-screen, selector and confirmation baselines used the same installed set
with Sample Locks idle. They were compared with native maximum-size Apply,
with and without 20-channel USB recording. This is not a companion-only or
module-unloaded comparison. USB capture itself adds device load.

Every successful Apply checked all 36,568 pattern bytes, all 64 active lock-index
bytes, working Part settings, transport state, DSP error/stall counters and frame
telemetry. Each edit changed 512 SAMPLE fields through native UI controls.
The unchanged initialized image and its three opener sites were attested.
No fixture bytes were injected into device memory.

## First pass

Thirty-two maximum edits passed, covering repeated A01 Lock/Clear and A02–A04
Clear with no other locks, a first-slot lock or a last-slot lock. All four
patterns and author FX settings were preserved/restored. DSP errors and stalls
stayed zero; no frame shedding was observed.

Closed-screen main CPU median was 69.4%, rising to 81.3% during USB recording.
DSP peaks were about 79% for T1–4 and 77% for T5–8. The largest cumulative inner
publication interval was 696 timer counts, about 5.27 microseconds at 132 MHz;
this excludes interrupt-mask boundary instructions and is not total Apply time.
Frame lateness also occurred in idle recording baselines; unequal window lengths
do not establish an added lateness rate attributable to edits.

Nine USB captures contained about 134 seconds of audio. Whole-stream and separate
channel checks found no adjacent repeated 16-sample blocks, no exact-zero run
longer than one sample and no held run longer than three. Wet effects are time
varying: waveform/jump differences are descriptive, not proof of a click or its
absence. USB PCM is not an independent analog measurement or a listening report.

While sampler recording was active, a separate 512-change confirmation refused
Apply with zero publication writes. Pattern, Part and index bytes, playback and
recording stayed unchanged. Cached main CPU at refusal was 96.9%. Eight of sixteen
recorder state entries were nonzero; this does not establish eight recording tracks.

## Higher load and input failures

With four additional DELAYs, author-reported LFOs and manual crossfader motion,
two attempts each completed one maximum Lock before subsequent menu navigation
failed. The first used fixed delays; the second acknowledged menu states and
consumed-key releases. USB recording sampled main CPU as high as 99.2% in the
first attempt, but that was not a completed saturated-load test.

The runners deliberately sent STOP on these failures. Subsequent readback found
the same running RAM base, advancing DSP/UI counters and zero DSP errors/stalls;
these stops are not evidence of a crash. Native Clear restored A01 after each
attempt without reloading or saving the author's Part. The cause of the menu
failures remains unresolved. A controlled single fader report left the Part Edit
menu open; this does not explain or qualify continuous manual-motion behavior.

With the physical slider held still, the USB-only attempt completed twenty
maximum A01 edits before timing out on a native pattern change. Playback remained
running. All twenty edits passed data/transport checks with zero DSP errors,
stalls or shedding. Closed/selector/confirmation sampled main CPU ranged from
80.8% to 91.8%; USB recording alone did not saturate the main CPU.

Longer pattern-key holds reached A02 and four further maximum edits passed,
then the next live pattern change timed out. A stopped-switch follow-up failed
its STOP assertion before making edits. The author then reported that physical
STOP displayed a paste message instead of stopping playback. Readback found
Sample Locks closed, no native popup and zero consumed-key masks, but TRIG5–7
reported held. FUNC read as released despite the reported modifier behavior.

A02 had five missing SAMPLE fields at the first comparison and six when its
state settled. Other pattern bytes, the other three patterns and working Parts
matched. The origin of these changes and the input fault is **unresolved**.
The 24 individually verified higher-load edits do not make this a clean pass.
Neither A03 nor A04 received the planned higher-load edits.

Releasing the three reported trigs and sending an isolated FUNC press/release
allowed remote STOP to work. All held-key rows then read zero. Native Lock
restored the six missing fields; independent complete comparisons verified all
four original patterns and unchanged working/saved Parts. The recovery helper's
reused 64-guard assertion was wrong for six changed steps; it failed after the
successful write, and that failed assertion remains recorded.

The first fixed-slider recording contains 160 seconds with zero repeated
16-sample blocks on each measured channel, maximum zero run one sample and
maximum held run three samples. The second recording also had zero repeated
16-sample blocks per measured channel. These output checks do not override the
input/data failure or establish correct panel behavior.

## Recovery and outcome

**Higher-load qualification failed.** Advancing audio/UI counters and zero DSP
errors were insufficient to establish responsive physical controls. Before
another qualification run, isolate the input/modifier fault using controlled
inputs and a baseline without Sample Locks; do not attribute it to the module
or dismiss it as a harness problem without that comparison.

Undo restored the original empty module inventory, normal active/set identities
and all three original opener sites. Working/saved Part hashes were preserved.
The author power-cycled without saving; readback verified original flashed
public base `2aa35c39…`, empty inventory, the original set identity and advancing
DSP frames. Stopped fixture state after restart is author-reported. USB was
released. No project Save, Keep, flash or push occurred.

## Limits

This does not establish safe operation at arbitrary CPU saturation, complete
stack/interrupt bounds, isolated unchanged-package Apply CPU cost, or direct
canonical battery-mirror equality. Manual-motion navigation needs further work.
All raw PCM, firmware, packages, Part/pattern records and LCD buffers stay private.
No project Save, Keep, flash, push or publication is part of this test.
