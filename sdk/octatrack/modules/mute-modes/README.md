# Mute Modes

## Overview

Choose a stock cut, FX tails, trig suppression or amp-envelope completion for muted and soloed-out audio tracks.

Version `0.2.4-experimental`. While MUTE MODE is OT, the default, Mute Modes rests: the Octatrack runs its own mute code untouched and the module costs nothing. Choosing OTFX, OTFX-T or DT-T wakes it within one screen refresh. It needs Modwerk base 0.8.2 or newer. In OTFX-T and DT-T it also tells machines that start their own notes, such as FM Synth, which trigs it drops (`ev_trig_muted`, since 0.2.3). The owner measured the resting and the wake on an MKII; nobody has yet listened on a unit that a muted track stays silent right after a mode change (TESTING.md). The author's earlier reports remain there.

## Controls

| Mode | Behavior |
|---|---|
| OT | Immediate post-FX cut, as on stock. |
| OTFX | Cut the dry signal; FX tails continue and trigs keep firing. |
| OTFX-T | Cut the dry signal with FX tails and suppress new trigs. |
| DT-T | Let the active voice finish its amp envelope and suppress new trigs. |

In PERSONALIZE, RIGHT/LEFT clamp at the ends and YES cycles with wraparound. The stored gate order differs from the displayed order; the getter/setter translate it from one persisted word.

## Usage

The setting affects muted and soloed-out audio tracks globally. Existing stock track mute gestures are retained. It does not add a MIDI mute mode or an FX slot.

### Quick tutorial: keep FX tails when muting

1. Open PROJECT > SYSTEM > PERSONALIZE and select MUTE MODE.
2. Choose OTFX to cut the dry signal while delay and reverb tails continue; trigs keep firing underneath.
3. Mute and unmute an audio track with a long delay or reverb tail, then try OTFX-T to suppress new trigs.
4. Choose DT-T to let the current voice finish its amp envelope, or OT to restore the stock cut.

## Compatibility and limitations

OS 1.40C only, MKI and MKII source support; current Modwerk hardware testing is pending.

- OT is the default. The global PERSONALIZE setting is stored in battery SRAM; it is not a Part or project setting.
- An OS upgrade resets PERSONALIZE. Saving or switching Parts/projects does not make the mode project-specific.
- SIDECHAIN_COMPRESSOR requires its SC_KEY assembly variant so a muted key continues feeding the compressor.
- No effect slot is consumed. Audio tracks and solo exclusions are affected; MIDI track mute behavior is unchanged.
- The shared native and browser builders insert MUTE MODE at PERSONALIZE row 2 and select SC_KEY automatically beside Sidechain Compressor.

## Tests and measurements

Source identity, actual native-code probes, instruction counts, conservative core-cycle bounds and stack peaks are recorded in [TESTING.md](TESTING.md). Stock callbacks and chip wall-clock behavior are explicit exclusions. The release is bound by the exact-source owner approval in sdk/. Native/browser composition, source packaging and behavioral probes are checked independently; model cycles are not chip wall-clock measurements.

## Authorship and licences

Zac Kyoti: mute runtime, PERSONALIZE menu and author byte references. Sam Banks: octabam integration. Original MIT notices are retained in [LICENSE](LICENSE). See `../../../imports/mute-modes-72d115f.json` for this version's exact repository pins (0.2.4 comes from the owner's unmerged pull request Zac-Kyoti/octatrack-kyoti-fw#5, under his waiver of the author's merge) and `../../../imports/mute-modes-6f9e5bc.json` for the original import and per-file transformations. Original Modwerk probes use GPL-3.0-or-later; authored source is unchanged. No stock firmware, extracted tables/routines, compiled image or card is distributed here.

## Screens and audio

Actual native LCD captures were reviewed in monochrome. Their image, emulator, panel plan and PNG hashes are recorded in [media/capture.json](media/capture.json). These use a locally composed standalone image and a DSP host stub; they do not establish audio continuity, a valid loaded project, common-builder parity or physical hardware behavior.

![PROJECT > SYSTEM](media/ot-system.png)
![MUTE MODE: OT](media/ot-mute-ot.png)
![MUTE MODE: OTFX](media/ot-mute-otfx.png)
![MUTE MODE: OTFX-T](media/ot-mute-otfx-t.png)
![MUTE MODE: DT-T](media/ot-mute-dt-t.png)
