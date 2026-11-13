# Track Names testing

## 0.1.3-experimental

The recognition no longer carries any picture of the stock screen (0.1.2 had a 16 x 24 pixel copy of the MIX box
and the sixteen TRKn labels, taken from screenshots): CONTRIBUTING forbids extracted tables. 0.1.3 checks the scroll
bar's page marker and the MIX box's outline as geometry, and draws each TRKn itself with the OS's text routine and
font into a scratch frame to compare. The MIX label uses a 6-row font the base does not offer, so it is only
required to be present; a stock TRKn label in view confirms the page.

Emulator, 2026-11-13 (digikit, working build, image `71e7a9e1…5887`): the scratch-rendered TRK1 matched the stock
label pixel for pixel; names and badges on Internal Mixer 2/5 and 3/5; Compressor 1/5, FX Mixer 4/5, External Mixer
5/5 and SRC unchanged; both PTN pop-ups stay on top with names cut at their edge; all back after closing. Captures
redone on this version (`media/capture.json`).

Hardware: to be repeated on the pinned-toolchain 0.1.3 package (the results below are 0.1.2's).

## Emulator (digikit, logic only)

2026-11-13, digikit `5e62a52` (`digi-emud`, ColdFire only, no audio), stock Digitakt II OS 1.17
(`26c22f66…d5`) with core 1.0 and Track Names 0.1.0-experimental, working build (GCC 13.2 m68k-linux-gnu).

- Stock check before the mod: SETUP > RENAME on A01 track 1 wrote the name into A01's kit (kit + 0x38); A02's kit kept
  `PRESET 1`, and SETUP on A02 showed `PRESET 1`. Track t's name is at kit + 0x38 + t × 0x450, 16 bytes.
- Recognition from the frame: page 2/5 found as 1, 3/5 as 2; Compressor 1/5, FX Mixer 4/5, External Mixer 5/5
  and SRC as 0 (diagnostic build).
- Internal Mixer 2/5 and 3/5: names in place of TRKn, centred, cut at 5 characters (PERCUSSION shows PERCU); lower
  case shown (Fx 1); default names keep TRKn; badges 1-16 at the top left of each fader.
- A01 to A02 on the mixer: A02's default names, TRKn.
- Compressor 1/5, FX Mixer 4/5, External Mixer 5/5, TRIG and SRC pages: unchanged.

The emulator is not hardware evidence: no sound, no exact timing.

Documentation captures, 2026-11-13: digikit `5e62a52`, built image sha256 `d9ae08c0…0400827` (OS 1.17,
core 1.0, Track Names 0.1.2 from source identical to `bc32ae2`), cold boot, fresh project. Eleven names entered
through SETUP > RENAME with panel input only (the harness read the editor's buffer to check each character and
wrote no memory): every name read back from the pattern's kit as typed. Mixer 2/5 and 3/5 show them, tracks 11 and
13-16 keep TRKn, the PTN pop-up stays on top. Plan and PNG hashes in `media/capture.json`.

## Hardware

2026-11-13, reported by the author (crisp909), Digitakt II OS 1.17, core 1.0, built on elekloader.github.io:

- First build (mixer found through the view controller's page set, controller + 0x9c): the mod ran, but nothing
  changed on the mixer. A diagnostic build showed the top view's vtable 0x40216F14 as in the emulator, but the
  pointer at controller + 0x9c was 0 on the unit (non-zero in the emulator), so the mixer was never recognised.
- Second diagnostic (main view + 0x58 -> + 0xac -> + 0x74): the same, page set not found on the unit.
- Since then the mixer is recognised from the drawn frame (the MIX box and the scroll bar's page marker), which
  is the same on the unit and in the emulator.
- Third build (frame recognition, working build with GCC 13.2 m68k-linux-gnu, the same source as commit `10a0617`):
  works on the unit: the Internal Mixer shows the track names and the numbered badges.

- Reported by the author: names and badges were drawn over pop-ups, e.g. pattern select. Fixed in
  0.1.1-experimental: each cell is drawn only where the stock label and the fader's ticks are still in view.
  Reported by the author on 0.1.1: with the bank pop-up open, track 4 (half under it) showed TRK4 instead of
  its name. Fixed in 0.1.2-experimental: the pop-up's frame is found (its long top and bottom edges, plus the one
  pixel the OS clears around it) and names and badges are clipped to it. Emulator: both PTN pop-ups, the name
  half under the pop-up is cut at its edge, and after closing all names are back.
  Reported by the author on 0.1.2: faint lines beside the pop-up, later along the whole rows of its top and bottom
  edges, moving with the pop-up's size (photos). They cross the MIX box, which the mod never writes, and the author
  then saw the same lines with the stock OS, without the mod: the OLED's row crosstalk, not the mod. Two attempts
  against them (0.1.3, 0.1.4, never kept) were withdrawn; 0.1.2-experimental is the version kept.

2026-11-13, reported by the author (crisp909) on 0.1.2-experimental (working build, elekloader.github.io, core 1.0):

- Names per pattern with PERFORM KIT off: each pattern shows its own names.
- Internal Mixer 2/5 (tracks 1-8) and 3/5 (tracks 9-16) correct.
- SAVE PROJECT and a reload: the names come back and show on the mixer.
- Other pages unchanged.

2026-11-13, reported by the author (crisp909) on a package built with the pinned toolchain:

- Source commit `bc32ae2113c315f5cd4f48bc2028ef92892fa6d8` (native source sha256 `dc6899be…481dc`), built with
  `scripts/build-elemod-isolated.sh` in Docker image `sha256:c8a80381f0b67a059f76fe2a54f8686003dc45159359457b22ca9e3985a025f9`
  (GCC 16.2.0), packaged with `scripts/package-elemod-recipe.mjs`.
- Package `track-names-0.1.2-experimental-os1.17.elemod`, sha256
  `cc908de8c9036a03b2678c0bf9b93d9e9e28b96d5967c18c27abf933f4a03a8f`, image built on elekloader.github.io with core 1.0,
  Digitakt II OS 1.17.
- Repeated all four checks above: names per pattern (PERFORM KIT off), mixer pages 2/5 and 3/5, names after SAVE PROJECT
  and a reload, other pages unchanged. All as expected.

- Reproduced by the author after the merge of main `208f05a6`: `scripts/build-elemod-isolated.sh` in the same image,
  then `scripts/package-elemod-recipe.mjs … --check` against the committed package: it reproduces.

Not tested: PERFORM KIT on; how long it ran.
