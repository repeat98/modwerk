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
  is the same on the unit and in the emulator. Not yet tested on the unit.
