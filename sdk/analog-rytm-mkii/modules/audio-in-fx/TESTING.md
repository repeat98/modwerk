# Audio In FX — test report

Version 0.1.0-experimental, OS 1.74, core-ar2 0.7. Two knobs on the FX track's DISTORTION page: D (STE, or MNO in mono) on FX word 29 and E (IFX) on FX word 0. F stays empty, as on stock.

## Builds

- **AC20:** the RC12 set (filter-hz, env-reset-amp, pipo-loop, qperf, silent-pad-trig 0.5.1, live-rec-retrig-fix, temp-save, sample-rate, quick-fill-trig-condition) and this module, linked against RC12's storage layout. Sha256 `5bc91ee47f7bebeda10c20ed40050bf910258cfbaa588856ccb321c02cd26a9d`.
- **AF21:** core-ar2 0.7 and this module alone. Sha256 `9970805764f6ee0311f5abb76a761b7ba4ec518098cd648c59c4a0da2aa81a4a`.
- **AC21:** the RC14 set (RC12's nine with silent-pad-trig 0.6.0, this module, then phaser), linked against RC14's storage layout (same id and fields). Sha256 `1136d2e2a84902b9658ff9a002fdaa1c8ca05c59cd2aaeac993571d1a96be13e`.
- **AF22:** AF21's source with two comments realigned, for the screenshots. Sha256 `dd1c4b63ac789fd26de8ba73f4126f9ab77e35bb1a3cdf8e0441bbb95d55f96b`.

The release package is built from AF22's source. It has not run on a unit itself.

## On the unit

npp1993's Analog Rytm MKII, a source in AUDIO IN L and R.

**AC20, reported 2 Nov 2026.** Pass:
- Boot and page.
- Silence with both knobs at 0.
- D alone into DIST and COMP, E alone into the delay and reverb. 127 is a little louder than 110.
- The mono tap, and its blocks with a trig, FUNC or NO held.
- FUNC + turn stops.
- Parameter locks, trig + press, trig + PLAY.
- Page copy, CLEAR and paste.
- Kit and pattern save and reload.
- Scene locks, and performance locks, stock and QPERF.
- Temp Save beside it.

After a power cycle D and E come back at their values at power off, as every stock parameter does, and mono starts stereo.

Failed: after a while a tap of D stopped toggling mono.

**AD21, a diagnostic build of AC20.** It names why a tap is refused. On the unit it showed NO TAP PAD 1 with no pad pressed: stock's key table (`is_key_held`, bitmap 0x418d1340) read pad 1 as down. Why it did is not found. From AF21 on, a held pad blocks the tap only in scene and performance mode, where a held pad is the scene or performance being edited.

**AC21, reported 2 Nov 2026.** All pass:
- D and E, the mono tap, a lock, trig + PLAY.
- Scene and performance locks set with pads. Afterwards, every tap of D with all pads up toggles.
- Taps spread over a few minutes of pattern changes, PLAY, STOP and pads never stop working.
- In scene mode a held pad blocks the tap, and letting go of it lets the tap through.
- Silent Pad+Trig 0.6.0's MUTE ALL SOUND silences a muted BD pad.
- The other modules of the set work.

## rytm-emu

Headless `dtboot`, JIT on. A 1 kHz sine is fed with `--audio-in` and the output recorded with `--analog-wav`. Engine words are read with `DTBOOT_PEEK` at 0x8000fbd2 (D) and 0x8000fb98 (E). Events sit off the `--every` grid: before rytm-emu 951dcbc, an event exactly on it can be dropped.

| Test | Build | Result |
| --- | --- | --- |
| Boot, FX, FLTR | AF21, AC21 | No fault. AMT SYM DOV STE / IFX, F dithered as stock |
| Tone in, both knobs at 0 | AC20 | Output 0 |
| D alone; E alone | AC20 | D reaches the mix; E reaches the delay and the reverb |
| Turn D, E | AF18 | Kit words 29 and 0 change; engine words follow, smoothed |
| Copy, CLEAR, paste page | AC20 | Both to 0, then back to the copied values |
| Lock on T1, plain trig T9, play | AC20 | Engine word alternates lock and 0 each pass |
| Lock, pattern save, change, reload, play | AC20 | Lock back |
| Kit save, change, reload | AC20 | Values back |
| FUNC + turn, no trig; with a trig held | AF18 | 110 then 127, paced as stock's VOL; with a trig, the lock to 127, inverted |
| Plain turn with a trig held | AF18 | Stock's lock, inverted with its value |
| Tap D twice, tone on L only | AC20 | Mono on both sides, then stereo |
| Tap D after each of these steps: a lock from grid recording, trig + press, trig + PLAY, page copy, CLEAR and paste, kit save and reload, pattern save and reload, PLAY and STOP | AC21 | Mono on after every one |
| Tap D with BD held, no mode | AF21, AC21 | Mono on (AC20: refused) |
| Tap D with BD held, in scene mode; in performance mode | AF21, AC21 | Refused |
| Tap D in scene mode, no pad | AF21, AC21 | Mono on |
| View stack on the FX track | AF21 | Scene mode's view is 0x401e2ee8 and performance mode's is 0x401e2a54, not the pad tracks' 0x401e305c and 0x401e26c4; MUTE is 0x401e2bbc. The module tests all four |
| With PHASER added | AC19 | CLEAR PAGE clears and two taps of D toggle mono |
| Sine at -8.7 dBFS, D at 110 and 127; pads BD, SD, CH of the default kit | AF15 | Peaks 4442 and 5903 in `--analog-wav`; BD 5897, SD 5362, CH 4489. The emulator's analog model, not a unit |

## Earlier designs

**AC02.** Knobs on the FX page, with about 90 as unity. npp1993 reported it as all good on 1 Nov 2026: noise, level against the drums, DIST, COMP, the delay and reverb PRE and POST, latency, and the knobs at 0 after a power cycle.

**AC13 to AC17.** Three bars, INP, IDL and IRV, ran on the unit on 2 Nov 2026. What they found carries over to the two knobs:
- Each knob locks on its own.
- A slow lock turn moves at stock's pace.
- The header names the new mode after a tap.
- FUNC + turn is paced as stock's VOL.
- One jack in mono keeps its level: L and R both -42.4 dB RMS against -42.5 dB in stereo.

**Jack test, 1 Nov 2026.** AUDIO IN feeds the converter and EXT IN does not. On stock, a source in EXT IN is heard and the input meter stays still; in AUDIO IN it is not heard and the meter moves.

## Not tested

- Level, noise and latency as numbers on a unit.
- Undo of CLEAR PAGE, on the unit or in rytm-emu, with or without the module.
- Why stock's key table read pad 1 as down on the unit.
- A project saved with locks, loaded on a build without the module.
- The release package itself on a unit.

## Load

Static estimate, not measured. About 28 instructions a frame for each path in use, more in mono: about 0.7 % of a block for each path, 1.4 % for both, at the Rytm guide's 0.023 % of a block per instruction a frame. With both knobs at 0 and nothing locked, the block handler returns before touching a word.
