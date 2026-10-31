# BBD Delay

Version: 0.1.2-experimental · author: @JamCones (Cam Jones)

A bucket-brigade delay for FX2: a compander, clock-tracking anti-alias and
reconstruction filters at a third of the clock, a clocked bucket line with a
charge-transfer curve and bucket noise, a resonant feedback tilt and an input
high-pass.

## Overview

The mono sum of the track goes into a model of a BBD delay chip:

1. **Input and compressor.** HPF high-passes the input if it is on. A tanh shapes the input (FDBK's returning wet
   is added first), then a feedback compressor divides it by a 10 ms
   average of its own output: 2:1, as in the compander chips BBD delays use.
2. **Anti-alias filter.** An 8th-order Butterworth low-pass at a third of the
   clock rate. The cutoff moves with TIME: 6.8 kHz at the fastest clock,
   1.7 kHz at the slowest.
3. **The bucket line.** A clock between 20.5 and 5.1 kHz shifts the line.
   On each tick the input sampled at the clock edge goes in. The bucket that
   went in 1,023 or 4,095 ticks earlier (STGS) comes out through a
   charge-transfer curve, with a little white noise, and is held until the
   next tick.
4. **Reconstruction.** A 7th- and a 2nd-order Butterworth low-pass at the
   same cutoff smooth the held staircase, a 10 Hz high-pass removes the
   buckets' DC, and the expander undoes the compressor.

TIME changes the clock and glides it over 20 ms: moving TIME bends the pitch
of everything in the line. Long delays are darker and grainier because the
clock is slower. The dry signal is never processed: MIX 0 is the exact input.

## Controls

| Page | Knob | Range (default) | What it does |
| --- | --- | --- | --- |
| FX2 main, A | TIME | 0–127 (64) | The clock, 20.5 kHz at 0 to 5.1 kHz at 127, linear in delay time. The delay is 50–200 ms with STGS 1024 and 200–800 ms with 4096. |
| FX2 main, B | FDBK | 0–127 (0) | The wet returned to the input through TONE. With TONE centred, the repeats ring longer up to 127, where they fade about 1 dB a second, but never self-oscillate. With TONE at either end, the loop rings on from about FDBK 40; LIM sets how loud it then gets. |
| FX2 main, C | FRZ | 0–127 (0) | Freeze. Rising from 0, the input fades out of the bucket line and FDBK is taken towards sustain (the most the loop holds without growing, for the current TONE), so the trails get longer; it never lowers FDBK, so a loop already ringing keeps its level. At 127 the line loops its own contents exactly and ignores the input and FDBK: an endless loop at the level it had, still played through the BBD's output stages. A crossfade of any speed into 127 keeps that level. TIME changes the frozen loop's speed and pitch. A STGS change clears it. Made for a scene on the crossfader. |
| FX2 main, D | TONE | −64–+63 (0) | The feedback tilt, ±9 dB at the ends. Right: treble up and bass down about a 200 Hz pivot. Left: a bandpass peak at FREQ, Q 1.5. It acts only inside the feedback loop. A boosted TONE multiplies the loop gain, so the loop rings at lower FDBK. |
| FX2 main, E | FREQ | 0–127 (64) | The centre of TONE's bandpass, 400 Hz at 0 to 2 kHz at 127, logarithmic. 64 is about 900 Hz. It is heard only with TONE left of centre. |
| FX2 main, F | MIX | 0–127 (40) | 0 is exactly dry. Up to 64 the wet rises to unity on top of the whole dry signal; from 64 to 127 the dry fades out, leaving the wet alone at 127. Smoothed per sample. Where dry and wet together pass full scale, the sum saturates at full scale. |
| FX2 SETUP, A | STGS | 1024 / 4096 (1024) | Bucket count, so the delay range. Changing it fades the wet out over 16 blocks, clears the line (about 6 ms, dry) and fades back in. It is set per Part; the OS does not lock, modulate or scene SETUP knobs. |
| FX2 SETUP, C | LIM | 0–127 (127) | The feedback governor; higher is stronger, 0 is off, and the default is the strongest. When the wet's envelope passes 2^(−3.5·LIM/127), FDBK is scaled by the square of how far over it is, so a self-oscillating loop settles at a set level instead of climbing to full scale, smoothly and without clipping. Each step is about the same number of dB. At 127, full-push oscillation sits about 30 dB under LIM 0 (−33 dBFS RMS); turning LIM down lets the loop grow louder. Strong settings also ease loud repeats with high FDBK, keeping the trails from escalating. Like STGS it is set per Part. |
| FX2 SETUP, E | HPF | 0–127 (0) | 0 is off and costs nothing. Otherwise a 12 dB/octave Butterworth high-pass on the signal entering the bucket line, 20 Hz at 1 to 400 Hz at 127, logarithmic (64 is about 90 Hz), so low end never builds up in the trails. The dry signal is untouched. |

