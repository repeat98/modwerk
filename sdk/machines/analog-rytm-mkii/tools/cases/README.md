# Rytm test cases

Cases for [`rytm_test.py`](../rytm_test.py) ([TEST_RUNNER.md](../../TEST_RUNNER.md)): the link's own here, a module's
in a folder named by its id. Their references are captures of the unit's screen and stay on each developer's computer
(`--refs`, by default under the runner's cache): record them with `--record` after looking at every PNG.

| Folder | Cases | Last run |
| --- | --- | --- |
| `.` (the link) | 5 | rytm-emu and a MKII, 9 and 10 November 2026 |
| `improved-amp/` | 25 | a MKII, from RAM, 10 and 11 November 2026: all pass. The five hold cases need the source with HLD in steps (11 November 2026) or later |
| `quick-velocity-aftertouch-assign/` | 6 | a MKII, from RAM, with the LFO assign build, 11 November 2026: 6 pass twice |
| `sample-rate/` | 7 | a MKII, from RAM, with Improved SMPL 0.4.0 (waveform view), 11 November 2026: 7 pass twice. Not run on 0.5.0 |

A module's cases run on an image with the development link (a `--dev` base) and that module. Each case's header says
what it changes, what it ends on and where its numbers come from.
