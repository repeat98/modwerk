# TRACK MUTES hardware report

- **Tester:** jonathanwardle1992-beep, 24–25 October 2026.
- **Unit:** one Octatrack (OS 1.40C card flash). Panel generation not recorded; treat model as unstated.
- **Source:** commit `7f5cb5cbde61162319e7a7881b692f523f5beba7` (`0.1.32-experimental`).
- **Image:** private card `TRACK MUTES 0.1.32.bin` / ELEK `TM 0.1.32`, SHA-256 `80ea9496ada52964401c3d0786dd7b21bbeb77e45a4e075faeaa473183adc624`. Firmware is not in git.

## Results

Same-unit card flashes of `0.1.0`–`0.1.31` are in [TESTING.md](../TESTING.md). None of those images is a pass for the full mute/select/AED set.

Hardware LCD photographs, 25 October 2026: SYSTEM STATUS OS VERSION reads `TM 0.1.32`. PERSONALIZE shows TRACK MUTES empty and, after YES, ticked.

On this `0.1.32` card the tester reported that with AED open, FUNC+T follows the selected track's waveform as desired. That is reported hardware, one tester, card build. It is not in the photographs and is not a verified stress pass.

## Limits

- AED waveform follow after FUNC+T on `0.1.32` is reported, not verified, and not stressed.
- USB Keep/Undo, `ot_emu`, MIDI transport and an MKI panel are untested.
- TRACK MUTES alone on a card build; Mute Modes, Play Start and Play Modes cannot share PERSONALIZE with it.
- Instruction counts are a static bound of authored ColdFire, not chip wall-clock.
