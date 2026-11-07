# Improved Envelopes

Module for the Analog Rytm MKII, OS 1.74. It reworks the AMP envelope and shows times on the
envelope knobs. It carries Env Reset Amp (ENV RESET AMP, with a pre-fade added) on, so a set takes this module instead.

Credits: Nathaniel Pavel (@npp1993) for Envelopes and the pre-fade; MrScruff for ENV RESET AMP (rytm-mods
0015-env-reset-amp); Iced-Cream for its elemod port and Modwerk module; irpina for Elekloader and core-ar2.

## What changes

| Control | Stock | With Envelopes |
|---|---|---|
| AMP HLD | 0 = AUTO, 1..127 = 15.6 ms .. 16 s from the trig, 7.8 ms steps to 250 ms | 0 = no hold, 1..126 = 0.67 ms steps to 10 ms (15), 1.3 ms to 18 ms (21), 3.3 ms to 51 ms (31), 6.7 ms to 151 ms (46), 13 ms to 298 ms (57), then about 6 % a step to 15.5 s, 127 = AUTO. The decay never starts before the attack reaches the top. 0.67 ms is a block, the OS's smallest hold step |
| AMP DEC, FILTER DEC, FILTER REL | stock's curve: 7.9 ms at 1, about 8 ms steps at the low end, 300 ms at 23, 45 s at 127 | 0 instant, 0.2 ms steps to 5 ms (25), 0.5 ms to 15 ms (45), 1 ms to 25 ms (55), 2.5 ms to 50 ms (65), 5 ms to 100 ms (75), 10 ms to 200 ms (85), 25 ms to 300 ms (89), then about 14 % a step to 39.4 s (AMP 126) or 45 s (FILTER 127). AMP DEC 127 stays INF |
| AMP ATK | 0 instant, 1 = 5.3 ms, about 5 ms steps at the low end, 127 = 30 s | 0 instant, 0.2 ms steps to 5 ms (25), 0.5 ms steps to 15 ms (45), then about 10 % a step to 30 s (measured on the unit) |
| FILTER ATK | stock's curve (as AMP's) | the same new curve as AMP ATK, built for the filter's speed measured on the unit (1.00x the OS model); played on the unit in EV14, 7.5..384 ms within 0.3 % of target |
| FUNC + turn on HLD | jumps to AUTO | steps 0, 124.7 ms (a 16th at 120 BPM, HLD 42), AUTO |
| AMP ATK, HLD, DEC, FILTER ATK, DEC, REL | 0..127 | times: an attack's full ramp, a hold's length, a decay's or release's time to -60 dB; AMP DEC 127 = INF |
| SOUND SETTINGS > ENV RESET | OFF, FILTER | OFF, AMP, FILTER, AMP+FILT (Env Reset Amp). AMP fades the amp envelope to silence just before sequenced trigs and retrig rolls (a held pad's RTRG roll too), so they restart from silence; a pad or MIDI hit itself, and the first trig after PLAY, continue from the current level, as stock |

Saved values keep their bytes and are read the new way: a project made on stock plays HLD 0 as no hold
(was AUTO) and HLD 127 as AUTO (was 16 s), HLD 1..126, DEC and REL on the new curves (the same byte is a different time, mostly shorter at the low end), and AMP and FILTER ATK on the new curve. MIDI CC 79 (HLD) and the ATK CC
follow the knob. There is no migration.

The ramps stay as stock makes them: the attack is a straight line in amplitude, decay and release are
exponential (straight lines in dB). A choke or stop still fades over stock's fixed ~43 ms.

## How it works

- `src/amp-write.s` takes the amp record write in `amp_env_commands` (0x40109c24, every voice every
  block). It runs ENV RESET AMP's pre-fade (`src/pre-fade.c`) while a track has AMP in its ENV
  RESET, then `envelopes_voice`, except for a voice whose record repeats the last one it took when
  that one changed nothing (an idle voice, a decay at its end): an idle unit makes no C call there.
- `envelopes_voice` (`src/envelopes.c`) follows each voice's amp level from the records sent (the level
  lives in the voice hardware) and sets the state stock moves to: after a trig 1 (gate, AUTO) or 2
  (timed); in the timed state it ends the hold when the hold time has passed and the level is at the
  top. A one-pole decay is followed slightly fast, so the attack is never thought done early.
- ATK's rates come from `atk_rate` (`tools/atk_table.py`, 16-bit packed): `envelopes_voice` writes
  them into the attack's records (the trig's and each held block's) as they are sent.
- FILTER ATK's rates come from `envelopes_flt_atk` (same script, 32-bit words): a `ptr` site in
  `build.json` points stock's lea at 0x4010d2a8 (the filter attack table, read for the attack record
  and the state counter alike) at it.
- ENV RESET AMP: the pre-fade watches each track's queued sequencer trig and retrig series and ramps
  a sounding voice toward silence (up to ~4 ms, starting up to 7.3 ms ahead), so stock's attack, which
  starts from the current level, starts from silence. A pad or MIDI hit, and a trig queued less than
  the fade ahead (the first after PLAY), are not known in time and play as stock. A roll faster than
  about 15 ms gets half its spacing to fade, so below about 8 ms it may not reach silence.
- DEC, REL and HLD: `tools/dec_table.py` builds three tables (`envelopes_amp_dec`, `envelopes_flt_dec`,
  `envelopes_hold`, 128 words each) and `ptr` sites in `build.json` point stock's leas at them: the amp
  decay record (0x40109bee), the filter decay and release records (0x4010d342, 0x4010d3b2, 0x4010d3da)
  and the hold compare (0x40109bc2). Stock's tables stay where they are, unread by the OS. The AMP table is built
  for the VCA's 0.918x decay speed, the filter's for 1.00x. The hold counter moves a block (16 ticks,
  0.67 ms) at a time, so every hold is a whole number of blocks.
- Times on the knobs come from core-ar2's `core_params` text for ids 50..58; HLD's FUNC jump is its
  parameter record's jump function (id 57, +0x4c/+0x50).

## Limits

- AMP ATK and DEC times are calibrated to one Rytm MKII (EV06, 6 Nov 2026): its VCA ran attacks at
  0.957x and decays at 0.918x the OS's timing model, so the ATK table is built for 0.957 and the
  AMP DEC text is scaled by 0.918. The filter envelope, measured through the self-oscillating
  filter's pitch, runs at the OS model's speed (attack 3 ms..390 ms, decay and release 47 ms..1.2 s
  time constants), so FILTER times need no factor; attacks under 3 ms were not resolved.
  Another unit may differ slightly. HLD is counted by the OS and matched within 2 ms.
- AMP DEC under about 5 ms is blurred by the VCA's own slew (~0.8 ms): DEC 1..8 all measure 1-2 ms.
  FILTER DEC and REL under 15 ms were not resolved on the unit (TESTING.md).
- A module that times a note by AMP DEC's table must read the table address the OS code holds at
  0x40109bf0, not stock's 0x401ee61c: with this module that address points at the new table.
- On stock firmware a sound saved here plays the stock way (HLD 0 = AUTO, the old ATK curve).
- Unit results: TESTING.md.
