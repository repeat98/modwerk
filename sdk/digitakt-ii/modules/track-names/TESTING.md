# Track Names testing

## Emulator (digikit, logic only)

2026-11-13, digikit `5e62a52` (`digi-emud`, ColdFire only, no audio), stock Digitakt II OS 1.17
(`26c22f66…d5`) with core 1.0 and Track Names 0.1.0-experimental, working build (GCC 13.2 m68k-linux-gnu).

- Stock check before the mod: SETUP > RENAME on A01 track 1 wrote the name into A01's kit (kit + 0x38); A02's kit kept
  `PRESET 1`, and SETUP on A02 showed `PRESET 1`. Track t's name is at kit + 0x38 + t × 0x450, 16 bytes.
- Internal Mixer 2/5 and 3/5: names in place of TRKn, centred, cut at 5 characters (PERCUSSION shows PERCU); lower
  case shown (Fx 1); default names keep TRKn; badges 1-16 at the top left of each fader.
- A01 to A02 on the mixer: A02's default names, TRKn.
- Compressor 1/5, FX Mixer 4/5, External Mixer 5/5, TRIG and SRC pages: unchanged.

The emulator is not hardware evidence: no sound, no exact timing.

## Hardware

Not tested yet.
