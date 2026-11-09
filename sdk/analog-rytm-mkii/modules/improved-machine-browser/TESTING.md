# Improved Machine Browser testing

## Hardware

Analog Rytm MKII, OS 1.74, build MBC2 (0.1.0-experimental beside sixteen other modules on the Modwerk base with machine list sections, sha256 31f0c670), reported by the tester, 8 Nov 2026.

| Check | Result |
| --- | --- |
| FUNC + DOWN, FUNC + UP | Jump between the sections as expected, on BD and on another track |
| UP and DOWN, held too | The outline moves and repeats; the machine does not change until YES |
| Knob A slowly and quickly | Scrolls the outline |
| YES | Confirmed!, stock's own message; the outlined machine loads |
| Scroll, then NO | No change |
| FUNC + knob A | Same as without FUNC: one machine, no section jump. Cause: the module read the knob event's byte + 20 as FUNC, but it is the knob's own button held while turning. Fixed in MBC3 (FUNC read from the keys), not yet tested on the unit |

## Emulator

rytm-emu (dtboot) at revision 2ac0f1f, headless, panel keys held 12M instructions. Not hardware evidence: the emulator only approximates the instrument.

### Stock first (no module)

Stock OS 1.74 and a combined build without the module, BD track, default kit, machine list opened with FUNC + SRC on BD PLASTIC: every UP or DOWN press, with or without FUNC held, moved the outline one machine and loaded it at once (the SRC page under the list changed with each press). Read from the code: the list's key routine sends -1 or +1 for UP or DOWN whatever FUNC does, and its knob routine the sign of any A-H turn, to a step that loads the next machine of the track's list.

### MB01: the Modwerk base (plain, ba530f45) + this module, stock OS 1.74

sha256 07ef0857. BD track, list opened on BD PLASTIC.

| Check | Result |
| --- | --- |
| DOWN, DOWN | Outline BD SILKY, then BD SHARP; header Confirm? Y/N; SRC page still BD PLASTIC's (TUN SWT / TYP MOD) |
| FUNC + DOWN | Outline SY DUAL VCO, past the dotted line |
| FUNC + UP, FUNC still held | Outline BD HARD, the top of the section above |
| FUNC + UP again | Stays on BD HARD (the first section) |
| DOWN, knob A two detents right, DOWN | BD CLASSIC, BD FM, BD PLASTIC, BD SILKY |
| YES | Confirmed!; the list closes; SRC page shows BD SILKY's knobs (HLD DUS CLK) |
| List again, DOWN, NO | Outline BD SHARP, then NO: the list closes, SRC page still BD SILKY's |

### MBC1: a sixteen-module combined set on the base with machine list sections + this module

sha256 1fba69f1. The same set without the module reproduced its reference image byte for byte first; adding the module kept its storage lockfile unchanged. BD track, list opened on BD PLASTIC; the list holds a mod machine in the BD section and two in the SY section.

| Check | Result |
| --- | --- |
| FUNC held, DOWN eight times | SY DUAL VCO, SD HARD, UT NOISE, DISABLE, then stays on DISABLE |
| FUNC still held, UP twice | UT NOISE, SD HARD |
| FUNC released, DOWN three times | SD CLASSIC, SD FM, SD NATURAL |
| FUNC + UP three times | SD HARD (this section's top), SY DUAL VCO, BD HARD |
| FUNC + DOWN, then UP, then YES | SY DUAL VCO, the BD section's mod machine, Confirmed!: the mod machine's SRC page |

Both runs: the only CPU exceptions were TRAP #0, as on the builds without the module.

### MB02 and MBC2: after the code review

The knobs now go through stock's own accumulator, as stock's list does; the arrows pass on if the list has no step function (never on OS 1.74); YES loads only while the track still has the machine the list opened with. MB02 (the plain base + this module, sha256 e2adbc2a) and MBC2 (the sixteen-module set + this module, sha256 31f0c670, storage lockfile unchanged), BD track, list on BD PLASTIC:

| Check | Result, both builds |
| --- | --- |
| DOWN, FUNC + DOWN | BD SILKY, then SY DUAL VCO; SRC page still BD PLASTIC's |
| FUNC + UP twice | BD HARD, then stays |
| Knob A and B turns, with and without FUNC | The outline does not move. Stock OS 1.74 alone does not move either for the same emulated turns (one to eight steps a turn): rytm-emu's turns do not get through stock's accumulator, so knobs are not tested |
| UP, YES | BD HARD loads: Confirmed!, its SRC page (WAV HLD TIC) |
| List again, DOWN, NO | BD CLASSIC outlined, then NO: still BD HARD's page |

## Not tested

- On the unit: MIDI out of the load, FUNC + knob on MBC3, and a knob pushed while turning (stock's faster turn, passed on unchanged).
- In rytm-emu, the knobs A-H: its turns do not get through stock's accumulator, stock's own list included.
- A track's list with no dotted line.
- The list opened from a sound's SOUND SETTINGS menu, if it opens there.
