# Ringmod SC

![A kick on the key track and another track's level dipping with each of its cycles](presentation/thumbnail.svg)

Version: 0.2.0-experimental · author: Nathaniel Pavel (@npp1993)

## Overview

Ring mod sidechain. The track carrying RINGMOD SC has its gain driven by another track's audio (the KEY). In DUCK the key's level pulls the gain down: the gain follows the key's peak over the last 13-26 ms (HOLD sets this), so it holds through the kick's own zero crossings and steps back up as the kick decays, with no buzz. In RING the key multiplies the audio: a ring modulator whose carrier is another track. Three RING knobs shape that carrier: S&H steps it, RECT rectifies it (its frequency doubled, an AM-like modulation) and SLEW turns it into the key's level (a tremolo that follows the key). With all three at 0, RING is the plain ring modulator.

The key is boosted four times. Measured under the emulator, a full-scale source on a key track at AMP VOL 64 (the default) reaches a quarter of full scale before its effects, so four times brings it exactly to full; at AMP VOL 127 it is four times hotter, and the duck holds at full depth until the kick has fallen by about 12 dB. The key's level comes from its AMP VOL and the sample, not from the track's LEVEL, which is after the effects.

The key comes from the Modwerk base's **key bus**: over USB, while RINGMOD SC is installed, the base publishes every track's audio as it enters FX1, on both DSP cores, and RINGMOD SC only reads it. It needs no other module and runs beside Sidechain Compressor, whose key tap the key bus is. A card image has no key bus, so there RINGMOD SC passes the audio untouched. This version's USB package ran on an MKII on 22 October 2026: DUCK, RING and its three knobs by ear, two instances, Part and project reload, beside Sidechain Compressor ([hardware report](evidence/hardware.md)); no power cycle, scenes or parameter locks yet.

## Controls

| Control | Default | Range | Behaviour |
| --- | --- | --- | --- |
| KEY | OFF | OFF, T1-T8 | The track whose audio drives the gain. OFF leaves the track untouched. |
| DPTH | 127 | 0-127 | How far the key moves the gain; 0 leaves the track untouched. |
| KLPF | 127 | 0-127 | Low-pass on the key: 14 Hz at 0, an octave every 14 steps, open at 127. About 20-50 covers a kick's body (40-200 Hz). |
| ATK / SLEW | 0 | 0-127 | DUCK (ATK): how slowly the gain falls when the key rises; 0 is at once. RING (SLEW): 0 rings with the key itself; above 0 the key's level, smoothed over ATK's times, drives the gain instead, a tremolo that follows the key. Turning it to or from 0 crossfades over 16 samples (0.36 ms), so it does not click. |
| HOLD / S&H | 34 | 0-127 | DUCK (HOLD): how long the duck holds after each peak of the key, one to two windows of 0.7 ms at 0, 13 ms at 34, 24 ms at 64 and 47 ms at 127. Keep it above half a cycle of the kick (about 13 ms for 40 Hz) or the duck buzzes; longer gives a fuller pump. RING (S&H): a new key every 16 samples a step, held in between: 0 is every sample, 1 is 0.36 ms (2.8 kHz), 34 is 12 ms (81 Hz), 127 is 46 ms (22 Hz). Turning it down cuts the current hold short. |
| REL / RECT | 45 | 0-127 | DUCK (REL): how slowly the gain recovers once the key's peak drops; 45 is about 9 ms. RING (RECT): blends the key toward its rectified copy, \|key\|; 0 is the key itself (ring modulation), 127 fully rectified: the carrier's frequency doubles and it never goes negative, an AM-like modulation. Ramped, so turning it does not click. |
| MODE | DUCK | DUCK, RING | SETUP page. DUCK: the key's level pulls the gain down. RING: the key multiplies the audio. ATK, HOLD and REL read SLEW, S&H and RECT in RING. |

The main page holds KEY, DPTH and KLPF on encoders A-C and ATK, HOLD and REL on D-F; MODE is on the SETUP page, and three main-page names follow it (ATK, HOLD and REL in DUCK; SLEW, S&H and RECT in RING). The knobs keep their values when MODE changes, as on other modules: a fresh instance switched to RING starts with S&H and RECT at HOLD's and REL's defaults (34, 45); turn them to 0 for the plain ring modulator. DPTH 0 or KEY OFF returns the input bit for bit. KEY steps like a stock select, about three detents a track. On a base from before the module select step fix (on main since 22 October 2026, #781), the first visit to the main page after choosing the effect may still move it one track a detent, until the page is entered again; with the fix it stepped cleanly on an MKII (22 October 2026). The track names are stored with a space on each side (" T1 "), which draws centred where "T1" would.

ATK and REL share one scale, and SLEW uses it too: 0 is at once, 1 is about 0.7 ms, and the time doubles every 11.6 steps up to about 1.3 s at 127.

| Knob | 0 | 1 | 16 | 32 | 48 | 64 | 80 | 96 | 112 | 127 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Time | at once | 0.7 ms | 1.8 ms | 4.6 ms | 12 ms | 31 ms | 83 ms | 210 ms | 540 ms | 1.3 s |

These come from the formula; ATK 32 measured 203 samples (4.6 ms) in the render gate. REL counts from the moment the key's peak over the HOLD window drops, so even REL 0 does not buzz at the default HOLD; raise it for a slower pump.

| KLPF | 0 | 10 | 20 | 30 | 40 | 50 | 60 | 80 | 100 | 120 | 127 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cutoff | 14 Hz | 24 Hz | 41 Hz | 62 Hz | 104 Hz | 181 Hz | 280 Hz | 750 Hz | 2.3 kHz | 9.7 kHz | open |

## Usage

Install RINGMOD SC on the Octatrack over USB (a module set on the Modwerk beta base with the key bus). Select an audio track, hold FUNC and press FX1 or FX2 for SETUP, turn LEVEL to RINGMOD SC and press YES. Press the FX button for the main page. Turn encoder A until KEY reads the track to follow; DPTH (encoder B) sets how deep the gain moves. These steps follow the emulator captures below, not a unit.

For the cleanest duck put the key on a track the instrument handles before the ducked one on the same half (T1-T4 or T5-T8, a lower number): the key is then exact. A key on a higher-numbered track of the same half is heard 16 samples late, and a key on the other half 32 samples (0.7 ms) late. These are the key bus's figures (measured on an MKII for Sidechain Compressor), not yet measured with RINGMOD SC. The key is taken before the key track's own effects.

## Quick tutorial

1. Put a kick on T1 and a sustained bass on T2. Select T2, hold FUNC and press FX1, turn LEVEL to RINGMOD SC and press YES, then press FX1.
2. Turn encoder A until KEY reads T1. The bass dips with every kick and comes back as the kick decays; DPTH (encoder B) sets how deep.
3. Raise REL (encoder F) for a slower recovery, HOLD (encoder E) for a longer pump and ATK (encoder D) to soften the onset. Turn KLPF (encoder C) down to about 30-50 so only the kick's body drives the duck, not its click or other sounds on the key track.
4. Turn KEY back to OFF, or DPTH to 0, to hear the bass untouched.
5. For RING, hold FUNC and press FX1, set MODE to RING and press FX1 again. Turn S&H (encoder E) and RECT (encoder F) to 0: the bass is ring-modulated by the kick. Raise S&H for a stepped, sample-and-hold carrier, RECT for a rectified, frequency-doubled carrier, and SLEW (encoder D) to about 40-60 for a tremolo that follows the kick's level. Choose NONE in SETUP to remove the effect.

## Compatibility and limitations

- Original OS 1.40C. FX1 and FX2 of any audio track, several at once; its own effect id (0x06), so it displaces no stock effect.
- **Over USB only, on a Modwerk base with the key bus** (the loader's ABI 9; the package requires the key bus and declares its reads of the bus and the window). A card image has no key bus: there RINGMOD SC keeps its depth at 0 and passes the audio untouched. So it is USB-only: the configurator refuses card firmware with it (the site's rule for a module whose package requires a base feature) and offers it in USB module sets.
- **The key bus's cost counts toward RINGMOD SC.** While a Part in the bank uses RINGMOD SC, the base's tap copies every track's audio on every block on both cores: 51 chip cycles a sample a core, timed on an MKII on 23 October 2026 (charged at 72 before). Installed but used in no Part of the bank, it costs nothing. Installed beside Sidechain Compressor, which holds the bus too, RINGMOD SC still pays for it.
- Runs beside Sidechain Compressor: both read the key bus, and RINGMOD SC writes nothing outside its own state. Installing or reinstalling Sidechain Compressor while RINGMOD SC is live re-zeroes the bus once: up to about a block of silent key.
- A MODE or KEY change fades the effect out, clears the key's state and fades back in, about 1 ms in all, so a KEY parameter lock shorter than that is not heard.
- **DUCK buzzes at its very shortest settings.** With ATK, HOLD and REL all near 0 the gain follows each cycle of the key, so the duck becomes amplitude modulation at audio rate: a buzz, as expected (heard on an MKII with 0.1.0, 21 October 2026). Keep HOLD above half a cycle of the key for a clean duck.
- **Declared conflict with Analog BD.** It is carried over from the card builder's rule: Analog BD admits only the effects on its companion list, and RINGMOD SC is not on it. Over USB no resource clash is known, but the declaration applies to every build, so the configurator never offers both. Whether to keep it is the owner's call.
- A project that selects RINGMOD SC on a base without it gets no effect in that slot.
- A slow SLEW stops a little short of the key's level (each sample's rise is truncated to the word; up to about 1.4% of full scale at 127, as the review measured on the build before), and a very quiet key never raises it from 0. An LFO on S&H turns S&H 0 into a hold of 1 to 15 samples.
- 351 words of DSP program per core, 22 words of state per instance, no delay buffer; the key bus's memory (Y $800-$9FF on each core, the last $202 words of each core's half of the shared window) is the base's.
- On an MKII (22 October 2026, over USB, on a development twin of the beta base): DUCK, plain RING, RECT, SLEW through 0 (turned) and S&H turned down by ear; two instances on both cores and both slots; Part and project reload; beside Sidechain Compressor, every install and removal order; the base's self-test passed. Not tested on a unit: parameter locks and LFOs, scenes and the crossfader, eight instances a core, a power cycle. An LFO at full depth on KEY takes it past T8, which reads as OFF.

