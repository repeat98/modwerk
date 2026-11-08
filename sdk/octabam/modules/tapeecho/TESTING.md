# Tape Echo testing

Version: 0.1.2-experimental · author: [Jannik Aßfalg](https://github.com/repeat98)

This revision updates author credits only. The historical evidence below is retained; no new hardware or DSP qualification is claimed.


## Source evidence

Evidence source: repeat98/octamad commit `b8deefc88b2c3e5f3c6158e364eb741df1924e1d`. Read [the original record](README.md).

The pinned hardware record reports six instances running and a seventh freezing the unit; that limit remains open. Recorded gates cover native arithmetic parity, dirty state, eight-instance stress, moving controls and repeat/feedback behavior. Hardware timing and worst-case CPU headroom remain unqualified.

## Commands and results

Declared native gates:

`tools/verify/verify_tapeecho_cpu.py`

This SDK import did not rerun these gates. CPU-heavy checks remain paused. Historical results are source records, not new qualification of the SDK or a combined configuration. Record exact commands, tested source commit, workload, modes, track count, duration and results here whenever the module changes.

## Hardware and limitations

Hardware status: historical. Eight instances with all controls reversing in BEAT mode. FREE peaked at 18,063. These emulator instruction counts are not hardware cycles or CPU percentages.

Do not claim a passed hardware test without a model, image version, conditions and actual result. Packaging parity is separate from audio quality and hardware safety.

## OT UI captures — 1 October 2026

Module version: 0.1.2-experimental. Actual firmware-rendered LCD pixels captured
through the headless `ot_emu` interactive panel and `lcd_view.py`;
128×64 LCD, integer scale 6, MKII panel, transport stopped. Empty
scratch FAT16 card; no samples, personal projects or hardware connection.

The image was compiled from a temporary copy of the original seven module
sources and their required internal loader; pending imports were excluded.
Build environment: `REMIX=ui-capture XBUS=1 SPEC=1 DEV=0 BUILD=79
OCTABAM_STATIC_STOCK=0 OCTABAM_NO_CACHE=1`; native `build_bus.main()`
uses the catalog's seven-module profile (`MINIVERB`, `TAPE ECHO`, `EUCLID`
on FX2; the three station modules and Euclid added to FX1). No native
qualification, stress, audio-render or firmware parity gates were run.

Local MAIN OS build SHA-256: `5162680d8bc342deb623cef00307f2a343f539a90f0bfcef59b59ceb4c60bb83`.
Emulator binary SHA-256: `93484e4b71c70f48f795825103146a36ef95ef9ac06ee627e28608ae3e3bb3eb`.

Panel sequence and PNG hashes are recorded in [media/capture.json](media/capture.json).
Capture command: `ot_emu --image <local-image> --card <empty-scratch-card>
--dsp --frame --ms 3000 --interactive --lcd <temporary-plane> --main-level off
--rtc host --mkii`; input uses panel key rows and encoder detents. Export:
`lcd_view.png(lcd_view.screen(lcd_view.read_plane(<temporary-plane>)), <png>, 6)`.
The maintained equivalent is `scripts/capture-module-ui.py`; see
[the capture workflow](../../../../docs/MODULE_UI_CAPTURES.md).

Only screenshots, hashes and documentation are retained. This evidence
does not alter the existing hardware status or qualify a firmware release.

Publication metadata was synchronized with current main without changing native code.
The capture record preserves the original draft version and records the source-file
comparison binding these exact pixels to this documentation/media-only update.

## 0.1.6 MIX law (27 October 2026)