FDBK, TONE, FREQ and HPF glide over about 6 ms (one step a 16-frame block,
then smoothed). MIX glides per sample, and TIME glides with the clock.

**STOP, STOP, STOP cuts BBD's tail**, as it cuts the stock reverbs'. Stock's
tail kill is a ColdFire pass (`0x40004d0c`) that zeroes the reverbs' hidden
SETUP slot 11 while a track is held; it tests their FX ids only. BBD reads its
own slot 11 the same way (127 normally; 0 makes it output the input exactly and
clear its line and state), and `stopkill.s` zeroes it when the held track's FX2
is BBD: a hook at the stock pass on card builds, the base's `ev_tail_kill` event
over USB (`runtime.json`).

## Usage

Put it on a track that plays something with transients or a melody, then:

- **Chorus and slapback:** STGS 1024, TIME 0–40, MIX 30–64, FDBK 0.
- **Classic analogue echo:** STGS 4096, TIME 60–90, FDBK 60–80, TONE slightly
  left. Each repeat comes back darker and noisier.
- **Self-oscillating drone:** FDBK 45 or more, TONE fully left or right, then
  turn TIME or FREQ. The clock glide sweeps the pitch of the whole loop, as on a BBD pedal.
- Parameter locks, LFOs and scenes on TIME give pitch-bending repeats.
- **Trail looping:** put FRZ 127 in a scene and the crossfader catches whatever
  is in the line and loops it; partway along, the trails just get longer.
- **Lean trails:** HPF keeps the low end out of the repeats: around 40 for a
  gentle cut, 100 or more for thin, telephone-like trails.

## Quick tutorial

1. Select an audio track, hold FUNC and press FX2, turn LEVEL to BBD DELAY at the end of the effect list and press YES. Turn encoder A (STGS) to 4096.
2. Press FX2 for the main page. Turn encoder F (MIX) to 48 and encoder B (FDBK) to 70, play a sample and turn encoder A (TIME): repeats between 200 and 800 ms, darker the longer they get. Turn encoder D (TONE) left and sweep encoder E (FREQ) for resonant repeats; turn encoder C (FRZ) to 127 to loop the line.
3. Turn FDBK back to 0 and MIX to 0 to hear the exact dry signal, or set FX2 back to DELAY or NONE in FX2 SETUP to remove the effect.

## Compatibility and limitations

Not offered beside Sidechain Compressor. BBD declares its whole 16K FX2 slot. On T3 and T7 the last 514 words of that slot are Sidechain Compressor's cross-core key window. BBD's measured writes end well before the window, so a BBD version that declares its real extent can drop this. Flag added by the owner, repeat98.

- Octatrack OS 1.40C, FX2 only: the line needs the 16,384-word delay buffer
  the OS gives every FX2 instance. An FX1 slot (3,072 words) is too small.
