# POLY8

## Overview

POLY8 is a FLEX sample machine with **up to eight voices and one POLY8 assignment per Part**. Each voice
has its own pitch, playback position and AMP envelope; filters and FX remain
per track. This replaces the earlier 32-voice experiment after an MKII report
of temporary unresponsiveness during rapid trig presses with HOLD/REL INF.
A sequencer trig on a pitch already sounding on the track restarts that voice (0.2.7) instead of stacking a copy; keyed voices from the panel or MIDI still stack.
Released tails yield before held notes. A pitch-weighted work budget admits
fewer voices at high playback ratios, including after a tuning change.

PTCH tunes the whole chord. Panel and MIDI notes add their own semitone offset
without moving PTCH or overwriting its live lock. The machine follows the
instrument's audio frames and sequencer; it has no independent clock.

The 0.2.6-experimental candidate adds a shared native chooser for POLY8, Analog BD, VECTOR and FM Synth. Repitch, Mute Modes and Scale Quantizer can be selected alongside it. Each machine retains its own signed Part state, controls and playback engine. FM Synth supplies its bundled quantizer when both quantizers are selected. Unknown overlaps and existing DSP/menu limits still refuse; Octakit remains incompatible.

The POLY8-only build preserves both original 1.40C DSP payloads and uses the standard loader-free builder. Selecting effects or Analog BD retains those modules’ normal DSP placement; the shared chooser does not add a dynamic DSP loader. The eight-voice cap, fixed headroom and T06 LOOP/browser corrections remain.

**POLY8T03 and POLY8T04 failed MKII transport testing.** T04's physical logs match its exact source/configuration identity, show continuing UI activity and zero sample-render entries during the captured PLAY state, and contain no exception. T04 therefore does not reach POLY8 mixing in that capture. The user subsequently described T05 as “works in theory”; no individual hardware gates were reported. T06 retains native command-consumer/AMP-builder counts beside the existing core logger. MKII recording, responsiveness and physical reboot still need this exact version's hardware test. Stock 1.40C reportedly restores operation in the same project.
The earlier owner exception covers only the exact 0.2.5 source. The changed 0.2.6 bridge requires new hardware qualification or an exact owner exception before publication.

## Controls

| Control | Behaviour |
| --- | --- |
| SRC SETUP → POLY8 | Selects POLY8 and keeps the current page, like FLEX/STATIC. |
| FLEX pool | Double-TRACK opens stock FLEX slots; LEFT/RIGHT switches between machine list and slots. |
| PTCH | Tunes every active/releasing voice independently of note input. |
| Chromatic keys | Separate notes and releases, with held-key boxes. |
| FUNC + LEFT/RIGHT | Ten octave positions, -6 through +3; endpoints clamp. |
| MIDI | Notes 0–127 on exclusively POLY8 routes; note 84 is the tuned sample root. |
| AMP | Independent ATK/HOLD/REL envelopes. REL INF intentionally sustains released voices. |
| SRC SETUP | Native FLEX settings; TSTR is OFF, and new assignments default to LOOP OFF. |

## Usage

1. Select an audio track, open SRC SETUP, choose POLY8 and press YES.
2. After assignment, POLY8 stays on the current page like FLEX/STATIC. Double-press the track key to open its FLEX sample pool. Load a sample with the stock file browser, then confirm its slot with YES. NO leaves the browser.
3. Return to SRC, open the trig-mode menu with FUNC+DOWN, select CHROMATIC and confirm with YES. Hold several trig keys; FUNC+LEFT/RIGHT changes octave from -6 to +3.
4. Turn PTCH to transpose the sounding chord. A dedicated POLY8 MIDI channel accepts notes 0–127; note 84 plays the tuned sample root.
5. Set AMP REL to a finite value for notes that end after key-up. The one assigned POLY8 machine has up to eight voices, subject to the pitch-work budget.

A second POLY8 assignment in the same Part is refused before changing the target
track, its sample or settings. The native modal says **ONE POLY8 PER PART**;
press **NO** to dismiss it. Each inactive Part may store its own POLY8 machine.
Reduce older Parts containing several POLY8 markers to one before using POLY8.

Every voice is mixed at a fixed **1/8 gain (-18.06 dB)**, including the single
voice fast path and attack/release ramps. Eight coherent full-scale voices fit
within the mix range without a gain change each time another note starts.
A single note is quieter than the previous build; downstream AMP/FX boosts can
still use that headroom.

## Runtime and recording

Eight stock primary records and 31 fixed extension records are retained for
compatibility with the earlier experiment. Admission limits active heads to
eight, with a conservative budget of 40 fixed-plus-fetch units. No per-note
allocation occurs. The platform still reserves 10 MiB once.

