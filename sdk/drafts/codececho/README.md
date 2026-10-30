# CODEC ECHO

Version: 0.1.0-experimental · author: @semierendonmez-commits · draft; the developer reports it runs on their Octatrack MKI (card build)

## Overview

CODEC ECHO is an echo on the project's tempo whose repeats pass through a lossy codec, every time. The first echo already sounds like a call over a bad line; each repeat goes through the codec again, so the echoes grow darker, coarser and more broken as they fade.

- **The line.** The echo runs at half the rate (22.05 kHz) and keeps 12-bit samples, two to a word, so the slot's buffer holds 1.44 s.
- **LOSS.** Every pass is coded and decoded by an ADPCM coder: 5 bits a sample at LOSS 0-31, then 4, 3 and 2 at 127 (the depths of G.726's 40, 32, 24 and 16 kbit/s), with an adaptive step (89 sizes, IMA's progression) and a leaky prediction, so silence decodes to silence. A low-pass in the loop closes from open to about 1 kHz with it, and a DC blocker keeps the coder's small biases from piling up.
- **DROP and PKT.** The line is cut into packets of PKT (2.9 to 46 ms); each packet is lost at DROP's chance (up to one in two). PLC says how a lost packet is concealed: MUTE leaves a hole, RPT plays the packet before it again, the way a voice codec covers a loss.
- **TIME** is a note division of the tempo, from 1/32 to 1/2 with triplets and dotted values. A division longer than the line halves until it fits (1/2 at 60 BPM plays as 1/4). Changing TIME or the tempo fades the echo out and back in at its new time, without a click.
- **FDBK** sets how much of each echo comes back, up to 0.95.

MIX 0 returns the dry bit for bit; the line keeps running, so turning MIX up brings in the echoes already in it.

Signal path: `(L+R)/2 → half rate → [ + FDBK × line ] → low-pass and ADPCM (LOSS) → packets (DROP, PKT, PLC) → the line → full rate → MIX over the dry`.

## Controls

Main page (FX2):

| Knob | Default | Range | What it does |
| --- | --- | --- | --- |
| TIME | 1/4 | 1/32, 1/16T, 1/16, 1/8T, 1/16D, 1/8, 1/4T, 1/8D, 1/4, 1/2T, 1/4D, 1/2 | The echo's time, a note division of the tempo. |
| FDBK | 64 | 0-127 | How much of each echo comes back, 0 to 0.95. |
| LOSS | 48 | 0-127 | The codec: ADPCM at 5, 4, 3 or 2 bits a sample, and darker, on every pass. |
| DROP | 16 | 0-127 | The chance a packet is lost, up to one in two. |
| PKT | 40 | 0-127 | A packet's length, 2.9 to 46 ms. |
| MIX | 0 | 0-127 | The echoes over the dry. 0 = the dry, untouched; 127 = the echoes alone. |

SETUP page (hold FUNC and press FX2):

| Knob | Default | Range | What it does |
| --- | --- | --- | --- |
| PLC | RPT | MUTE, RPT | A lost packet: silence, or the packet before it again. |

## Usage

Short percussive material shows the codec best: each repeat of a hi-hat or a click turns to grit. RPT with a high DROP and a long PKT makes the echoes stutter.

## Quick tutorial

1. On an audio track, hold FUNC and press FX2, turn LEVEL to CODEC ECHO and press YES. Press FX2 for the main page and turn MIX to 64: a quarter-note echo, a little dark, with an occasional repeated packet.
2. Turn LOSS to 110: each repeat is coded at 2 bits a sample and loses more of its top end. Turn DROP to 80 and PKT to 100: long packets go missing and repeat. Hold FUNC and press FX2, set PLC to MUTE: the lost packets become holes instead.
3. Turn MIX to 0 for the dry, exactly as before. To remove the effect, choose NONE in FX2 SETUP.

## Compatibility and limitations

- **FX2 only, and needs the Modwerk base loaded over USB (beta)** with an effect id of its own. The card builds' thirteen non-stock ids are all claimed but 0x07, which this draft holds as a placeholder in `manifest.py`. FX2 because the line takes 15,870 words of the slot's buffer (an FX1 slot has 3,072) and because the tempo word it reads is an FX2 instance's (octabam's BusDelay reads it there; FX1's is not known to carry it).
- **Sidechain Compressor's key window.** The line stops 514 words short of the slot's end, so the window Sidechain Compressor keeps on T3 and T7 is never written.
- **The first 0.05 s.** When the effect is chosen, the first 124 calls clear the line; the dry passes untouched meanwhile, so a garbage buffer is never heard.
- **Mono echo.** The echoes are the same on both channels; MIX blends them over the stereo dry.
- **Time.** TIME follows the tempo and halves a division the 1.44 s line cannot hold. Swing and track speed do not change the echo, as a delay pedal's tap tempo would not.
- **Deterministic losses.** Lost packets come from a noise generator seeded the same way whenever the effect is loaded.
- **One unit, by report.** The developer reports it runs on their own Octatrack MKI from a card build (31 Oct 2026; the exact revision was not recorded). Otherwise the DSP code has run only in fxhost, the vendored DSP56300 emulator with the module alone (TESTING.md). The tempo word's position is octabam's measurement for BusDelay, not checked here.

## Tests and measurements

See [TESTING.md](TESTING.md). `python3 -B sdk/drafts/codececho/verify.py` runs the gates on the vendored DSP56300 emulator: MIX 0 bit-exact from garbage state with trig splits; a garbage line is never heard; the echo's time at four tempos and divisions, within 2 samples; repeats decaying with FDBK and reaching digital silence; LOSS's ADPCM depths (the signal-to-noise ratio falls with the bits, at any level); DROP's holes of PKT's length; RPT leaving none; a TIME change without a click; a memory guard on every run with the line ending at 15,870 words; the cost. Program size, table and cost are in TESTING.md.

## Authorship and licences

Design, DSP56300 code and tables by Semi Erendönmez, GPL-3.0-or-later ([LICENSE](LICENSE)). The tempo division follows octabam's BusDelay (Sam Banks, MIT): the doubled dividend and the 24-step `div` that turn stock's tempo24 into the samples a MIDI clock lasts; the line's bounded clear follows octabam's Mini Verb. The effect ABI, schema and harness conventions are octabam's; the noise generator uses the doubled-product LCG idiom of Analog BD's DSP code. No Elektron firmware, extracted routines, tables or samples.

## Screens and audio

Not captured yet: the effect has not run in a built image. The thumbnail is a diagram, not an LCD capture.
