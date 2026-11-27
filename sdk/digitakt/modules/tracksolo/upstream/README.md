# Track Solo (Digitakt MKI, OS 1.54)

Hear one track on its own, then snap back to the full pattern.

## How to use it

| Do this | What happens |
|---|---|
| **Hold TRK, then hold UP** | The active track plays alone for as long as you hold UP. You can let go of TRK. |
| Let go of **UP** | Every track plays again. |
| **Hold TRK, press DOWN** | Latch: the active track stays soloed after you let go. |
| **TRK + DOWN** again | Unlatch. Do it on a different track to move the solo there. |

While a solo is on, **S** and the track number (e.g. **S3**) show in the top-right corner.

- The other tracks' notes just don't start. Notes already sounding ring out naturally, and
  delay/reverb tails keep going.
- The stock mutes are never touched, so your mute setup is exactly as you left it.
- Lock trigs on other tracks still apply, so nothing jumps when the solo ends.
- Works on audio and MIDI tracks.

## How it works (plain version)

The shared seq-events mod asks each mod "should this step fire?" just before it plays. While a solo
is on, Track Solo answers "no" for every other track's note trigs. It decides once per step and
sticks with that answer, so letting go mid-step can't confuse the sequencer.

Needs **seq-events** in the same build.

## Key combos used by your mods

| Combo | Mod |
|---|---|
| TRK + YES | Ctrl All |
| TRK + NO | Kit A/B |
| TRK + UP (hold) | Track Solo |
| TRK + DOWN | Track Solo latch |
| TRK + LEFT / RIGHT | ledcolors |
