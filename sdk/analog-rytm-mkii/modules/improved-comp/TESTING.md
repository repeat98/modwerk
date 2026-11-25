# Improved Compressor: testing

Version 0.1.0-experimental: THR and MUP read in dB on the COMP page. Run by the author's automated rig on Nathaniel Pavel's (npp1993) Analog Rytm MKII, OS 1.74, from RAM, with the author's go. The images are the author's private combined test set (a development base with a USB test link and the modules the author uses) with this module added; they are not the module's own package. Earlier builds (IC04 to IC36) also drew a gain-reduction meter; it was taken out before release, and what those builds measured about the compressor is kept below.

## The texts on the current source (IC38, image sha256 7a1ae5bb, 25 November 2026)

- Emulator (rytm-emu): the text case passes. THR 96 reads -36dB at RAT MAX and -18dB at RAT 1:2, MUP 32 reads +20.6dB, THR 20 reads -110dB, and in scene mode THR reads as stock (21). The screens were looked at; nothing else on the page differs from stock.
- Unit (image CRC 9312221b, from RAM): the text case passes against the references recorded and looked at on IC37 (CRC 6777a391, the same texts before the review's two guards). THR 96 reads -36dB at RAT MAX and -18dB at RAT 1:2, MUP 32 +20.6dB, THR 20 -110dB; in scene mode THR reads as stock (21). The page shows nothing else of the module.
- The source these runs used is `src/main.c` with SHA-256 `6f415aae173349b12b31db7aa80f9c49b2ebbe6a6bc570b8d210ab9a98b3503e` (the manifest's `evidence.sourceSha256`).
- Host: every THR and RAT setting's number is within half a dB of the line (512 settings).
- Two independent reviews of the label code found no defect. The first noted that THR's line was rounded twice (15 of 512 settings 1 dB off), fixed; the second asked for a limit on the view-stack walk and on the value, both added in this build.

## Edge cases

| Case | Why this change makes it a risk | How run | Result |
| --- | --- | --- | --- |
| THR's lowest and highest numbers | the text grows to six characters (-129dB) and gains a plus above 0 | host: all 512 THR and RAT settings against the line; unit and emulator: THR 20 reads -110dB | pass on the host and for THR 20; not run on the unit: THR 0 and THR 127 |
| Each ratio | THR's number is moved by the ratio's own amount | unit and emulator text case: MAX and 1:2; host: all four | pass for MAX and 1:2; not run on the unit: 1:4 and 1:8 |
| Scene and performance mode | stock hands the text a lock's offset there, not the knob's value | unit and emulator text case in scene mode: THR reads stock's 21 | pass for scene mode; not run: performance mode |
| The page's other six values | the record sits in the table every value text passes through | the unit's and emulator's screens: ATK, REL, RAT, SEQ, MIX and VOL read as stock | pass |
| A value set over MIDI | the text must follow a CC as well as the knob | the text case sets THR, MUP and RAT by CC, then nudges | pass |
| Beside other modules' value texts | the first record to answer wins | unit: the author's combined set (IC38) with Filter Hz, Improved AMP and others; emulator: alone on the plain base (ICS1) | pass |
| A trig held (parameter lock) | the text then shows a lock's value, and RAT is read as it is now | not run | not run: no lock was set in the rig's cases |
| A power cycle | nothing is saved, so there is nothing to lose | not run | not run: the image ran from RAM only |

## THR and MUP in dB (laws measured on the unit, IC04 from RAM, 24 November 2026)

Run by the rig, hands off; MAIN's rms against BD's own output's rms (the USB channels), SEQ OFF.

- **MUP** (BD at LEVEL 30, THR 127, RAT 1:2, MIX 127, VOL 100; 100-200 ms after each hit), MAIN's gain over MUP 0:

  | MUP | 0 | 8 | 16 | 24 | 32 | 40 | 48 | 56 | 64 | 80 | 96 | 127 |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | dB | 0 | 5.2 | 10.4 | 15.6 | 20.6 | 25.5 | 30.1 | 34.2 | 37.8 | 42.4 | 44.2 | 44.7 |

  Straight to MUP 48 (0.645 dB a step, the readout's law); from about MUP 56 MAIN nears -5 dBFS and runs out of room, so above that the readout is the gain asked for, not reached.
- **THR** (RAT MAX, ATK and REL fastest, MUP 0, MIX 127, VOL 100; BD's level stepped by LEVEL and AMP VOL from -24 to -84 dBFS; 10-60 ms after each hit): where the reduction reaches about 0.5 dB:

  | THR | 127 | 112 | 96 | 80 | 64 | 48 |
  | --- | --- | --- | --- | --- | --- | --- |
  | starts at (dBFS) | above -10 | about -21 | about -35 | about -52 | below -84 (2.4 dB there) | below -84 (5.5 dB there) |

  The readout is the line through THR 80-112 (about 0.97 dB a step, THR 96 at -36 dBFS) from THR 80 up. Below THR 80 the unit already compressed at -84 dBFS, the quietest level measured. A run on IC15 (24 November 2026) to go lower gave no usable data: BD's channel read -97 dBFS and MAIN -103 at every level, LEVEL 12 included, which had read -84 the run before, so the BD most likely did not sound (cause not found); those figures are the converters' hiss, which leaves at most about 10 dB below -84 to measure. THR reads the line extended below THR 80 (e.g. -67dB at THR 64).

A gain-staged run on IC16 (24 November 2026, BD's filter reset to LP2 FRQ 127 first; MUP 64 and VOL 127 lift MAIN about 25 dB over the hiss; RAT MAX, SEQ OFF, MIX 127; MAIN's rms over the hit's first 250 ms against THR 127 at the same level):

| THR | reduction at BD -57 | -65 | -72 | -78 | -88 dBFS | on the bus's hiss alone |
| --- | --- | --- | --- | --- | --- | --- |
| 80 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| 64 | 2.4 | 1.4 | 1.0 | 0.9 | 0.8 | 0.8 |
| 48 | 8.0 | 6.4 | 5.8 | 5.6 | 5.5 | about 5 |
| 32 | 14.6 | 13.4 | 13.0 | 12.9 | 12.9 | about 12 |
| 16 | 21.0 | 19.5 | 19.1 | 19.1 | 18.9 | about 18 |

THR 64's reduction rises out of its floor near -66 dBFS, where the extended line reads -67. Below THR 64 the compressor already reduces the bus's own hiss (about -98 dBFS equivalent) by 5 to 18 dB and its reduction grows only about 3 dB over 40 dB of input, so there THR acts more like a fixed cut than a threshold; the line's values there (-83 at 48 and lower) are an extension, likely above the real onset.
- Not measured: other RAT and SEQ settings, which move where reduction is first heard.

## The compressor measured with a sine (flash image FXCJ, no meter running, 25 November 2026)

A 1 kHz sine from another interface, cabled into AUDIO IN and routed into the mix before DIST and COMP (Audio In Routing's STE at 110, DIST AMT 0). The unit's USB stream gives AUDIO IN and MAIN together, so each level is read where it enters and where it leaves. Levels are AUDIO IN's own dBFS, stepped from -84 to -22 dBFS, 0.5 s a level; ATK and REL fastest, SEQ OFF, MUP 0, VOL 100. This measures the compressor itself; the texts' laws are checked against it.

| What | Sine | Measured before on BD hits |
| --- | --- | --- |
| Dry path at MIX 0 over the wet path at MIX 127 | 9.5 dB | 9.8 dB |
| Total level against MIX, 0 to 127 in steps of 4 | smooth | within 0.2 dB at every step |
| MUP | 0.64 dB a step to 48; no more than about +40 dB from 64 | 0.645 dB a step |
| THR, RAT MAX: where reduction reaches 1, 3 and 6 dB | 0.95, 0.96 and 0.93 dB a step | 0.97 dB a step |
| Most loss at THR 0, MIX 127 (the dry path's leak) | 36.4 dB | 36.8 dB |

Reduction against input, THR 70 (dB; the shapes are the same at THR 90, 18 to 19 dB higher):

| AUDIO IN (dBFS) | 1:2 | 1:4 | 1:8 | MAX |
| --- | --- | --- | --- | --- |
| Reaches 1 dB at | -51.0 | -53.7 | -61.4 | under -72 |
| Reaches 3 dB at | -48.8 | -51.3 | -57.8 | -64.2 |
| Reaches 6 dB at | -45.6 | -47.8 | -53.1 | -56.6 |
| Reaches 12 dB at | -39.2 | -40.9 | -44.9 | -45.9 |
| Grows, dB per dB of input | 0.94 | 0.87 | 0.74 | 0.58 |
| At -22.5 dBFS | 25.7 | 26.3 | 27.5 | 24.4 |

- RAT moves where the compressor starts and how hard its knee is more than how far it ends up. MAX starts earliest and softest; 1:2 starts about 16 dB later (at THR 90: 1 dB of reduction at -49.3 for MAX, -41.9 for 1:8, -35.7 for 1:4, -33.2 for 1:2) and then holds the output nearly flat. The THR text follows RAT by these figures (below). Rising and falling staircases of 1.5 s a level read the same, so this is the steady state.
- RAT MAX, 1 dB of reduction: -30.7, -39.9, -49.3 and -59.3 dBFS at THR 110, 100, 90 and 80 (THR 96 at -43.9 dBFS on AUDIO IN's scale, which is not the voice channels' scale the THR text uses).
- Release, 63 % of the way back in dB after a 20 dB drop: 33, 69, 105, 168, 290 and 610 ms for .1, .2, .4, .6, 1 and 2 s. Attack: 6.5, 14 and 24 ms for 3, 10 and 30 ms; the faster options are under what a 1 kHz tone resolves.

Not tested: A1 and A2 release, SEQ's filters, any second unit.

## THR's text follows RAT (IC36, image sha256 8775c774, CRC 46f3e8eb, from RAM, 25 November 2026; a build that still had the meter)

From the sine curves above, where the reduction reaches 0.5 dB (the measure THR's line was drawn with): 1:8 starts 8.3 to 8.5 dB later than MAX, 1:4 15.1 to 15.7 and 1:2 17.6 to 18.4, at THR 110, 90 and 70 (MAX's point at THR 70 taken from its line, as it lies under the quietest level measured). The module adds 8, 15 and 18 dB at 1:8, 1:4 and 1:2 to where THR starts, in the THR text. MAX is unchanged. A positive value reads with a plus (THR 127 at 1:2: +12dB).

- Host: the law gives -18, -21, -28 and -36 dB at THR 96 for 1:2, 1:4, 1:8 and MAX.
- Emulator (rytm-emu): the text case passes with RAT MAX (-36dB at THR 96, as before) and reads -18dB at THR 96 with RAT 1:2.
- An independent review of the change found no defect.

- Unit, the text case: passes; THR 96 reads -36dB at MAX and -18dB at 1:2 (the new reference recorded and looked at).
- Unit, single BD hits by MIDI at THR 100 (its live word read back as 100), MIX 127, MUP 0, SEQ OFF, read by the gain-reduction meter that build still had (measured from MAIN against the voices; highest value over 1.6 s, in dB). THR 100's text reads -32, -24, -17 and -14 dB at MAX, 1:8, 1:4 and 1:2:

  | BD velocity | MAX | 1:8 | 1:4 | 1:2 |
  | --- | --- | --- | --- | --- |
  | 127 | 18.0 | 18.9 | 15.5 | 16.1 |
  | 60 | 12.8 | 12.4 | 9.8 | 8.4 |
  | 25 | 8.0 | 7.3 | 4.1 | 2.4 |
  | 12 | 4.5 | 2.6 | 0.1 | 0.0 |
  | 6 | 0.0 | 0.3 | 0.0 | 0.0 |

  Read against the sine curves, each row's four values stand for one input level to about 1.5 dB (about +1.5, -7, -13.5 and -21 dBFS), so on the drums too the lower ratios start later by about what the text adds.

Not tested: SEQ's filters against these figures, the per-step slope at the lower ratios (0.89 to 0.94 dB a step measured against the text's 0.97: up to about 1.5 dB over 20 steps).

## Not tested

The module's own package from the site (only the author's combined image ran), a second unit, a power cycle (nothing is saved), SEQ's filters, the automatic releases, THR's and MUP's texts with locks, an LFO or a performance on them (stock's in scene and performance mode, by design), the texts beside other modules that change the COMP page.
