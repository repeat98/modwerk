# MIDI Scenes — MIDISC2.0

Version: `0.2.5-experimental`. Original author: **bkkbrls-del**. Source pin:
[`4f9a89453fdcdd39a3cd57f010ffa489cac721cd`](https://github.com/bkkbrls-del/midisc/tree/4f9a89453fdcdd39a3cd57f010ffa489cac721cd).

## Overview

MIDISC2.0 adds scene locks to Octatrack MIDI tracks. Hold Scene A or B while
editing an enabled MIDI parameter; the crossfader morphs the two assigned
scenes. The author documents pre-playback scene operation, pattern/Part
boundary timing, preservation of active trig locks, CC-before-note ordering,
descriptor/scratch repairs and immediate Part sync at sequencer ACT commit.

This owner-approved standalone release implements the actual **2.0 author recipe**.
Select MIDI Scenes on its own in the existing configurator and build from your
verified local original OS 1.40C. Other module combinations are unsupported.
The owner explicitly approves building without hardware timing and complete
memory bounds; those quantities remain unknown. The archived native 8.2 port
is preserved separately and is never substituted for this release.

![Original scene-morph thumbnail](presentation/thumbnail.svg)

## Controls

The module operates through the existing MIDI parameter pages rather than a
new effect chooser row. Select MIDI mode and a MIDI track. SRC opens NOTE,
AMP opens ARP, LFO opens MIDI LFO, FX1 opens CONTROL 1 and FX2 opens CONTROL 2.
FUNC plus the page key opens its setup. Assign and confirm the MIDI channel
and controller numbers before expecting output from an external receiver.

The captured ARP page exposes TRAN, LEG, MODE, SPD, RNGE and NLEN; MODE is
OFF in the fixture. Its setup holds the arpeggiator note offsets. The MIDI
LFO page exposes SPD1–3 and DEP1–3, with LFO destinations and waveforms in
setup. CONTROL 1 exposes PB, AT and CC1–4; CONTROL 2 exposes CC5–10. CC
assignment happens in each CONTROL setup; unassigned/disabled CC values
display OFF. The captured CONTROL 2 values are all OFF, so that page alone
does not demonstrate active scene locks. NOTE/setup retain the stock MIDI
note and channel controls. This patch adds the held-scene editing path;
it does not introduce replacement MIDI track selection or receiver setup.

For the captured example, CC1 is encoder C on CONTROL 1. FUNC + FX1 opens
its assignment page: turn C to controller **74**, then press YES. Press FX1
to return. An inactive CC displays OFF; hold FUNC and press encoder C to
activate it. Its value is 0–127. The capture uses base **0** and scene lock
**64**. Scene-held edits change the scene value; releasing the scene key
shows the base value. OFF is an inactive state, not a numeric scene value.

Hold SCENE A or SCENE B and press a TRIG key to assign that scene to the
side. Keep the scene key held while turning the parameter's encoder. Release
the key and sweep the crossfader. An unlocked side uses the active trig lock,
or the track value when no trig lock applies. Use the stock scene clear,
copy and paste actions, Part Save/Reload and project save/load operations.

The actual 2.0 CTRL 1 SETUP screen also contains **SCNCTRL5**. Its detailed
behavior, per-control endpoint matrix, controller filter options and persistence paths
have not been independently qualified by this task. The earlier 8.2
port's assertion that all CC48/55/56 filter rows are excluded must not be
copied into a 2.0 release. A complete control/endpoint matrix remains unverified; unknown behavior is
not represented as verified.

## Usage

Connect the receiver, assign an output channel and enable the parameter
before creating a scene lock. Use the example below to verify a visible
held-scene edit, then test the receiver with the crossfader.

### Quick tutorial: morph a MIDI filter CC

1. Press MIDI and select a MIDI track. Set and confirm its output channel in FUNC + SRC. In FUNC + FX1, assign CC1 to controller 74 with encoder C and confirm with YES; the receiver must use that controller for its filter.
2. Return to FX1. Hold FUNC and press encoder C to enable CC1, then set its base to 0. Hold SCENE A, assign a scene with a TRIG key, and turn C to 64; the scene-held value should read 64.
3. Release SCENE A: the base value should read 0. Sweep the crossfader between your assigned scenes to hear the receiver change; clear the scene lock or disable CC1 to stop this example. The retained captures verify the values and release behavior without a connected receiver.

Set the external instrument's MIDI channel to match the OT and connect MIDI
OUT to its MIDI IN. The screenshot fixture has CHAN OFF and no receiver.
Pre-trig scene operation, simultaneous trig locks, rapid Part changes,
Direct Jump and CC/note ordering need their own measured verification;
successful static screenshots cannot demonstrate those timing behaviors.

## Scene mute

Mute a scene with FUNC + SCENE A or FUNC + SCENE B, as on stock audio
tracks. A muted scene's MIDI locks stop: the crossfader treats that side
like a blank scene, so it morphs between the other scene and the base or
trig-lock value. With both scenes muted, scene-locked CCs return to their
base value and the crossfader no longer changes them. You can still edit a
muted scene's locks while holding its key. Unmuting restores the morph.

The author's MIDISC2.0 release ignored scene mute ([#329](https://github.com/repeat98/modwerk/issues/329)).
`0.2.5-experimental` adds a small Modwerk patch on top of the unchanged
author recipe; see [TESTING.md](TESTING.md#scene-mute-fix-025).

## Compatibility and limitations

Requires original OS **1.40C**. MKII UI captures are recorded; the model of
the reported real unit is unspecified. The reconstructed MAIN OS exactly
matches the author's standalone release hash. No firmware is distributed.

The author's fixed regions overlap Octamod's chooser/ROM allocations, including
`0x400d6954` and `0x400d7600`. All thirteen checked single-module companions overlap
at least one region. Blindly overlaying this recipe onto an existing composition
is therefore unsupported. Mixed selections require a reviewed relocation or
an independently verified composition strategy; they must not reuse the old
8.2 compatibility proofs. OctaKit remains outside this integration.

Standalone MAIN and full ELEK/ELUP update parity and rejection pass in Node
and an actual browser worker. Exact total memory/stack accounting, defensible
worst-case cycle bounds and complete 2.0 control qualification remain pending.
Standalone selection uses the existing configurator and shared firmware builder.
No separate MIDI Scenes download flow is added.

## Tests and measurements

See [TESTING.md](TESTING.md), [software identities](evidence/software.json) and
[actual emulator measurements](evidence/emulator.md).
The recipe has 85 guarded regions: 9,027 written bytes consist of 5,848
literal changed bytes and 3,179 bytes recovered from hashed local-stock spans.
These are **recipe storage counts**, not code/RAM/stack totals or CPU cycles.
Do not equate them with a complete memory qualification.

The 3 October emulator harness exercises 360 focused helper fixtures and the
actual panel/playback paths. The focused crossfader maximum is 47,642 modeled
cycles and 156 bytes of observed stack; the exact additional scratch
reservation is 73,728 bytes. These are observations under the declared
conditions, not complete chip timing or memory bounds.

The owner accepts a reported standalone MIDISC2.0 hardware test. Its model,
duration, workload, measured timing and memory guards were not supplied here.
That report is recorded honestly in [hardware.md](evidence/hardware.md).
No real-unit test was performed by this task. Synthetic application tests
cover malformed recipes, provenance, range/overlap guards, stock-reference
checksums, changed inputs, output identity and input immutability.

## Authorship and licences

MIDISC2.0 implementation and author recipe: bkkbrls-del, MIT; retain
[LICENSE](LICENSE). Sam Banks authored the earlier relocatable 8.2 octabam
port, which is archived outside discovery and is not relabelled as 2.0.
The stock-free recipe adapter, browser reconstruction and thumbnail are
original Octamod contributions under MIT. Exact origin/transformation hashes
are recorded in `sdk/imports/midi-scenes-release-4f9a894.json`.

Stock instructions, descriptors and unchanged gaps are recovered from the
user's fingerprinted local image. Only authored delta data and stock offsets,
lengths and hashes are retained. Keep reconstructed output, upstream raw patch
material, cards and framebuffer dumps temporary and private. Firmware must
never enter source-build automation, community uploads or source control.

Original LCD exports have separate [media rights](media/LICENSE.md).
Underlying Elektron and third-party rights remain reserved. A contributor
declaration requires reviewer verification and is not automatic legal clearance.

## Screens and audio

Actual firmware-rendered MIDISC2.0 LCD, MKII panel, stopped transport, empty
scratch card, integer scale 6, monochrome. No audio preview is supplied.

![MIDI NOTE SETUP; channel OFF in the fixture without an external receiver.](media/ot-channel.png)

![MIDISC2.0 MIDI CTRL 1 SETUP; CC1 assigned to 74 and SCNCTRL5 visible.](media/ot-setup.png)

![MIDI CONTROL 1; enabled CC1 base value 0.](media/ot-location.png)

![Scene A held; CC1 scene-lock value 64 before playback.](media/ot-scene-lock.png)

![Scene A released; CC1 returns to base value 0.](media/ot-released.png)

![MIDI ARPEGGIATOR with MODE OFF; TRAN, LEG, SPD, RNGE and NLEN controls.](media/ot-arp.png)

![MIDI LFO with SPD1–3 and DEP1–3 controls.](media/ot-lfo.png)

![MIDI CONTROL 2 with CC5–10 inactive at OFF.](media/ot-control2.png)

These screens prove their displayed setup/edit/release states. They do not
prove MIDI wire output, timing, hardware operation or arbitrary compositions.
See [capture provenance](media/capture.json).
