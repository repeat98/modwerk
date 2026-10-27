# FRACT 0.10.0-experimental: memory

Output-envelope implementation on parent `8ffef0f` (2026-10-25); runtime
package `fract-0.10.0-dev.mwrm`, 22,148 bytes, SHA-256
`fef9db2b444dcac1d796f5920ea36448a6a16089a0e5f6801f7fcd4faf23120a`. The ColdFire code and data remain
19,316 bytes with 80 relocations; only SPACE changes from installed variant A.
SPACE uses 593 DSP words and the same 32 state words and 15,779-word ring.
The linked detector, reference, fractional remainder, correction and entry
clock reuse existing scratch state. Figures come from the assembled program,
`make build`, `make runtime-package` and `make cost-check`.

## Inventory

| Region | Space | Words x bits | Bytes | Scope |
|---|---|---|---:|---|
| SPACE program, DSP core A (card build P:0x01000..0x01250) | dsp-p | 593 x 24 | 1,779 | shared |
| SPACE program, DSP core B (card build P:0x00dc0..0x01010) | dsp-p | 593 x 24 | 1,779 | shared |
| SPACE state, X r7+$20..$3F (initialized by `init`, used by `proc`) | dsp-x | 32 x 24 | 96 | instance |
| Declared, unused state, X r7+$00..$1F | dsp-x | 32 x 24 | 96 | instance |
| SPACE ring, Y +0..+$3DA2 of the FX2 buffer | dsp-y | 15,779 x 24 | 47,337 | instance |
| Rest of the FX2 buffer, Y +$3DA3..+$3FFF, never written or read | dsp-y | 605 x 24 | 1,815 | instance |
| DSP system stack (four entries of two words, both cores) | dsp-x | 16 x 24 | 48 | shared |
| Package image in the base's pool | sdram | 19,316 x 8 | 19,316 | shared |
| Audio call's stack peak (interrupted stock task, from the hook) | cpu-ram | 630 x 8 | 630 | shared |
| UI tick or draw stack peak (UI task) | cpu-ram | 192 x 8 | 192 | shared |

    perInstanceBytes = 96 + 96 + 47,337 + 1,815 = 49,344
    sharedBytes      = 1,779 + 1,779 + 48 + 19,316 + 630 + 192 = 23,744
    totalBytes       = 49,344 x 8 + 23,744 = 418,496   (FX2 on all eight tracks)

## Reconciliation

- **DSP program.** 593 words, `make check` (`out/space-evidence.json`,
  `dspCodeWords`) and the build log ("FRACT P:0x01000..0x01251 (593 words)"
  on payload A, "P:0x00dc0..0x01011" on B, each in a 594-word region with
  1 free). The package carries the same 593 words and 4 relocations
  (Modwerk's `build.py`: "DSP effect 7: 593 words, 4 relocations"); the
  base places them on each core.
- **X state.** `engine.asm`'s `init` zeroes r7+$20..$3F (32 words), the
  only X words SPACE writes besides the audio block it processes in place;
  it reads SPCE at r6+4 and the stock's buffer table through `x:>$213`. The package declares 64 state words
  (`build.py --state 64`) so that offset $3F lies inside the declared
  block; r7+$00..$1F is declared and never touched. On a card build the
  stock dispatcher's 256-word X block per FX2 instance is the stock
  allocation.
- **Y buffer.** SPACE's ring has modulus `$3da2` (15,779 words); the
  bounded clear runs 15,872 words through the modulus. `make check`'s
  read-back seeds every word of all eight slots, runs eight loud instances
  on both cores for 33,552 frames and finds 4,840 of 4,840 tail words
  (+$3DA3..+$3FFF, 605 a slot) still holding the seed, the ring's last word
  holding audio in 8 of 8, and the audio equal to a run with zeroed tails.
  The 16,384-word buffer is the one the stock gives every FX2 instance;
  the package declares 15,779 (`build.py --buffer 15779`).
- **DSP system stack.** The dispatcher call takes one entry, the sample
  `do` loop two, and either of the two sequential calls to `hy_output` one:
  at most four entries of two words per core, 16 words / 48 bytes on both.
  `hy_output` is straight-line and never calls another routine. Initialization
  and clearing loops do not overlap the sample loop. This is FRACT's controlled
  call depth, not a measurement of total hardware stack high-water.
- **ColdFire.** Modwerk's `build.py` reports "module 140ced32, 19316 bytes
  of code and data, 0 of bss, 80 relocations, 2 hooks, 1 stock-code
  sites". The image holds the five units (`ogpitch`, `ogcontrol`,
  `oggrain`, `ogsource`, `ogview`) with their initialized data, among them
  the 128-byte owner state (three 32-byte heads and the shared fields,
  checked by `make image-check`), the overview's 216-byte peaks, 54-byte
  packed heights and 448-byte columns, the caption's name and font, the
  6,240-byte SHPE table and the 130-byte Hann table, and the FX2 page
  recipe the base turns into FRACT's page. The base copies the image into
  its pool once for all tracks; nothing is allocated at run time.
- **Stacks.** `make cost-check` records each row's high-water mark below
  the entry stack pointer: 630 bytes from the fetch hook at worst
  (`detour-wrap-sp2`, owner calls 540), against the 636-byte bound every
  row is held to; the UI rows 120-192 bytes on the UI task's stack. These
  are temporary and on stacks the stock owns. They are QEMU measurements of
  FRACT's own calls, not hardware canaries; interrupt nesting on the unit
  is not measured.
- **Not counted.** The sample arena is read in place, never copied (a call
  reads at most 63 source frames). The base's own per-id page slot
  (`fxpage.c`, reserved for every id) and the base's loader records are the
  base's. The card build (emulator checks only) places the same units in
  octabam's platform runtime, which takes 1,707 bottom arena pages; that is
  not part of the USB package.
