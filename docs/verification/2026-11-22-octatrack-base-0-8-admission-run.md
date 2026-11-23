# Octatrack base 0.8: frame admission, stock reserve and the late-entry stall (22 November 2026)

The owner's MKII, OS 1.40C, CF card in, project Dev17, bank C, Part 1 (Filter and Delay on every track, the working copy
equal to the saved one before and after each run). Development twins of `base/octatrack-next` with the frame admission
(`fix/octatrack-frame-admission`), last `dce1d30e` (twin 10, with the late-entry counters of `3eda58cde`). USB Audio linked
in as `USB AUDIO OUT MAIN`. Everything ran in RAM as rolled-back trials; nothing was kept, the flashed base and its kept set
were left alone. Figures are the guard's longest frame interrupt in percent of a frame (363 µs at 44.1 kHz), its skipped
renders, the CPU meter, and the refusals the unit showed.

## Stock alone (no modules)

| Scene | Longest frame |
|---|---:|
| C02, empty pattern (the owner's "empty session": default bank, Filter and Delay on every track) | 35.9 % |
| C03, T1–T4 playing samples on steps 1/5/9/13 (medium) | 74.6 % |
| C01, all eight tracks on steps 1/5/9/13, delays quiet | 98.7 % |
| C01, all eight delays awake | 105.6 % |
| C01, plus three LFOs on every track | 110.6 % |
| C01, plus six p-locks a track | 112.8 % |

None of these skipped a render, and knob-to-screen latency stayed at or under 60 ms. A sample track adds about 7.2 points.

## Where renders drop

Of 32 readings from 95 to 125 % none skipped a render; half of those from 125 to 130 % did. Machines that render on the
ColdFire skip earlier: SYNTIZ at 120.1 % (8 skips), Amiga at 120.4 % (1), FM Synth at 124 % (7). POLY8 past the line
(141.6 %) shed only its own track, 7,609 renders, with the UI responsive. Heavier overload during a curve run hung the unit
(no record; POLY8 is left out of the curves).

## Instance curves

Each module on 1, 2, 3… empty tracks (T1, T3, T6, T7), picked on C02, the longest frame's gain over the module installed
and resting (`npm run device:price -- --curve`). `first` is one alone with its wake, `each` every further one. Read first on
the busy C01, then on C04 (trigs on T1–T4, T6, T7; T2 and T4 play samples; 79.4 % with stock alone), stopping at 115 %.
The table carries the C04 figures: near the line the guard caps the longest frame, so C01 read some modules low.

| Module | C01 first / each | C04 gains | C04 first / each |
|---|---|---|---|
| Tape Echo 0.1.6 | 12.4 / 3.5 | +9.9 +13.5 +16.9 +20.8 | 9.9 / 3.9 |
| Tape Echo 0.1.8 (draft) | | +9.4 +13.7 +18.3 +21.6 | 9.4 / 4.6 |
| Euclid 0.1.5 | 2.9 / 1.3 | +3.7 +3.9 +6.4 +6.7 | 3.7 / 2.5 |
| Mini Verb, E-Verb, Air Chorus, Vibrato | 0.5, 0.3, 0, 0 / 0 | within ±2.7 | 1.5, 0.7, 1.3, 0 / 0, 0.2, 1.3, 0 |
| FM Synth 0.1.4 (+20.3 at rest on C04) | 4.9 / 2.5 | +6.7 +9.5 +10.1 +13.1 | 6.7 / 3 |
| FM Synth 0.1.5 (draft, +1 at rest) | | +26.9 +31.8 +32.3 +31.1 | 31.3 / 0.5 |
| SYNTIZ 0.1.0 | 19.1 / 4.8 | +19.5 +28.9 +32.9 +33.6 | 24.9 / 4 |
| SYNTIZ 0.1.1 (draft) | | +13.1 +20.8 +26.2 +25.4 | 15.4 / 5.4 |
| Amiga 0.3.0 | 24.5 / 4.9 | +24.5 +30.6 +34.6 (3 skips at 115.5 %) | 26.6 / 4 |
| Amiga 0.3.1 (draft) | | +20.8 +25.8 +29.5 | 22.1 / 3.7 |
| Analog BD | 25.8 / 5.8 | +20.7 +32.6 +40.8 (122 %, no skip) | 24.4 / 8.2 |

Installed and unused, FM Synth 0.1.4 adds 6.1 points on C01, 16.8 on C03 and 20.3 on C04 (0.1.5 about 0), Euclid 2.
Six Tape Echos fit on C02 at 72.7 %; on C01 seven read 89 / 98.2 / 105.7 / 105.8 / 109.5 / 111.9 / 114.5 % with no skip.

## The late-entry stall

A pattern change from C02 to C01 while playing, with Tape Echo ×2, Euclid, Mini Verb, Air Chorus, E-Verb, Vibrato and FM
Synth placed, stopped the DSP frame exchange for good (stall records 49 on twin 9 and 50 on twin 10; only a power cycle
clears it). Both records show one long frame interrupt (477–498 µs), then an entry 147–162 µs late, then no frames. With
the late-entry wait off, twin 10 stalled on the first try. Steady play under the 120 % line cannot produce such an entry
(436 µs at most, so at most about 73 µs late); the pattern change's spike can. After a RAM boot the counters showed 165
entries in the 110–190 µs window within 12 s, with nothing playing and no stall; at rest afterwards, none.

## Sessions: refusals at a stock reserve

Eleven picks in a fixed order, each made stopped and followed by 2.5 s of play: Tape Echo T1 FX2, Euclid T2 FX1, Mini Verb
T3 FX2, Air Chorus T4 FX2, E-Verb T5 FX2, Vibrato T6 FX1, Amiga T7, FM Synth T8, a second Tape Echo T8 FX2, SYNTIZ T3,
Analog BD T6. The line stayed at 120 %; the reserve changed. Every refusal showed the CPU FULL window.

| Set, reserve | Empty C02 admitted | Medium C03 admitted | C03 with them, 30 s |
|---|---:|---:|---|
| FM Synth 0.1.4, 92 | 8 | 4 | 111.3 %, no skip |
| FM Synth 0.1.4, 88 | 9 | 5–6 | 107–112 %, no skip |
| FM Synth 0.1.4, 85 | 8 | 6 | 112.2 %, no skip |
| FM Synth 0.1.5, 88 | 9 | 8 | 115.2 %, 16 renders dropped |
| FM Synth 0.1.5, 92 | 8 | 8 | 116.7 %, 12 renders dropped |
| FM Synth 0.1.5, medium-pattern table, 88 (line 120) | 7 | 7 | 101.3 %, none dropped |

On the empty pattern every result is what the table predicts: the reserve term decides, and what is refused is the second
or third heavy machine, or Amiga after six effects. The medium pattern refused more for three reasons:

- **FM Synth 0.1.4 at rest.** Installed and used nowhere it adds 16.8 points to C03's longest frame (75.0 to 91.8 %);
  0.1.5 adds nothing (74.7 %). On C01 the same cost read 6.1, hidden between the stock peaks.
- **Quiet delays counted twice.** The kept figure added the sleeping delays (7.2 points on C03) although the reserve
  already holds them. Removed in the admission after this run.
- **The kept figure is the longest of eight readings,** 87.6 to 96.8 % on one steady pattern.

With FM Synth 0.1.5 the medium pattern admitted as much as the empty one, but played past the guard: FM Synth 0.1.5 in
use costs C03 +17.3 on an untrigged track and +22.4 on a trigged one (C02: +13.6), while the table still carried 0.1.4's
price. With the medium-pattern table (FM Synth 0.1.5 at 31.3) the same picks played at about 101 % with nothing dropped;
what it refused was each machine after six effects, the reserve's arithmetic (88 + 17.1 booked + the machine's 15 to 24).

