# Analog BD for the Analog Rytm MKII

BD ANALOG plays repeat98's 808 and 909 bass drum models from Analog BD for the Octatrack (0.1.7: the 909 refitted to Skee Mask's recorded TR-909), on the BD, SD and BT tracks. The tables are generated from his Python models at 48 kHz (`tools/gen_tables.py`); like the Octatrack, the 909 works its control out every 16 samples. The engine is fixed point on the ColdFire: hand-scheduled assembly for every per-sample pass (`src/ab_*.s`), each checked against its C reference (`tools/asm_check.py`). It is the first of the Modwerk base's digital voices ([guide](../../../machines/analog-rytm-mkii/README.md#digital-voices)): the base handles the hit, the voice's stream, LEV and the 808/909 switch, and the voice's filter, AMP and OVR come after it, as for stock CP CLASSIC. It needs the Modwerk base, not irpina's core-ar2 0.7 release.

## Controls

SYNTH page:

| Knob | Label | What it does |
| --- | --- | --- |
| A | TUN | Body pitch. 909: one octave, 32.7 to 65.4 Hz, 64 the recorded 909. The note (chromatic mode) transposes it. |
| B | TON / SWT | 808: tone of the hit and body. 909: pitch sweep time and end point (the 909's TUNE). |
| C | ATK | Click strength. |
| D | DEC | Body decay. 909: 15 ms to 600 ms, 80 the recording. |
| E | SWP | Pitch sweep depth. |
| F | LOW | Desk low band's weight. 64 is neutral. |
| G | HI | Desk high band's weight. 64 is neutral. |
| H | LEV | Level into the voice. |

- **808 or 909:** tap encoder B on this page. B's label shows which (TON 808, SWT 909). It is saved with the sound, starts at 808, and is not a p-lockable parameter.
- **Accent** is each hit's velocity. 100 is the recorded 909 balance; softer hits are rounder, harder ones snappier.
- **Fixed:** every hit opens the same way (the OT's FIXD on). No SAT; use OVR or DIST. No LPF; use the filter page.

## Limits

- Tracks: BD ANALOG is in the machine list of the BD, SD and BT tracks only. On the unit (rig, 11 Nov 2026) three 909s hit together played clean and four overran the audio block, so three voices is the cap.
- CPU: the Rytm's own audio work takes about two thirds of the audio block with nothing playing. An 808 voice adds about 7 % of the block (its render about 5 %, the base's work under 1 %, stock's for the track about 1 %), so about four 808 voices can hit at the same instant; more make the busiest blocks overrun, heard as clicks. The 0.1.7 909 is not yet measured on a unit; the 0.1.0 909 rendered about a fifth more than the 808, so expect three to four. Hits spread across the beat cost less ([TESTING.md](TESTING.md)).
- 0.2.0 changed the 909 (Analog BD 0.1.7): sounds saved with 0.1.0 play the 909 differently; set TUN and DEC again.
- The level into the voice's analog path and how hard it can be driven are not yet measured on a unit.

## Credits

Original 808/909 models, fits and coefficients: Jannik Aßfalg (repeat98), MIT. Rytm port: Nathaniel Pavel (npp1993).