- With the stock DSP code built in, BBD's 1,112 words take the space of SPRING
  REV and PLATE REV, which leave the FX2 chooser. SPRING REV alone would hold
  BBD, but DARK REV calls a 35-word routine inside SPRING REV's code, so BBD is
  placed from PLATE REV's start, clear of it; DARK REV stays and renders
  bit-identically to stock (a render gate). A saved project that used SPRING
  REV or PLATE REV on FX2 plays that slot dry. Every other stock effect stays.
  Other modules in the same build can change which effects are given up.
- **Free-running time.** TIME is a clock rate, as on a BBD pedal. The DSP side
  has no tempo word, so it does not follow the pattern tempo, track speed or
  swing (docs/module-guides/sequencing.md). Lock TIME per step to place
  repeats by ear.
- **Mono.** The two channels are summed into one bucket line and the wet is
  the same on both sides; the dry stays stereo.
- **Aliasing is part of the sound.** A bucket brigade is a sampler clocked
  below the audio rate, and the charge-transfer curve bends the samples it
  holds. `fx:audit` measures non-harmonic energy of −44 dBc for a 1.1 kHz
  tone at the fastest clock and −37 dBc at the slowest. Tones above the
  clock-third cutoff are removed.
- **Bucket noise.** White noise is added to every bucket, and the expander
  hides it under signal. About 0.2 s after a reset (project load or a STGS
  change) it leaves at most 2 LSB (−132 dBFS) on silence.
- **Headroom.** The wet passes a soft output stage: linear to half scale, then
  rounding to exactly full scale. Heavy feedback and a boosted TONE can push
  the wet there; LIM keeps self-oscillation well below it by default.
- **Cost.** Up to 400 executed instructions per sample with trig splits (363
  unsplit): dearer than every stock DSP effect (SPRING REV 314, CHORUS 293,
  DJ EQ 331 under the same cases). Four per core fit the static budget
  (4 × 378 of 3,120 cycles). Real-chip headroom is not measured.
- **Over USB** it needs the Modwerk beta base with the `ev_tail_kill` event
  (`ba89721d…` or later) and keeps its card effect id, 14: a module set where
  another module holds id 14 refuses it.
- **Older projects.** A project saved with a private BBD build that had no
  hidden slot 11 holds 0 there, which BBD reads as the kill: BBD plays dry in
  it until it is chosen again from the FX2 chooser, which loads its defaults.

### Design notes

`bbd.asm` is proven against a float model of the same chain (`bbd_ref.py`).

- One output tap, `stages − 1` ticks along the line.
- The input tanh is a Padé approximant, x(27 + x²)/(27 + 9x²) up to |x| = 3,
  folded into the compressor's divide. It is within 2 % of tanh up to about
  1.5 and exactly ±1 from 3.
- The 8th- and 7th-order filters run as cascaded biquads with 24-bit state.
  At the slowest clock, state noise sits about 56 dB under the signal.
- One of the nine filter sections follows the clock each 16-frame call, so
  all nine refresh in 144 samples. After a reset all nine are computed at once,
  in the clear call before it (dry, with no sample loop), for TIME's clock then;
  the first call that plays audio updates only the last one, so the rotation
  goes on from the first. 0.1.0 built them in that first call, which a trig
  split could pair with a second full call in one block (439 instructions per
  sample, now 400). The output is the same unless TIME moves across the reset,
  when the sections start one block behind and catch up within nine calls.
- The feedback tilt uses a 200 Hz split with cubic gain fits (±9 dB) and a
  unity-peak bandpass whose coefficients are polynomial fits over FREQ
  (within 6e-5 of the exact design). ±9 dB is deliberate: at ±15 dB a full
  TONE made the loop self-oscillate from about FDBK 25.
- TIME's clock constants (`P16_A`, `P16_B` = `0x113a00`, `0x34162c`) are exact
  Q23 words shared by `bbd.asm` and `bbd_ref.py`, so both tick on the same
  samples. Keep them exact: a rounded constant once put 8 % of ticks a sample
  late, a −16 dB residual against the model at TIME 0.