Issue [#969](https://github.com/repeat98/modwerk/issues/969): turning Tape Echo on dropped the track's level, because MIX was a straight crossfade (dry at (127 − MIX)/127, −10.7 dB at the old default 90). MIX now follows BBD's law with Tape Echo's full-wet level as unity: wet gain `min(MIX, 64)/64`, dry gain 1 up to MIX 64 and `(127 − MIX)/63` above it; the default MIX is 40. The change is the output stage of `te_tape_block` in `cpu_kernels.s` (`TE_TAPE_GAINS`, `TE_TAPE_RAMP_MIX`) and its native oracle `tape_block`/`mix_gains` in `cpu.c`; `te_process` and the compiled C are unchanged, so `cpu.s` was updated by replacing only its kernel section. Assembled for the 54454 and the 5475 the text is identical; against 0.1.5 every byte before `te_tape_block` is identical except the PC-relative tail call into the moved `te_read_linear`.

**Run.** `tools/verify/verify_tapeecho_cpu.py tapeecho` (m68k-elf-gcc/binutils of the reviewed 16.2.0 toolchain), on a private copy of this repository's `sdk/octabam` with upstream octabam's `vendor/` (`dcf93d37`), upstream's one-module `tapeecho` test remix and the author's own 1.40C MAIN OS, image built by `make bus REMIX=tapeecho`. The same run on the unmodified 0.1.5 sources is the left column below.

**Result: all gates passed.** Native signal gates; the voice gate with nine new MIX checks (dry within 0.001 dB of the input from MIX 1 to 64, −6.16 dB at MIX 96, none at full wet; echo at its full-wet level from MIX 64 up, −6.02 dB at 32, −4.08 dB at the default 40; MIX sweeps, endpoint jumps and reversals every 1, 16 and 64 blocks through the knee leave a peak sine-recurrence residual of 0.00075 FS against 0.00007 settled, the click limit being 0.006); the fused tape kernel against the native oracle bit for bit (1,024 blocks: 257 dry, 257 full wet, 254 mixed, 256 ramping, among them MIX ramps that cross the MIX 64 knee inside a block in both directions; 45 curve-limit records, 7,214 clipped outputs); eight instances bit for bit over 2,300 blocks; exact 32-bit dry at MIX 0; the complete stock delay routine with modelled DMA and stock DELAY tracks bit-identical to stock. The tape kernel's per-block ceiling rose from 1,000 to 1,100 instructions (1,074 now, only in the knob-ramp path).

| Executed instructions, 8 instances, full 16-sample routine | 0.1.5 | 0.1.6 |
| --- | ---: | ---: |
| Settled MIX=90, full history, peak | 16,248 | 16,312 |
| Moving FREE TIME, MIX=90, mean | 16,459 | 16,523 |
| MIX / FDBK / AGE endpoint reversals, peak | 17,624 / 17,600 / 17,776 | 18,648 / 18,624 / 18,800 |
| All controls reversing, FREE, peak | 18,063 | 19,087 |
| All controls reversing, BEAT, peak | 21,547 | 22,571 |

A settled block forms the two gains once, 8 instructions per instance; a block whose MIX, FDBK or AGE is ramping forms them for every sample (8 instructions each, 128 per block), so those peaks are 1,024 instructions (5 to 6%) higher while a knob moves. These are executed instructions, not hardware cycles, and the freeze at seven instances is not shown to be related or unrelated.

**Level.** Host oracle, FREE, TIME 64, AGE 64, WOW 0, Gaussian noise at −20 dBFS RMS, steady output relative to its input (dB), 0.1.5 / 0.1.6:

| MIX | FDBK 0 | FDBK 64 |
| ---: | ---: | ---: |
| 0 | 0.0 / 0.0 | 0.0 / 0.0 |
| 20 | −1.5 / 0.0 | −1.5 / 0.0 |
| 40 | −3.2 / +0.1 | −3.2 / +0.1 |
| 64 | −5.9 / +0.2 | −5.9 / +0.2 |
| 90 | −9.7 / −4.1 | −9.5 / −4.0 |
| 111 | −13.1 / −9.6 | −12.5 / −9.3 |
| 127 | −13.6 / −13.6 | −12.8 / −12.8 |

At the new default the track keeps its level (+0.1 dB with the echo added); at the old default MIX 90 it is 5.6 dB louder than in 0.1.5. Above MIX 64 the level falls toward the echo-only level, as it always did at 127. The echo level, the feedback law and the self-oscillation headroom are unchanged.

**On a unit (27 October 2026).** Octatrack MKII on Modwerk base `a0cf1a04`, the 0.1.6 USB package (`921e7a60…`) installed with BBD 0.1.1 over USB (trial, then Keep), driven and recorded over USB (`scripts/device.mjs`, the unit's 20-channel USB audio). Tape Echo was picked fresh on T4's FX2 (FX1 NONE) of a project whose only sounding track is T4, a FLEX stab pattern at 119 BPM; TIME, FDBK, WOW, AGE and SYNC stayed at their defaults. Each MIX value was set by encoder F and read back on screen. Measured on T4's USB channels, 12 s takes after 5 s of settling:

- The default MIX read on screen is 40.
- Dry level, fitted against the MIX 0 take: 0.986 at MIX 40, 0.993 at 64, 0.589 at 90 (law: 1, 1, 0.587). Echo level against the MIX 127 take, from the energy left after the dry part: 0.74 at MIX 40 (law 0.625; this estimate reads high by the dry fit's residual), 1.03 at 64, 1.00 at 90 (law 1, 1).
- Whole-track level against MIX 0: +0.4 dB at MIX 40, +0.9 dB at 64, −2.5 dB at 90, −6.6 dB at 127. MIX 0 against FX2 NONE: +0.02 dB. The pattern does not repeat sample-exactly (its loop is 88,941 or 88,942 samples), so MIX 0 against NONE was compared by level, not bit for bit.
- Clicks: a take with MIX swept in steps of 8 up and down and jumped 0↔127 and 0↔64 four times while playing has its largest second-difference burst at 0.056, inside the steady takes' 0.054–0.061 (the stabs' own attacks). No click beyond the material was found.

**Not tested for this version: any further hardware (a seventh instance, UI responsiveness while editing, listening by ear, BEAT mode, other FDBK/AGE/WOW settings), chip cycles, `npm run fx:audit` (aliasing, DC, clipping, idle), Part/project save and reload, reboot persistence, multiple-instance isolation beyond the eight-instance emulator gate. Emulator figures, the host oracle and the software comparisons above do not establish any of them. The UI captures above show the same panel for 0.1.6 and are retained from 0.1.2.
