# Improved Envelopes: origin

Improved Envelopes is Nathaniel Pavel's (@npp1993) own module, written for Modwerk; it is not a port
and has no upstream release. It began as an extension of Iced-Cream's Env Reset Amp (MrScruff's
rytm-mods 0015, ported to elemod), whose reading of the amp envelope's commands it builds on. From
0.1.0 it carries none of that module's code: ENV RESET AMP is Env Reset Amp's alone
(`../../env-reset-amp/`), and the two install side by side.

## Sites (OS 1.74)

| addr | len | op | what |
|---|---|---|---|
| 0x40109c24 | 8 | jmp `envelopes_write` | the amp record write in `amp_env_commands`, every voice every block |
| 0x400d3302 | 6 | jsr `envelopes_amp_graph` | the AMP page's envelope picture (HLD 127 drawn as AUTO, 0 as no hold) |
| 0x4010d2aa | 4 | ptr `envelopes_flt_atk` | FILTER ATK rate table |
| 0x40109bc4 | 4 | ptr `envelopes_hold` | AMP HLD compare |
| 0x40109bf0 | 4 | ptr `envelopes_amp_dec` | AMP DEC record |
| 0x4010d344, 0x4010d3b4, 0x4010d3dc | 4 each | ptr `envelopes_flt_dec` | FILTER DEC and REL records |

Addresses, lengths and SHA-256 guards are in `../build.json`; no stock bytes are included.

## Beside Env Reset Amp

Env Reset Amp takes state 0's `ori.l` at 0x40109b70 and, with AMP in a track's ENV RESET, sends a
drop to silence (rate 0xb0100000, level 0x80) in place of the trig's attack record (level
0x4000007f). Envelopes then never sees that record, so stock picks the state after the trig as it
always does (0x40109b5a: HLD byte 0 gives state 1, the gate; any other value state 2, timed), with
the hold counter cleared. From the next block the voice sends the continued attack (level 0x7f),
which Envelopes rewrites to its ATK curve and on which it applies its HOLD rule: HLD 127 turns
state 2 into the gate, any other value sets 2 or 3 by the hold time and the attack's top. Its level
follower takes the drop as an instant one-pole fall to -128. So the attack still runs from silence
on Envelopes' curve, the hold still counts from the trig, and the decay never starts before the
top. Read in OS 1.74's code, not yet run on the unit.
