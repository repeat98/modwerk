# Smart Reload

Version 0.1.0-experimental · by @Andrey-Sidorkin · a draft, tested by its author on one MKI.

## Overview

An arrangement row can choose scenes A and B. Stock's RELOAD PART (FUNC + CUE) puts back the scenes saved with the
Part, so after a reload in the middle of a song the crossfader morphs between the Part's scenes instead of the row's
until the next row starts. With Smart Reload, in arranger mode, the Part reloads as always and the current row's scenes
A and B are selected and heard at once, as the row plays without a reload: a side set to `--` ("no change") gets the
scene the rows above left, and in pattern mode nothing changes.

## Controls

None of its own. It changes what RELOAD PART does in arranger mode:

| Where | Keys | What it does |
| --- | --- | --- |
| Main screen, arranger mode | FUNC + CUE | Reloads the Part as stock, then selects the current row's scenes A and B (a `--` side: the scene the rows above left) |
| Main screen, pattern mode | FUNC + CUE | Stock's RELOAD PART, unchanged |

The current row is the row playing, or, stopped, the row PLAY continues from.

## Usage

1. Switch arranger mode on (MKI: FUNC + PATTERN) and give an arrangement row scenes in its SCENE column.
2. Save the Part (FUNC + PART, SAVE): RELOAD PART goes back to the saved Part.
3. Play the arrangement; tweak the Part; press FUNC + CUE.

## Quick tutorial

1. In the arrangement editor, give row 0 scenes 2 and 3 (the Part's own are 1 and 9, say), and save the Part.
2. PLAY from row 0: scenes 2 and 3 are selected. Turn a few knobs.
3. Press FUNC + CUE: PART 1 RELOADED, the knobs are back where the Part was saved, and scenes 2 and 3 stay selected
   and heard; the crossfader still morphs between them.

## Compatibility and limitations

- **A change to a stock flow: RELOAD PART in arranger mode.** What changes: after FUNC + CUE (or RELOAD in the Part
  menu for the Part in use) in arranger mode, the selected scenes are the current row's instead of the Part's saved
  ones; the Part is marked edited again, as the arranger marks it when a row sets its scenes. Why: in a song the row
  decides the scenes; stock's reload undid that until the next row. Considered instead: a new key gesture (another
  key for one more reload is easy to miss on stage, and stock's own reload already does the rest). Only while the
  module is installed and only in arranger mode; pattern mode is stock's. Checked beside it: pattern mode, a row side
  set to `--`, the Part menu's RELOAD, Arr Rows and Songbook's setlists.
- **`--` means "no change", as stock.** After a reload a `--` side gets the nearest scene set on that side in the rows
  above that play the same Part (what the main screen shows for the row), or the Part's own scene when none above sets
  it. The rows above are taken in order: a row reached by a JUMP or LOOP gets what the rows above it set, not what
  played just before it. The arranger writes a row's scenes into the Part itself, so a Part saved while a row's scenes
  are active keeps them as its own.
- Only the Part in use gets the row's scenes: RELOAD of another Part from the Part menu is stock's. A row whose pattern
  is in another bank or plays another Part, a LOOP/JUMP/HALT or REM row, and no current row leave the reload as stock.
- **Takes:** stock's RELOAD PART routine, stepped into at its entry; no key gesture of its own (`uiClaims` empty). No
  other module or base hook uses that site (`npm run modules:compat`).
- **Memory:** under 1 KB of code; no battery RAM, no files.

## Tests and measurements

See [TESTING.md](TESTING.md). The OS 1.40C addresses and how they were found are in [RESEARCH.md](RESEARCH.md).

## Authorship and licences

Original module by Andrey Sidorkin, MIT (LICENSE). No firmware, stock code or stock data is included: stock addresses
and instruction hashes only.

## Screens and audio

None yet: the module draws nothing of its own (stock's PART n RELOADED and its scene display).

## Develop

- Hear it: `npm run module:dev -- smart-reload` builds it and tries it on your unit over USB; `--watch` does that again on every save.
- Check it: `npm run module:doctor -- --draft smart-reload`, and `python3 -B sdk/drafts/smart-reload/verify.py` for the host gate.
- The logic is C (`smart_reload.c`); `generate.py` writes `smart_reload_core.s`, which the build links. Before you write ColdFire code: the traps in sdk/octabam/AGENTS.md.
