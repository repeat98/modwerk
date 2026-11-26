# Quadraverb engine: design (draft, 26 November 2026)

Status: design and a pricing prototype. Nothing here has run in `dsp_host` or on a unit.

## The owner's decisions (26 November 2026)

- **Full rate, programs untouched.** The engine runs the firmware's 96-step programs at the Octatrack's 44.1 kHz
  (the original runs at about 42 kHz, so delays and reverb times come out about 5 % shorter, as Midiverb's are 6 %
  longer). Rewriting the programs for half rate (halved delays, recomputed filter and EQ coefficients) was turned
  down: it would make every program our translation.
- **About 400 chip cycles a sample per instance at most.**

## Why compiled code, not an interpreter

An interpreter like Midiverb's jumps to a handler for every step. Midiverb's dieted engine prices at about 9 cycles
a step, so 96 steps would be about 860 cycles a sample, more than twice the target.

The engine instead turns the selected program into straight-line DSP code. The 90 factory programs use 60 distinct
step patterns, so fixed code for each pattern would not fit the arena (about 18K words); the code is made for the
program when it is picked.

## The step code

Registers: `a` is the Quadraverb's accumulator, `b` latch B, `x1` latch M. `x0` holds the step's coefficient and
`y0` its delay word, both fetched by the step before. `y1` holds A before a write.

- **Delay memory:** one Y ring with modulo addressing. Three address registers (`r4`-`r6`) take turns. Each walks
  from one access to its next with a post-added `n`, so an access is `y:(r4)+n4`: no displacement, no index stall.
  The distance after a chain's last access in a sample closes the loop for the next one, so nothing resets a sample.
- **Tables:** the coefficients in X (the instance's `r7` block, 96 words, walked by `r2`), the distances in Y (walked
  by `r3`, one reload after every access). The sweeps, pitch shift and Leslie rewrite entries of these two tables
  (`tools/qvlfo.mjs`); the code never changes while a program plays.
- **A read step** is one instruction plus a reload: `mac y0,x0,a x:(r2)+,x0 y:(r5)+n5,y0` multiplies this step's
  word and coefficient while fetching the next step's, then `move y:(r3)+,n5`. A latch or an add of B or M costs one
  more instruction (`tfr b,a`, `tfr y0,b`), which can carry the reload.
- **A write step:** `move a,y1`, then `mpy x0,y1,a x:(r2)+,x0 a,y:(r4)+n4` stores the old A while it scales it, then
  the next step's delay word.
- Only `x0,y1` and `y0,x0` products are used (sdk/octabam/docs/TRAPS.md: other orders assemble as `mpysu`). Every
  form above assembles; `move x:…,n a,y1` (an `n` load beside a register copy) does not exist, and the pricing
  respects that.

## What it costs

`tools/qvc_price.py` compiles every factory program to this code and prices it with the stall model
(`sdk/cycle-scan/interlock_scan.py`, Table A-1 and the A.2 interlocks; a model from the manual, calibrated idle on an
MKII, not a measurement):

| Part | Cycles a sample |
| --- | --- |
| The 96 steps | 274-328 (median 306), of which 24-39 are stalls from storing A right after computing it |
| Input, output, mix | about 15 (estimate) |
| Sweeps, pitch shift, Leslie: table rewrites about every 10.7 samples | about 5-10 (estimate) |
| Copying the SDRAM lines in and out | about 25 median, up to about 70 (estimate, from the full-rate stream sizes) |
| Block overhead | about 3 |
| **Total** | **about 350 median, about 425 worst (estimate)** |

So 400 looks reachable for most programs; the dearest need the stalls scheduled away (reordering a write's copy of A
away from the step that computes it) or a cheaper stream copy. Code: 248-287 program words a program, plus 96 X and
about 100 Y table words, per instance.

## What it needs from the base

- **A program's code changes at a pick.** The base must write it into the module's arena while the effect plays:
  two code areas per instance, written while the other runs, switched at a frame boundary. The base's WRITE path
  already places engine code into unused arena words while playing (docs/OCTATRACK_RESIDENT_ENGINES_ON_DEMAND.md);
  switching a running slot's code is new.
- **The SDRAM stream** at full rate: a median of 224 and at most 560 halfwords a frame each way per instance. Probe A
  passed on the unit at 64, 128 and 160 (26 November 2026); probe B (reads, larger blocks) is being built.

## Not settled

- **Word width and saturation.** The engine stores 24-bit words in the DSP ring; the stream carries 16 bits. Whether
  to round every store to 16 bits (about 1 cycle a write) for one behaviour throughout is open. Either way it is an
  assumption, labelled as one: nothing records the original's width.
- **The gate's detector:** an envelope on the DSP, threshold and time constant assumed (README, "The gate").
- **Bit-exactness:** the next step is an integer model of this arithmetic and one static program (a delay or MEDIUM
  HALL) relocated into the ring and run in `dsp_host`, bit for bit against it.