The table these figures settle: reserve 88 (85 admits a seventh Tape Echo on an empty Part, 92 refuses Amiga, Tape Echo
and Mini Verb together), a sample track's share 7, line 120 (module-heavy Parts dropped renders from about 114 %, none
from 100 to 113 %; stock-heavy ones none to 125 %). A run at reserve 83 and line 115 was meant to compare, but its install
was refused (below) and it re-ran 88/120.

C01 with all eight tracks playing refused all eleven picks: it played at 117.8 % with the set installed, and the
window filled the MODS bar with the stock load above the reserve (changed after this run to show only the modules'
share and "PART IS BUSY").

A pick made stopped after a short play is judged against the kept figure plus every pick since it was taken, until four
seconds of play renew it. Euclid after Tape Echo on C03 was refused in four of six tries: played 96.8 + quiet delays 7.2
+ Tape Echo 12.4 left it a few tenths short.

The late-entry wait was on through all of these: no entry fell in the window and none waited. Three plain STARTs on each
of C02, C04 and C01 (stock only) entered at most 7.5 µs late.

Six everyday sets at reserve 88, line 120, each from a clean Part, picks made stopped (admitted / tried, then 15 s of play):

| Set | Empty C02 | Medium C03 |
|---|---|---|
| Amiga, Tape Echo, Mini Verb | 3/3 | 2/3 (Tape Echo) |
| FM Synth 0.1.5, Euclid, Tape Echo, E-Verb | 3/4 (Tape Echo) | 2/4 (Euclid, Tape Echo) |
| Amiga ×2, Air Chorus, Tape Echo | 4/4 | 3/4 (Tape Echo); 114.0 %, 7 renders dropped |
| Tape Echo ×7 | 6/7 | 6/7, 106.8 % |
| SYNTIZ, Amiga, Tape Echo | 2/3 (Amiga) | 1/3 (SYNTIZ, Amiga) |
| FM Synth 0.1.5 ×3, Tape Echo, Mini Verb | 4/5 (Tape Echo) | 3/5 (Tape Echo, Mini Verb) |