REC+PLAY in chromatic mode records the held panel chord, up to four distinct
notes spanning eleven semitones. Native recorder routines choose the bank,
pattern, step and microtiming. Chords occupy the existing pattern lock records:
slot 0 stores the note root and unused audio slot 30 stores one of 232 chord
shapes. Slot 31 remains native SAMPLE. Playback consumes encoded roots before
PTCH locking, leaving the Part tuning, other locks, scenes and LFO destinations
on their stock path. No sidecar file or independent sequencer clock is added.

Recorded duration follows AMP HOLD; key-up duration is not captured. Larger or
wider held chords do not overwrite the last valid capture. Stock grid PTCH-lock
editing/display of an encoded root is not qualified. Without POLY8 installed,
that step falls back to one FLEX note using its encoded PTCH byte.

HOLD and REL INF intentionally sustain a voice; LOOP OFF allows a finite sample
to end naturally. New assignments take LOOP OFF, while existing Parts and
browser confirmations preserve the saved choice. Set existing POLY8 tracks to
LOOP OFF manually when testing this build.

## Compatibility and limitations

- Octatrack OS 1.40C only. The MKII owner reports T09 "works really well"; this later selection-flow update and detailed hardware timing/persistence remain unqualified.
- FLEX only. STATIC was excluded after an exploratory audio test lost chord
  components as independent streaming heads diverged.
- Panel recording is limited to four notes within an octave; extended MIDI recording is incomplete.
  Ordinary uncaptured sequencer trigs play the tuned root. Shared MIDI channels retain
  stock commands outside 72–96 if any routed audio track is not POLY8.
- Ratios saturate below 32× without octave folding. Linear interpolation can
  alias; very low notes have limited Q16 playback-phase resolution. An earlier
  maximum-pitch load did not establish 32 simultaneous high voices.
- The octave is global live state, not saved in a Part. Stock octave LEDs clamp
  to their four available positions; the printed signed octave is exact.
- At most 64 distinct owners can remain held per track, with 31 queued presses
  behind the armed stock mailbox. Excess queued input is rejected before it
  becomes a held note.
- Scenes, LFOs/locks, slices/reverse combinations, project/Part reload, recorder
  activity and machine changes under load need broader qualification.
- The shared chooser supports VECTOR, Analog BD and FM Synth with Scale Quantizer,
  Repitch and Mute Modes. Combined native audio/UI tests are emulator evidence;
  DSP memory and menu limits still apply. OctaKit's Part layout is incompatible.

POLY8 uses a `PL/1` signature in three unused NEIGHBOR bytes while retaining
FLEX's native machine byte. Both Part copies are updated. Legacy raw-type-5
POLY95 Parts migrate to signed FLEX when visited.

## Tests and measurements

[TESTING.md](TESTING.md) separates measured results from remaining work.
[import.json](import.json) records the exact preservation archive and source
hashes. Historical [upstream notes](upstream) describe the earlier POLY95 experiment.
Stock replay placeholders are filled from the developer's locally verified OS;
no firmware, extracted stock spans, card images or memory dumps are included.

## Authorship and licences

Sam Banks' original POLY is MIT; full terms are in [LICENSE](LICENSE).
The pool adapter follows repeat98's MIT VECTOR code and the Analog BD/FM
registration conventions. New integration and allocator work is MIT.

## Private diagnostic build

Stage the module as `modules/poly8` in a disposable native SDK together with the current `sdk/runtime/logging`. Regenerate `registration.s` using `prepare-registration.py`, then run `python3 -B modules/poly8/build-diagnostic.py` from that private SDK. It installs the pinned `remix.py` profile with resident stock DSP effects, verifies both original DSP uploads byte for byte, and links the unchanged core logger beside POLY8, excludes its retained 8 KiB from initialized runtime/staging, reserves sixteen additional recorder pages, checks original 1.40C guards and installs seven non-overlapping logger hooks. The ordinary native build resolves the optional logging call to zero; this diagnostic recipe is required for the logging candidate.

See [diagnostic records and collection](DIAGNOSTICS.md). Logs cannot guarantee capture of a hard lockup or recovery after a power cycle. T06 physical recording, reboot and worst-case deadlines remain unqualified.

## Historical T06 panel consistency

Reselecting an existing POLY8 retains LOOP, including AUTO and PIPO; assigning POLY8 to a stock track defaults to OFF. LEFT from its FLEX slots selects and labels POLY8 in the machine list; RIGHT reopens the FLEX sample pool. The pool intentionally names FLEX, the sample storage it browses.

