# MKII companion-load test — 31 October 2026

This is scoped hardware evidence for unchanged Sample Locks 0.1.8 candidate
`3e13c46f…` on private RAM development base `20ed7910…`. It does not complete
public-beta qualification. The [receipt](evidence/mkii-companion-load-20261031.json)
records exact package identities, observations, interrupted attempts and recovery.
No module runtime changed for this test.

The later **stationary-panel USB-recording rerun passed 32 maximum edits and
the stated audio checks**. Its cleanup protocol fault recovered and restoration
was independently verified. See the rerun below and its separate
[receipt](evidence/mkii-usb-recording-rerun-20261031.json); the earlier interrupted
attempts remain recorded.

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

## Recovery from the interrupted attempts

**Those higher-load attempts failed.** Advancing audio/UI counters and zero DSP
errors were insufficient to establish responsive physical controls. The later
no-module comparison below confirms an independent input-path bug. Concurrent
physical/remote input needs safe serialization; the stationary-panel rerun below
tests a separate constrained scenario.

Undo restored the original empty module inventory, normal active/set identities
and all three original opener sites. Working/saved Part hashes were preserved.
The author power-cycled without saving; readback verified original flashed
public base `2aa35c39…`, empty inventory, the original set identity and advancing
DSP frames. Stopped fixture state after restart is author-reported. USB was
released. No project Save, Keep, flash or push occurred.

## Input-path isolation follow-up

A separate emulator ran the **same development base with an empty module
inventory verified over USB**. DSP execution was disabled for this UI/input
experiment. Complete physical fader reports followed by remote FUNC press/release
left all held rows and stock's FUNC state clear.

Splitting a physical fader report around an actual USB development KEY request
reproduced two failures without Sample Locks:

- Inserting FUNC down between the fader header and value 112 left TRIG5–7 held,
  exactly matching the hardware's held-row readback. Releasing FUNC did not clear
  those unintended trigs.
- Starting with FUNC held normally, inserting its release between the fader
  report's bytes lost that release: both the held row and stock key state kept
  FUNC down.

The development helper inserts a complete remote packet into the same byte
stream that receives physical reports, without ensuring a physical packet has
finished. Masking interrupts around its two writes does not repair a report
whose first byte has already arrived. This is a confirmed input-path bug
independent of any installed module, and a strong explanation for the hardware
signature. Attribution of every unintended hardware edit remains unproven.

The deliberate split establishes the mechanism, not its physical occurrence
rate. The model did not advance transport with DSP disabled, so this experiment
does not claim a successful STOP or reproduce the exact paste message. No
firmware code was patched. A single-byte arrival was constructed in the paused
UART model by dropping a dummy prefix before the firmware received it.

See the [isolation receipt](evidence/input-isolation-emulator-20261031.json).
Concurrent-input qualification still needs safe serialization of remote input
at complete physical report boundaries, with these cases as regressions and a
fresh hardware check. This finding does not turn the earlier failed trial into
a clean pass. Sample Locks runtime remains unchanged.

## Fresh stationary-panel USB-recording rerun

At the author's request, the same four packages ran from a fresh RAM boot with
the physical panel held still and no injected fader events. All four fixture
patterns matched their original bytes before testing. The complete working Part
configuration matched the earlier higher-load setup byte-for-byte, including
the author's persisted FX/LFO settings; individual LFO enable flags were not
independently decoded. Initial held-key rows and stock FUNC state were clear.

The revised host driver acknowledged held-row transitions and stock FUNC
press/release, checked clear input state between gestures, and checked for fader
drift throughout load windows. It did not fix the device input-framing bug.
Ten A01 maximum Lock/Clear pairs and two Clear/restore pairs each on A02–A04
passed: **32 operations, 512 changed SAMPLE fields each**. Every complete pattern,
active lock-index array and working/saved Part block matched expectations.
Playback stayed running during edits; all four original patterns were restored.

One continuous 20-channel recording covered 240.013 seconds. Across the 18
track/Main channels, whole-stream and per-channel checks found zero adjacent
repeated 16-sample blocks, maximum exact-zero run one sample and maximum held run
three samples. No clipping was measured. Main's minimum 100 ms RMS was about
0.00879/0.00889. These are descriptive processed-output checks; no new author
listening report, analog capture or proof against every click is claimed.

Closed-screen cached main CPU median rose from 70.4% without USB recording to
84.1% with recording. The largest sampled reading across windows and edits was
93.7%; DSP peaks reached 79.9% on T1–4 and 78.2% on T5–8. This was not a 100%
saturation test. Errors/stalls stayed zero and no frame shedding was observed.
The fresh cumulative inner publication maximum was 617 counts, about 4.67
microseconds, excluding interrupt-mask boundary instructions. Largest operation
window frame gap/lateness was about 459.1/90.1 microseconds; idle windows also
had lateness, reaching about 121.3 microseconds. Different window lengths do not
isolate an added lateness rate. Host completion timings include input checks,
USB/UI scheduling and polling, and are not native exclusive CPU time.

Remote STOP worked at the end, with clear held rows/FUNC state. The CLI's initial
Undo ENTER acknowledgement was not confirmed, and the client stopped. A fresh
trusted connection adopted only the pinned trial; rollback returned
`needs-recovery`. A subsequent connection found normal state, original active/set
identities and empty inventory. Readback verified all three original sites,
all four patterns, both Part blocks and stopped/clear-input state. The cause of
the cleanup protocol fault was investigated separately: the test helper opened
a second loader HELLO while the CLI retained a cached submission sequence. A
host-side reproduction using the native duplicate-sequence refusal/cached-RESULT
rule returns the cached HELLO for the first client's next ENTER. This strongly
explains the mismatch; no hardware wire trace was captured. Keep one uploader
owner throughout a retained trial. This is recovered restoration, not a clean
first-attempt Undo. Final flashed-base restart status is recorded in
the [rerun receipt](evidence/mkii-usb-recording-rerun-20261031.json).

## Limits

This does not establish safe operation at arbitrary CPU saturation, complete
stack/interrupt bounds, isolated unchanged-package Apply CPU cost, or direct
canonical battery-mirror equality. Manual-motion navigation needs further work.
All raw PCM, firmware, packages, Part/pattern records and LCD buffers stay private.
No project Save, Keep, flash, push or publication is part of this test.