## Tests and measurements

[TESTING.md](TESTING.md) has the commands and every result: the render gate against a reference model, a sample-for-sample comparison with 0.1.0, a 30-second stress render of eight instances, the benchmark against stock and the stress project for the performance record ([evidence/performance.json](evidence/performance.json)), the USB package's checks, and the earlier build's emulator and card-image history.

## Authorship and licences

Original code, tests and documentation by Nathaniel Pavel (@npp1993), MIT ([LICENSE](LICENSE)). It reads the Modwerk base's key bus, which is Sidechain Compressor's key tap and bus layout, by Zac Kyoti (@Zac-Kyoti) and the OT Kyoti FW contributors (MIT), made a base feature; none of that code is in this module. No Elektron firmware, extracted routine or table is included.

## Screens and audio

Unedited MKII framebuffer captures from the headless emulator, taken on a private card image of this version (a card image has no key bus, so they show the pages, not the effect). [Capture provenance](media/capture.json) has the panel plan and the image and emulator hashes; [media rights](media/LICENSE.md) reserves the underlying Elektron rights. They show the pages, not audio; no audio is included.

![FX1 SETUP with RINGMOD SC chosen and MODE on DUCK](media/ot-setup-chooser.png)

![The main page: KEY, DPTH, KLPF over ATK, HOLD, REL](media/ot-main-duck.png)

![KEY turned to T1](media/ot-main-key-t1.png)

![SETUP with MODE turned to RING: the knob keeps its name, the value shows below](media/ot-setup-ring.png)

![The main page in RING: KEY, DPTH, KLPF over SLEW, S&H, RECT](media/ot-main-ring.png)

The thumbnail above is an illustration, not OT UI evidence.