- LIM scales the loop by (threshold/envelope)², read from the expander's
  envelope once a call.
- FRZ below 127 works through the feedback loop: the input into the line is
  scaled by 1 − h and FDBK becomes FDBK + h·max(0, S − FDBK), h = FRZ/128,
  with S = (127/128) / TONE's peak gain, so the trails sustain without tipping
  into oscillation. At 127 the line loops its own buckets, so a frozen loop
  keeps the BBD's noise, filtering and curve on the way out without
  accumulating them. (Mixing old and new buckets instead combs a ringing loop
  down by 6–11 dB on a slow crossfade.)
- HPF's K is 2 tan(π 400/sr) · 2^−e / 2 through LIM's 2^−f fit, gliding 1/16
  a call; its section reuses the clock filters' Butterworth routine (the same
  poles) with a high-pass numerator, rebuilt each call while HPF is on. It
  feeds its truncation back into the next sample: at 20 Hz its poles sit so
  close to DC that plain rounding noise rises about 40 dB (−42.6 dB against
  the model without the feedback, −67.8 dB with it).
- Hidden slot 11 (127; 0 cuts to dry and clears) is the stop kill's input,
  written by `stopkill.s`; the `kill` gates render it.

## Tests and measurements

[TESTING.md](TESTING.md) has every command and result:

- **Render gates** (`verify.py` on a private native image): exact dry,
  reference match across every control, splits, stage changes, the stop-kill input,
  freeze, idle tails, eight-instance isolation, garbage start and zipper.
- **The audit**: the `fx:audit` tables.
- **Performance**: the benchmark and stress records.

Hardware: the author played the release image (BBDMW2, MAIN `bc53d1b3…`, the
site's own build) on an Octatrack MKII for about ten minutes. DARK REV still
works on FX2; two instances ran at once on T1 and T5 (one per DSP core); HPF
and STGS work; a Part reload, a project save and reload and a power cycle all
restore the saved settings; every main-page and SETUP parameter was played,
with LFOs and trigless locks. That was 0.1.0; 0.1.1's hardware results are in TESTING.md.
Earlier private images (BBD01–BBD14) are in `evidence/author-hardware.md`:
early ones crackled on T1 and lost tracks 1–4 after STGS changes, caused by
`rep` divides holding interrupts off (`REP_DIVIDES.md`); every `rep` is now a
`do` loop.

## Authorship and licences

Cam Jones (JamCones): the design and the DSP56300 code, the float reference
and the gates, under the MIT licence (see [LICENSE](LICENSE)); the LCD
screenshots are covered by [media/LICENSE.md](media/LICENSE.md). Built with Sam Banks's octabam
builder and harness. The charge-transfer curve follows Raffel's BBD paper
(CCRMA, 2010); the noise generator is the Numerical Recipes LCG, as in Analog
BD. No Elektron firmware, extracted routines or tables.

## Screens and audio

Real LCD captures from the headless emulator on the site's own build of BBD
beside the stock effects (MAIN `bc53d1b3…`; provenance in `media/capture.json`):

![FX2 SETUP with BBD DELAY selected: STGS and LIM above, HPF below](media/ot-setup.png)

Hold FUNC and press FX2, turn LEVEL to BBD DELAY and press YES. STGS sets the
bucket count, LIM governs self-oscillation and HPF cuts bass into the line.

![The main page at the defaults: TIME, FDBK and FRZ above TONE, FREQ and MIX](media/ot-main.png)

Press FX2 for the main page.

![FDBK at 70, TONE at -24 towards the bandpass peak, FREQ at 44](media/ot-feedback.png)

FDBK 70 gives repeating echoes; TONE left with FREQ places a resonant peak.
Turn FDBK and MIX back to 0 for the exact dry signal.

No audio examples yet.
