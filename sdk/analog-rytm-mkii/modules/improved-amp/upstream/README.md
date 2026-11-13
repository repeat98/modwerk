# Improved AMP: origin

Improved AMP is Nathaniel Pavel's (@npp1993) own module, written for Modwerk; it has no upstream
release. It began as an extension of Iced-Cream's Env Reset Amp (the elemod port of MrScruff's
rytm-mods 0015-env-reset-amp, rytm2_mods at afd461d, GPL-2.0-only) and carries that mod's ENV RESET
AMP: the two byte sites that let ENV RESET reach AMP and AMP+FILT, and its reading of the amp
envelope's commands (`src/pre-fade.s`'s header). The drop to silence at the trig that 0015 and Env
Reset Amp 1.0 send is not carried: `src/pre-fade.c` fades the voice out before the trig instead. The
envelope curves, knob texts and OVR curve are new code.

## Sites (OS 1.74)

| addr | len | op | what |
|---|---|---|---|
| hook `ev_amp_record`, order 20 | | `amp_prefade_write` | the amp record of a voice about to be trigged becomes a fade |
| hook `ev_amp_record`, order 50 | | `improved_amp_write` | the amp record write in `amp_env_commands` (0x40109c24), every voice every block |
| 0x400d3302 | 6 | jsr `improved_amp_amp_graph` | the AMP page's envelope picture (HLD 127 drawn as AUTO, 0 as no hold) |
| 0x4010d2aa | 4 | ptr `improved_amp_flt_atk` | FILTER ATK rate table |
| 0x40109bc4 | 4 | ptr `improved_amp_hold` | AMP HLD compare |
| 0x40109bf0 | 4 | ptr `improved_amp_amp_dec` | AMP DEC record |
| 0x4010d344, 0x4010d3b4, 0x4010d3dc | 4 each | ptr `improved_amp_flt_dec` | FILTER DEC and REL records |
| 0x40109b14 | 10 | jsr `improved_amp_ovr` | the reader of AMP OVR's live value, once a voice a block |
| 0x400bcf8a | 2 | bytes | ENV RESET's setter keeps the amp bit (from rytm-mods 0015) |
| 0x400ef8d6 | 2 | bytes | the ENV RESET menu steps by one: OFF, AMP, FILTER, AMP+FILT (from rytm-mods 0015) |

Addresses, lengths and SHA-256 guards are in `../build.json`; no stock bytes are included.

## The two entries on the amp record

With AMP in a sound's ENV RESET, the order-20 entry replaces the record of a voice whose trig is up to
10 blocks away with a fade (a ramp from the current level to -128, then the same ramp continued each
block). The order-50 entry rewrites only attack and hold records, so the fade passes through; its
level follower takes the fade as a fall to silence. On the trig stock sends its attack record, which
the order-50 entry rewrites to the ATK curve; the hold counts from the trig and the decay never starts
before the top. The pair ran this way on the unit as two modules (EN05, TESTING.md).
