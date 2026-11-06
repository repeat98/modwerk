# Threshold Slices

Version: `0.1.0-experimental` · author: @jonathanwardle1992-beep · draft.

## Overview

CREATE THRESHOLD SLICES chops the current trim where the level rises. It is on the audio editor SLICE menu, under DELETE ALL SLICES and above CREATE SLICE GRID. With Beat Slicer installed, this row sits above CREATE BEAT GRID.

A slice starts about 2 ms before a rise through the threshold and ends at the next start. The last slice ends at the trim. The first start stays at the trim, so the audio before the first hit is still a slice.

## Controls

Select the sample, open AED, press AMP for SLICE, then YES, and choose CREATE THRESHOLD SLICES.

| Control | Behavior |
| --- | --- |
| Encoder A | Threshold, 10 to 100, as a percent of the loudest point in the trim. Higher keeps fewer hits. |
| Encoder B | Minimum gap: 10, 20, 50, 100, 200 or 400 ms. |
| Encoder C | L+R uses the louder side. LEFT and RIGHT use that side only. |
| YES | When the scan has finished, opens the stock CREATE SLICES? or REPLACE SLICES? question. Markers change only after that second YES. |
| NO | Close the popup. Nothing is written. |

The right side shows the scan as a percent, then CREATE or REPLACE, or EMPTY, SHORT, OVER64, CHECK, WAIT, REFUSED or NO READ. EMPTY means no rise cleared the threshold. OVER64 means the result would pass 64 slices; raise the threshold or the gap. NO READ means this base cannot hand the module the waveform yet.

## Usage

1. Stop recording into the buffer you are editing. Playback of the pattern can continue.
2. Open the popup and set the threshold and the gap. A drum loop often starts well at 40 and 50 ms.
3. Press YES, then YES at the stock question. Play the slices with slice mode on. DELETE SLICE and DELETE ALL SLICES clear them the usual way.

### Quick tutorial: chop a loop on its hits

1. Load a Flex or Static loop, open AED, press AMP for SLICE, then YES, and choose CREATE THRESHOLD SLICES.
2. Leave the threshold at 40 and the gap at 50 ms. Wait until the right side says CREATE or REPLACE and shows a slice count.
3. Press YES, then YES at the stock question. Trigger the slices. Press NO at the question if you want the old slices left alone.

## Compatibility and limitations

- OS 1.40C and a Modwerk base whose sample editor can copy peaks. The module installs beside Beat Slicer. Card firmware cannot include it.
- At most 64 slices. A result past that is refused.
- Replacing slices can change the slice numbers parameter locks point at, on every track that uses the sample.
- A start on a rise can still click. Nothing is saved on its own.
- Not yet tried on a unit, on the MKI, or after a project save and a power cycle.

## Tests and measurements

Host scan of synthetic peaks: `python -m unittest sdk.tests.test_threshold_slices`. The base host fixtures cover the peak read. No cycle measurement and no unit trial yet. See [TESTING.md](TESTING.md).

## Authorship and licences

Original module by @jonathanwardle1992-beep, MIT ([LICENSE](LICENSE)). The popup lettering is adapted from Beat Slicer's device font by @twwwy, MIT. No Elektron firmware, extracted routines or tables, factory samples, memory dumps or built firmware images are included.

## Screens and audio

No screen capture yet. The popup is drawn on the unit; the pictures belong with the first trial.
