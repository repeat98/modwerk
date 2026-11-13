# The CPU FULL guard and the panel's lag, 13 November 2026

The owner's Octatrack MKII over USB from the owner's PC, on a development twin (`23f3f1b1…`) of the flashed base
`4e9a87ea…` (main at `f26834406`), the owner's project at 126 BPM. CPU is the base's meter (`stats`), the mean of
three or four readings. The module packages are the published ones of that commit.

## How the lag was measured

A private step in a copy of `scripts/device.mjs` turns one encoder 45 detents, 30 a second, with dev request 8, and
meanwhile reads the composed screen with dev request 7 (about 1.5 ms a read, 4 ms apart). A redraw is a change in the
knob's columns of that frame. It reports how many redraws the 45 detents got and the longest wait between two. With no
turn the columns did not change in three seconds. Reading the screen without the 4 ms pause raised the CPU by about 6
points, with it by 1 to 2. The UI tick count and the tick gap did not show the lag: ticks came 60 a second at every
load below.

## What the guard refused

Playing at 93 to 95 % (29 modules, FM Synth 0.1.2 among them): Euclid on T1 FX1, Mini Verb on T1 FX2, POLY8 and VECTOR
on T2 SRC were each refused with CPU FULL / UNIT IS BUSY and the slot kept what it had. FILTER and NONE on T2 FX1 went
through at 94 %.

## What it let through

- Installing: 29 modules went in with nothing refused. CPU stopped / playing: none 44.6 / 70 %, 27 modules 57.3 / 77 %,
  with POLY8 61.4 / 82 %, with FM Synth 0.1.2 64.0 / 93 to 95 % (longest frame 117 %).
- Picks made stopped. With those 29 modules the stopped unit read 70 %, and Euclid, Mini Verb, LOFI2 and Tape Echo
  were accepted on T1 and T2. Playing then read 95 to 97 % with a longest frame of 121 to 130 %, and after about twelve
  seconds the DSP frames stopped (stall record 44, after a frame interrupt of 473 µs). Which module did it was not
  separated.

## The lag by load

Knob A on T4 FX2 (Tape Echo) and on T1 SRC, playing unless noted. Redraws of 45 detents on the FX page, then the
longest wait between redraws on each page.

| State | CPU | Redraws, FX page | Longest wait, FX page | Longest wait, SRC page |
|---|---|---|---|---|
| 27 modules, stopped | 57 % | 45 | 39 to 41 ms | 68 to 73 ms |
| 27 modules | 79 % | 45 | 41 to 44 ms | 63 to 76 ms |
| with POLY8 | 82 % | 45 | 44 to 51 ms | 68 to 73 ms |
| and Euclid on T1 FX1 | 83 % | 45 | 41 to 51 ms | 71 to 89 ms |
| and Tape Echo on T2 FX2 | 87 % | 43 to 44 | 53 to 74 ms | 68 to 72 ms |
| and Mini Verb on T1 FX2 | 88 % | 43 to 45 | 47 to 83 ms | 68 to 86 ms |
| and Euclid on T3 FX1 | 89 % | 45 | 46 to 64 ms | 89 to 107 ms |
| and Tape Echo on T3 FX2 | 90 % | 39 to 44 | 78 to 183 ms | 141 to 180 ms |
| 29 modules, FM Synth 0.1.2 among them | 93 % | 37 to 42 | 114 to 236 ms | 208 to 242 ms |

The SRC page redraws 41 of 45 detents even stopped. Every row from 87 % was reached by picks made while stopped, or by
an install, with nothing refused.

## Not shown

- Nobody judged the panel by hand at these loads; the owner said it felt sluggish moving parameters once, at a moment
  that was not tied to one of the rows.
- The five base-bound modules were not installed. Ring SC was refused for memory (loader refusal 2), not CPU.
- A pick just under the line, a stock machine at high load and the box over other pages were not tried.
- The log held one `cpu` entry after four refusals; whether that is intended was not looked at.
- Frames ran past their time in every playing row with POLY8 (109 to 115 %); what that costs was not looked at.
