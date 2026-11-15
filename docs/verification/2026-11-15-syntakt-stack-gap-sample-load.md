# Syntakt 1.42 stack gap, sample load on a unit, 15 November 2026

The developer's Syntakt, results as reported after the run. This is the sample load the [10 November note](2026-11-10-syntakt-stack-gap-on-unit.md) did not do: the slots were cleared and filled again while the stack-gap build was running. The unit played all 64 samples from one track, survived two power cycles, and returned to stock 1.42. A recording of that track cancelled a recording of the same pattern on stock. The 84 bytes at `0x47fe0000` were not read. This run records that the lowered stack survived clearing and reloading the slots. It does not prove those bytes remained.

- **Stock file:** `Syntakt_OS1.42.syx`, sha256 `ded3c59fdb909eb9e2c3307b30a486452c8fa6947b12c14e0ce35a187b7f37c1`. It stayed on this computer.
- **Build:** the stack-gap file from the [10 November note](2026-11-10-syntakt-stack-gap-on-unit.md), sha256 `9152335cd89d976849aa50b9393ff3eb3a04549b01e9202add7f9de4ddfc51af`. Flashed over USB with Elektron Transfer, in the normal upgrade. The screen version was not written down on this run.
- **Samples:** with that build running, Transfer cleared every sample slot. Every slot was then filled again. The new samples were kicks, each one different.
- **Pattern:** tracks 1, 2, 3, 4, 5, 6, 8, and 11. Track 8 had 64 steps. Each step parameter-locked a different sample, so the 64 kicks played in order. Track speed was 1/4. Tempo was 95. The developer described this track as Twinshot.
- **Play:** track 8 alone, then track 8 with the other sequenced tracks. No freeze, error, or audio glitch was reported. The track 8 audio was reported to have no artefacts.
- **Power cycles:** two, after the pattern was made. Track 8 was recorded after them, so the unit had returned and the pattern was still there.
- **Back to stock:** stock 1.42 was flashed over USB. The same samples and the same track 8 pattern played. Track 8 was recorded again.
- **Compare:** both recordings were 40 seconds. They were loaded into Ableton on two audio tracks and aligned to the same start. A Utility on the second track inverted its phase. The master output was silence. The two recordings cancelled.
- **Not done:** reading the 84 bytes at `0x47fe0000`. The version string on the screen was not written down. A full pass of the other factory functions was not done.
