# DROPOUT

Version: 0.1.0-experimental · author: @semierendonmez-commits · draft, not yet run on a unit

## Overview

DROPOUT sends the track through a failing codec and a failing link, on the project's tempo: the cheap part of FRAMELOSS, small enough for the Octatrack's DSP.

- **BITS** codes the track with ADPCM at 5, 4, 3 or 2 bits a sample (G.726's 40, 32, 24 and 16 kbit/s depths): a grainy, hissing, smeared copy that gets coarser as the bits fall.
- **Errors** arrive at random, **RATE** of them a step on average, each of **MODE**'s kind for **SIZE**:
  - **HOLD**: the last good sample held for 4 to 512 samples, as a digital link (ADAT, MADI) does when it loses its frames.
  - **PCKT**: a packet of 64, 128 or 256 samples lost, and the packet before it played again in its place, fading to nothing: a stream's packet-loss concealment.
  - **CIRC**: 1 to 8 bad samples concealed, as a CD player does; from SIZE 64 a long burst of 16 to 1,024 samples is muted instead. A CD player interpolates between the good samples either side; the DSP cannot look ahead, so DROPOUT continues the track's last slope across the bad ones.
- **FRZ** freezes whole steps: at FRZ's chance a step plays its first **FRM** samples (1.5 to 23 ms) and then loops them to the end of the step, like a decoder repeating its last frame. At 127 every step freezes.
- **STEP** is the step RATE and FRZ count in: 1/32, 1/16, 1/8 or 1/4 note at the project's tempo.
- **MIX** blends the result over the dry.

The defaults are a passthrough: with RATE 0, BITS off and FRZ 0 the output is the input bit for bit, and MIX 0 returns the dry bit for bit whatever the other knobs say. GSM, MP3 and ATRAC, which FRAMELOSS also has, are too heavy for the DSP and stay out.

Signal path: `x → c = ADPCM(x) → e = c or an error (HOLD, PCKT, CIRC) → f = e or the frozen frame → out = x + MIX·(f − x)`, per channel.

## Controls

Main page (FX1 or FX2). Every knob here takes the LFOs and the scenes; RATE, FRZ and MIX follow an LFO smoothly, the others step.

| Knob | Default | Range | What it does |
| --- | --- | --- | --- |
| RATE | 0 | 0-127 | Error events a step, on average: none at 0, one in 16 steps at 1, 16 a step at 127. |
| SIZE | 7 | 0-127 | An error's length. HOLD: 4 to 512 samples (32 at 7, FRAMELOSS's). PCKT: 64 (0-42), 128 (43-85) or 256 (86-127). CIRC: 1 to 8 concealed (0-63), 16 to 1,024 muted (64-127). |
| BITS | 0 | 0-127 | The ADPCM codec: off (0-25), 5 bits (26-51), 4 (52-76), 3 (77-102), 2 (103-127). |
| FRZ | 0 | 0-127 | The chance a step freezes on its first frame; 127 = every step. |
| FRM | 40 | 0-127 | The frozen frame: 64 to 1,016 samples (1.5 to 23 ms). |
| MIX | 127 | 0-127 | The failures over the dry; 0 = the dry, bit for bit. |

SETUP page (hold FUNC and press FX1 or FX2):

| Knob | Default | Range | What it does |
| --- | --- | --- | --- |
| MODE | HOLD | HOLD, PCKT, CIRC | The kind of error: a held sample, a lost packet replayed, CD concealment. |
| STEP | 1/16 | 1/32, 1/16, 1/8, 1/4 | The step RATE and FRZ count in, at the project's tempo. |

## Usage

On a break, PCKT with RATE around 60 and SIZE at 256 replays and fades scraps of the last hit, like a stream on a bad connection; FRZ 40 with STEP 1/16 and a short FRM stutters random steps on the grid. BITS at 3 or 2 gives a vocal or a pad the grit of a voice line. An LFO on RATE or a scene that turns FRZ to 127 makes the link fail on cue.

## Quick tutorial