The empty column is what the table predicts. The medium refusals of Euclid, Tape Echo and the first SYNTIZ came from the
quiet-delay charge (7.2 on C03) and a kept figure read right after a reload (84 against 79.9 steady); without the charge,
as 0.8 now judges, the model admits Tape Echo after Amiga, Euclid after FM Synth and SYNTIZ first. Not yet run on a unit.

**A rollback the base would not finish.** After the reserve-88 session, its trial's rollback was refused
"needs-recovery", and so was every `recover` for the next hour: the loader's restore kept failing while its journal read
idle. The unit played, picks worked and nothing stalled; new sets could not be installed. A USB replug or a restart ends it.

## The refusal window

"CPU FULL · TAPE ECHO NEEDS +12% · MODS [bar] 28% · CPU NOW 44%". The MODS figure is the modules' allowance (line less
reserve), CPU NOW the meter. The bar was filled with the judged load above the reserve, so on C01 with no module in use it
showed almost full: the busy stock pattern, not modules, took the room. Changed after this run: the bar holds the
modules' share only, and "PART IS BUSY" replaces CPU NOW when the Part's own load is the reason (not yet seen on a unit).

## The evening and night: twins 23 to 32

Same unit and project. Picks on empty C02 and medium C03 (six everyday sets, 26 picks a pattern, each pick made stopped
after 5 s of play, 2.5 s of play after each, then 15 s), FM Synth 0.1.5 charged its own curve (31.3 / 0.5, rest 0).
Nothing was kept; every twin after 27 was booted from the running one without a power cycle.

| Twin | What changed | Empty C02 | Medium C03 | Dropped |
|---|---|---|---|---|
| 23 | reserve from the bank's busiest pattern, rest of installed modules | 0/26 | 0/26 | 0 |
| 24 | reserve from the playing pattern (owner), near-free picks; line still 120 | 26/26 | about 20/26 | 37,312, 1 and 5 in three sets |
| 25 | line 110 (owner), late window from 80 µs | 26/26 | 12/26 | 0 |
| 27 | machines hushed on a pattern predicted past 122 %, 7 netted on the measured side | 26/26 | 14/26 | 14 |
| 28 | 2.5 netted on the measured side | 26/26 | 13/26 | 0 |
| 29 | a played pattern's measured stock + 8 when under the ladder | 26/26 | 16/26 | 13 |
| 30 | a further machine instance charged whole on the reserve | 26/26 | 16/26 | 16 |
| 31 | 2.5 netted on a measured stock; what played since a pick counts | 26/26 | 14/26 | 0 |
| 32 | margin 4 on a measured stock; a further machine pays its trig starts | 26/26 | 6/26 | 0 |
| 33 | readings since a pick restart when modules move; a set change starts afresh | 26/26 | 18/26 | 0 |

Twin 23 judged every pattern by the bank's busiest (C01, eight stacked) plus FM Synth 0.1.4's 20.3 at rest: over the line
before any pick. Every drop after it came from the set with two Amigas on trigging tracks (a second Amiga adds 4.3 to 7.4,
`each` is 4). Twin 32's medium refusals depend on the sets before them (a first Tape Echo refused at 77 % in the set run,
admitted alone): the readings since a pick survived a rollback and a reload, fixed in twin 33. Twin 28's first empty-pattern sets are invalid: C02 still held the trigs VECTOR's
curve had written (60 % instead of 38 % with stock alone); `device:price` now stops when a module leaves trigs.
Twin 33's remaining medium refusals sit within a point or two of the line and go either way between sets (Amiga on T1
refused in set 1, admitted in set 3; FM Synth on T3 refused in set 2, admitted in set 6): expected scatter in the
readings at the line, not a fault.

**The overload scene** (set L on empty C02, then the stacked C01 played; stall 56 on twin 24): twin 24 stalled once,
with an entry the base read under 110 µs late. Twin 25 (window from 80 µs), three takes: no stall, 4,368 to 4,501
renders dropped, 9 to 12 entries held, 5 to 8 full-scale clicks in 15 s. Twin 27 (machines hushed), three takes: no
stall, 0 dropped, 5 to 10 entries held and as many clicks (peak 0.79); with the machines silent, stock C01 and the
effects alone play at 127 %, most of it Tape Echo's work in the delay routine.

**Curves** (C04, picks on C02, limit 112): BBD 0.7 / 0.4, Lo-Fi 1 / 0, Ring SC 0.8 / 0, Tape Head 0 / 0, VECTOR 0.2 / 0
(it writes trigs; stock plays them), Grain 33.9 (one instance fits). Tape Echo 0.1.9 (deadline and rest; draft, local)
10.7 / 4.2 against 0.1.6's 13.6 / 4.0 in the same run.

## Not tested

The late-entry wait switched on under the stalling pattern change, the brake under overload, the line above 120 % with the
backlog readings, the admission without the quiet-delay charge on a unit, listening by a person, a Keep and a power cycle. Three RAM boots did not come back on USB (issue #1985); once the unit also left USB on the flashed base with
no boot, and a hub replug was part of the recovery.
