# Track Names testing

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

Still to check on the unit: names per pattern (A01 and A02 named differently), page 3/5 (tracks 9-16), names after
SAVE PROJECT and a reload, and the other pages unchanged.