![Historical POLY chooser after LEFT](media/t06/left-machine-chooser.png)
![Historical POLY SRC SETUP with retained LOOP choice](media/t06/loop-encoder.png)

These are actual LCD captures from the exact private image, with provenance in [capture.json](media/t06/capture.json). Historical 0.2.0 screenshots remain in the parent media directory.

## Quick start

1. Select an audio track, open SRC SETUP, choose POLY8 and press YES.
2. Only one POLY8 can be assigned in each Part. A second assignment is refused without changing the track; press NO to dismiss the modal. Inactive Parts can each hold one POLY8.
3. After assignment, POLY8 stays on the current page like FLEX/STATIC. Double-press the track key to open its FLEX sample pool. Load a sample with the stock file browser, then confirm its slot with YES. NO leaves the browser.
4. Return to SRC, open the trig-mode menu with FUNC+DOWN, select CHROMATIC and confirm with YES. Hold several trig keys; FUNC+LEFT/RIGHT changes octave from -6 to +3.
5. Turn PTCH to transpose the sounding chord. A dedicated POLY8 MIDI channel accepts notes 0–127; note 84 plays the tuned sample root.
6. New assignments default to LOOP OFF. POLY8 has a maximum of eight voices, subject to the pitch-work limit, with fixed -18.06 dB gain per voice.
7. Use REC+PLAY in chromatic mode to record up to four held panel notes spanning at most eleven semitones. Recorded duration follows AMP HOLD.

## Screens and audio

![Historical POLY machine chooser](media/t06/left-machine-chooser.png)
![Historical POLY SRC SETUP with LOOP retained](media/t06/loop-encoder.png)
![Historical FLEX sample slots for POLY](media/t06/right-flex-pool.png)

These are real black-and-white LCD captures of the T06 private image. Capture records identify that image; public composition is independently compared with native octabam. No hardware audio recording is claimed.

## POLY8 release UI

![SRC SETUP with POLY8 selected and LOOP OFF](media/poly8/setup-poly.png)

Open SRC SETUP with FUNC+SRC, select POLY8 and press YES. New assignments start with LOOP OFF, so try a short sample first.

![FLEX slots with REPITCH_440 selected](media/poly8/right-flex-pool.png)

Double-press the track key to open the native FLEX slots; RIGHT opens them from the machine chooser. Select a loaded sample with YES, then press NO to return to SRC.

![SRC POLY8 page with PTCH, STRT, LEN, RATE, RTRG and RTIM](media/poly8/main-poly.png)

Return to SRC and choose CHROMATIC with FUNC+DOWN. Hold several trig keys and turn PTCH to tune the chord; release the keys with finite AMP HOLD and REL to end the notes.

![SRC SETUP with POLY8 selected and LOOP AUTO](media/poly8/loop-encoder.png)

Open SRC SETUP with FUNC+SRC and turn encoder A to change LOOP. AUTO is shown here; reselecting POLY8 keeps AUTO or PIPO, while a new assignment starts at OFF.

![Machine chooser with POLY8 selected below the stock machines](media/poly8/left-machine-chooser.png)

Press LEFT from the FLEX slots to return to the machine list; POLY8 stays selected. Choose FLEX and press YES to replace POLY8, or press NO to keep the current assignment.

These earlier 0.2.6 controls captures retain their original image and command provenance. They precede the T09 startup fix and T10 selection-flow change; they are not measurements of the current image. T06 captures above also remain historical evidence.

## Machine selection in T10

![SRC SETUP remains visible after POLY8 assignment](media/selection-flow/assigned-src.png)

Choose POLY8 in SRC SETUP and press YES. As with FLEX/STATIC, selection and reselection retain the current page. The sample pool opens only when you request it.

![POLY8 selected in the machine list](media/selection-flow/left-machine-chooser.png)
![FLEX sample slots opened explicitly](media/selection-flow/right-flex-pool.png)

Double-press the track key to browse FLEX samples. LEFT returns to the machine list; RIGHT reopens the slots. Selecting a machine from that list leaves the machine pane visible, as stock does. These are actual T10 captures, bound to the exact image in [capture.json](media/selection-flow/capture.json).

## Experimental release approval

The owner approved publication of 0.2.5-experimental with current-build physical hardware, worst-case chip cycles and complete memory-bound qualification waived. Unknown measurements remain null. Modwerk's standard builder generated the POLY8 image launched in Octemu, and the owner reported “it worked”. This is an emulator check, not a physical reboot or hardware timing result. See [release evidence](evidence/release.md).
