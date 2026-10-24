# filter-hz

Port of rytm-mods-src `mods/0008-filter-hz` (MrScruff; hardware-verified there).

The FILTER page's FRQ value popup reads as the cutoff frequency to three significant figures -
13.8Hz at 0, 440Hz at 60, 1.11kHz at 76, 21.1kHz at 127 - instead of 0..127. One semitone a step
with 440 Hz at 60, measured on the self-oscillating filter (LP2); other filter types assumed to
share the scale. The value is the knob's: envelope depth and LFO modulation are not included.

## How it hooks

One site, the same as rytm-mods' detour: `param_value_text_invoke`, 0x400a8648, where
param_value_text hands the value to the record's text formatter after stock's own validity
check. The 8 stock bytes there (`lea %a2@(20),%a0; move.l %d3,%sp@(32)`) become
`jmp filter_hz_gate` + `nop`. For parameter id 47 (FRQ) the gate writes the text itself and
returns through param_value_text's epilogue; for any other id it re-emits the two instructions
and resumes at 0x400a8650. Nothing branches into 0x400a864c (rytm-mods registry).

## Changes from rytm-mods

- The stub's code is unchanged. It is `.globl filter_hz_gate`; its tables stay local.
- It runs from the elemod DDR area instead of cave6 (0x401ba390).
- Symbols come from `../include/ar2-1.73.inc` instead of rytm-mods' generated `symbols.inc`.

## Test

1. Build with core-ar2 (top-level README).
2. rytm-emu: FILTER page, turn FRQ, the popup should read Hz/kHz; other parameters unchanged.
3. Unit: on the FILTER page turn FRQ fully left - the popup reads 13.8Hz; fully right - 21.1kHz.
   One step back from fully right reads 19.9kHz. RES and the other popups still show plain
   numbers. (The 0..127 number is no longer shown, so check the ends rather than a middle value.)

## Results so far

- Built with elekloader at d17478b and m68k-linux-gnu binutils 2.42 / GCC 13.3 (Ubuntu 24.04):
  `.run` 256 B, 1 site, no relocations; lint OK; links with core-ar2 0.1 (RAM 760 of 131,072 B).
- The 256 B linked into the image are byte-identical to the stub in rytm-mods-src's default
  build (cave6, 0x401ba390), which MrScruff verified on hardware. The site now reads
  `jmp 0x47be01cc; nop` in place of rytm-mods' `jmp 0x401ba390`.
- A build of core-ar2 with filter-hz in rytm-emu (3c4c42c), against stock 1.73 with the same input: the FRQ popup reads 21.1kHz /
  19.9kHz / 10.5kHz where stock reads 127 / 126 / 115; RES reads 0 in both. Everything else on
  screen identical.
- Hardware: on an Analog Rytm MKII, 2026-10-13, in a build of core-ar2 with filter-hz:
  the FILTER page's FRQ popup shows the frequency in Hz.