1. On an audio track that plays a sample, hold FUNC and press FX1, turn LEVEL to DROPOUT and press YES. Press FX1 for the main page: at the defaults the track plays exactly as before.
2. Turn RATE to 70: the track drops a few samples now and then, held flat (MODE HOLD). Turn SIZE up for longer holds. Hold FUNC and press FX1, turn MODE to PCKT: each error now replays the scrap before it, fading.
3. Turn BITS to 90 (3 bits) for the codec's grit, then FRZ to 127: every 1/16 step now plays its first FRM samples and loops them. Turn RATE, BITS and FRZ to 0, or MIX to 0, and the track is untouched again. To remove the effect, choose NONE in FX1 SETUP.

## Compatibility and limitations

- **Needs the Modwerk base loaded over USB (beta)** with an effect id of its own. The card builds' thirteen non-stock ids are all claimed but 0x07, which this draft holds as a placeholder in `manifest.py`.
- **Tempo, not the sequencer's grid.** The step's length comes from stock's tempo word (tempo24, record halfword 31, read as octabam's BusDelay reads it), so RATE and FRZ follow tempo changes. A DSP insert sees no step phase, transport, swing or track speed: the step clock starts when the effect is chosen and runs free, so a frozen step is a step long but need not start on the sequencer's step. **On FX1 the tempo word's place is derived, not measured.** An FX2 instance finds it at r6+$13 (BusDelay, on units). An FX1 instance's parameter pointer sits six words lower in the same record (octabam's measurement of the page-2 bytes), so DROPOUT tells the two apart from its buffer's base when it is chosen and reads r6+$19 on FX1; on FX1 r6+$13 holds FX2's page-2 knobs. A word outside 30-300 BPM counts steps at 120 BPM.
- **Random.** Which steps freeze and where errors fall come from a noise generator that starts from the same seed whenever the effect is loaded.
- **Buffer.** 3,072 words of the slot's buffer (`Claims(buffer_words=3072)`), which an FX1 slot holds: a ring of the last 512 coded frames for PCKT, cleared over the first 8 calls (128 frames, about 3 ms, during which the dry passes untouched), and the frozen frame, which is always recorded before it is played. Nothing left in the buffer by another effect is heard.
- **Deliberate glitches.** HOLD and PCKT end with a step back to the track, a frozen frame jumps at its seam, a muted CIRC burst cuts hard, and the codec aliases and, near full scale, limits (fx:audit in TESTING.md). There are no fades but PCKT's own.
- **MIX 127** leaves the dry at 2^-23 (about 1 LSB) under the failures.
- **Not yet run on a unit, under the ColdFire port or in a built image.** The DSP code has run only in fxhost, the vendored DSP56300 emulator with the module alone (TESTING.md).

## Tests and measurements

See [TESTING.md](TESTING.md). `python3 -B sdk/drafts/dropout/verify.py` runs 26 gates on the vendored DSP56300 emulator: bit-exact passthrough at the defaults and at MIX 0 from garbage state and buffer and with trig splits; HOLD's, PCKT's and CIRC's signatures against their arithmetic; the ADPCM's signal-to-noise ratio at each depth; the step's length at 120, 96.5 and 174 BPM on FX1's and FX2's record and with tempo words of 0, 20 and 400 BPM; FRZ's chance; RATE against the tempo; a garbage buffer never heard; idle to digital silence in every mode; a memory guard on every run; the cost. 617 program words, a 323-word table, 59 state words and a 3,072-word buffer; 274 executed instructions a frame at the dearest settings, against the 314 octabam's benchmark gives stock SPRING REV.

## Authorship and licences

Design, DSP56300 code and tables by Semi Erendönmez, GPL-3.0-or-later ([LICENSE](LICENSE)), after his FRAMELOSS plugin's error modes. The ADPCM coder is a copy of the one in his CODEC ECHO draft (IMA's step progression, G.726's bit depths, written anew). The effect ABI, schema, harness conventions and the tempo idiom are octabam's (Sam Banks, MIT); the noise generator uses the doubled-product LCG idiom of Analog BD's DSP code. No Elektron firmware, extracted routines, tables or samples.

## Screens and audio

Not captured yet: the effect has not run in a built image. The thumbnail is a diagram, not an LCD capture.
