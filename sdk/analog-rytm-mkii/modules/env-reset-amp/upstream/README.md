# env-reset-amp

Port of rytm-mods-src `mods/0015-env-reset-amp` (MrScruff; hardware-verified there).

SOUND menu (FUNC + MUTE) > SOUND SETTINGS > ENV RESET now steps OFF, AMP, FILTER, AMP+FILT. With AMP
or AMP+FILT the amp envelope restarts from silence on every trig instead of continuing from its
current level, so AMP ATK is heard on every hit. A trig on a voice that is still sounding drops it
to silence at once, which can click (most with ATK 0 and a long DEC). The setting is the sound's,
saved with it.

## How it hooks

Three sites, as rytm-mods' registry:

| addr | stock | new | why |
|---|---|---|---|
| 0x400bcf1e | `7402` moveq #2,%d2 | `7403` moveq #3,%d2 | ENV RESET's setter masked the amp bit off |
| 0x400ef86a | `d683` add.l %d3,%d3 | `4e71` nop | the menu stepped by two (OFF <-> FILTER) |
| 0x40109b04 | `0080b0000000` ori.l #0xb0000000,%d0 | `jmp env_reset_amp_attack` | the trig's amp attack command |

The stub re-emits the `ori.l`, looks up the voice's track and its ENV RESET byte (0x8000ea30 + track),
and with bit 0 set sends stock's decay form at DEC 0 (rate 0xB0100000, level 0x80) instead; the hold
states that follow ramp up from silence at the ATK rate. It resumes at 0x40109b0a. It runs in the
voice-command routine (0x401098d4).

## Changes from rytm-mods

- The shipping code is unchanged. The label `amp_attack` is renamed `env_reset_amp_attack` (global
  labels carry the mod id) and is the only `.globl`.
- The `bit_probe` diagnostic is not ported: it needs a fourth patch (0x40109aae) only that build
  carries. The source sets `P_BIT_PROBE` to 0, so the probe's code is not assembled.
- It runs from the elemod DDR area instead of cave13 (0x400298e4).

## Test (on a unit)

1. Pick an analog BD sound, AMP ATK about 40, DEC long (100+).
2. Stock ENV RESET (OFF or FILTER): hit the pad quickly several times; the attack is heard on the
   first hit only.
3. Set ENV RESET to AMP: every hit now fades in at the ATK rate.
4. ENV RESET steps OFF / AMP / FILTER / AMP+FILT with the arrows.

## Results so far

- Hardware: on an Analog Rytm MKII, 2026-10-13, in a build of core-ar2 with filter-hz, ctrl-all,
  env-reset-amp and slice-loop: works as described (ENV RESET values and the
  amp restart).
- `.run` 52 B (50 B of code), 3 sites, no relocations; lint OK; links with core-ar2 0.1.
- The 50 B of code are byte-identical to the stub in rytm-mods-src's default build (cave13,
  0x400298e4); the two byte sites match that build byte for byte; the probe's patch site is stock in
  both.
- rytm-emu, the four-mod build above: ENV RESET steps FILTER -> AMP -> OFF and OFF -> AMP -> FILTER -> AMP+FILT
  (stock: FILTER <-> OFF only); with AMP chosen, BD's ENV RESET byte in the engine reads 01 (stock
  00). Three BD pad hits reach the attack site and resume at 0x40109b0a on both builds. The
  emulator's voice model is not used to judge the sound: that needs the unit.
