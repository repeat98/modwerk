# SCOPE 0.2.0 local memory inventory

Assembled `unit.s` with `m68k-elf-as -mcpu=5475` on 27 November 2026.
`m68k-elf-objdump -h` reports `.text` 0x0e2e (3,630 bytes), `.data`
0x84a0 (33,952 bytes), and `.bss` zero. `m68k-elf-nm -n` gives these
data boundaries:

| Region | Object offsets | Bytes | Scope |
| --- | --- | ---: | --- |
| Controls, window state, HUD and draw state | 0x0000–0x009f | 160 | shared |
| Eight small ALL-view rings | 0x00a0–0x049f | 1,024 | shared |
| Left audio ring | 0x04a0–0x44a0 exclusive | 16,384 | shared |
| Right audio ring | 0x44a0–0x84a0 exclusive | 16,384 | shared |
| ColdFire instructions and constants | `.text` | 3,630 | shared |

The object accounts for 37,582 bytes. The tested runtime package header
reports 37,704 bytes of code and data, 122 bytes more than these sections;
the runtime packer's alignment and metadata need to be reconciled before
qualification. SCOPE declares no DSP P/X/Y allocation and no module BSS.

This inventory does not bound stack use in SCOPE or in stock routines it
calls, nor does it establish the lifetime or ownership of stock audio
read-back memory. Those are open memory accounting items. It is not a
complete `tests.qualification.memory` record.
