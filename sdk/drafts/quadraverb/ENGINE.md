# Quadraverb engine: design (draft, 26 November 2026)

Status: design, a pricing prototype, and a first bit-exact prototype of the generator: five static programs run in
`dsp_host` bit for bit against an integer model ([below](#the-first-bit-exact-prototype-26-november-2026)). Nothing
has run on a unit.

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

The prototype below measures the steps far lower: 164-231 (median 205), the proc around them about 12.5 more.

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

## The first bit-exact prototype (26 November 2026)

`engine/` turns one static factory program into straight-line code and holds it to an integer model:

```sh
node engine/extract.mjs <rom> ~/.cache/modwerk-local/quadraverb/engine/programs.json   # programs, integer coefficients
python3 -B engine/verify.py <programs.json> 40 [--cycles <dsp_host with -steptrace>]    # dsp_host against the model
python3 -B engine/check_model.py <programs.json> 40                                      # the model against tools/qv.mjs
python3 -B engine/qvc.py <programs.json> --all                                           # every program's body, priced
```

The programs file and every generated program are derived from the ROM: they stay in `~/.cache/modwerk-local/`.

**What runs bit-exact.** Of the 9 programs whose DSP program never moves, 5 fit the FX2 buffer untouched at full rate:
40 167 ms DELAY (7,062 words), 41 250 ms DELAY (10,548), 56 SKANK GUITAR (8,031), 76 VELOCITY ECHO+ and 77 VELOCITY
ECHO- (12,523 each); no reverb does (MEDIUM HALL needs 31,614, PINGPONG DELAY 63,049). Each passes `verify.py`:
16,000 samples of stereo noise and of two impulses, one instance in 16-frame blocks; trig splits at frames 1, 5, 7
and 13; an r7 block full of another effect's words before init; two instances on separate buffers and state blocks
(the second split at 7) in one run; and under the tracing host. The relocated model equals the model on the original's
64K addresses bit for bit, and every instruction disassembles with the operands written.

**The integer model** (`engine/qvc.py`, `Machine`) is the engine's arithmetic. Each choice the original may make
otherwise is an assumption, marked in the code:

| Choice | The model | Assumption about the original |
| --- | --- | --- |
| Word | 24-bit fraction | its width is not recorded |
| Store | A truncated (floored) to a word; the largest word of its sign outside [-1, 1) | truncation, not rounding; saturation, not wrap |
| A | 56 bits; products kept whole (`mpy`/`mac`); sums wrap at 56 bits (saturation mode off) | no product bit lost |
| A write's product | scales A limited to a word (`mpy x0,y1`); select 01 adds the full A | it may scale the full A |
| B, M | words: a read latches its word, a write the word it stores (the input at 0x5e) | word-wide latches |
| Coefficient | c / 2048 exactly (`x0 = c << 12`) | as the README reads it |
| Input, output | floor((L + R) / 2) at step 0x5e; the words read at 0x00 (left) and 0x5f (right), wet only | not the original's converters |

**Against the float model** (`tools/qv.mjs`, 2 s, `check_model.py`, tolerance -80 dBFS): an impulse and noise at 0.1, where no store
saturates. The largest difference is 1-3 LSB (-130 to -138 dBFS) for 40 and 41, 19-20 LSB (-113 dBFS) for 76 and 77,
and 51 LSB (impulse) and 243 LSB (noise, -91 dBFS) for SKANK GUITAR. With 32-bit words
(`--frac 31`) SKANK's differences fall to 0.6 and 1.0 LSB, so they are truncation that its resonant filters amplify,
not a different program. Noise at 0.3 drives A past full scale at about 100 writes in 2 s (584 in 77); in the delays
that reaches the output by 3 LSB at most, in 56, 76 and 77 by up to -54, -39 and -28 dBFS, where the two models part by
design. Finding for the word-width question, measured with `--frac 15`: with 16-bit words SKANK's difference grows to
-46 dBFS on noise at 0.1, only about 19 dB below its output's peak.

**Cycles a sample** (interlock_scan's model on the traced proc, one instance, 16-frame blocks):

| Program | Body | Body stalls | Whole proc |
| --- | --- | --- | --- |
| 40, 41 delays | 213.0 (211 instructions) | 2.0 | 225.4 |
| 56 SKANK GUITAR, 76 VELOCITY ECHO+ | 212.9 (209) | 3.9 | 225.4 |
| 77 VELOCITY ECHO- | 214.0 (211) | 3.0 | 226.4 |

The whole proc adds about 12.5: the (L+R)/2 pass, the state saved and restored a call, the loop. Across all 90
programs' snapshots the body prices at 164-231 cycles (median 205), where `tools/qvc_price.py` estimated 274-328
(median 306) for the steps. The difference: steps nothing uses are left out (a read with no product, latch or output;
a store no read reaches); a read's word is fetched ahead of the stores before it, into the last product's free Y slot,
unless it reads one of them at delay 0; and a reload that needs an instruction of its own goes where it fills the
stall of a move of A after the instruction computing it, at least three instructions before its chain's next access.
Without that scheduling (`verify.py --plain`) the delays cost 267 (25 arith and 21 AGU stall cycles). Add the stream
copy and table rewrites of the estimate above (about 30-80) and the engine stays well under 400.

**The code as built** differs from "The step code" above in these details: `n7` holds the input word (loaded at the
sample's start, before the left output overwrites its slot); `r0` and `r1` walk the left and right slots (`n0 = n1 =
2`) after a pass that writes (L+R)/2 into each left slot; the last coefficient fetch is `x:(r2)+n2` and the last reload
`y:(r3)+n3`, which close both tables for the next sample; the distance table sits in Y right after the ring.

**Simplified or not done:**
- Static programs only: no table rewrites (sweeps, pitch, Leslie), and no stream: only programs whose lines fit the
  buffer. A moving program's dead-step test must hold for every value its coefficients take.
- init clears the whole ring in one loop and writes both tables from immediates; on a unit the base writes the code and
  tables at a pick, and the clear has to be spread over calls (Midiverb clears 512 words a call).
- No knobs: wet only, no mix or level.
- proc leaves r6 (the parameter page) changed, as Vibrato does (the dispatcher reloads it).
- The second instance's buffer (Y:0x8000) is set by the gate: the synthetic image hands every allocator entry 0x4000.

## Not settled

- **Word width and saturation.** The engine stores 24-bit words in the DSP ring; the stream carries 16 bits. Whether
  to round every store to 16 bits (about 1 cycle a write) for one behaviour throughout is open. Either way it is an
  assumption, labelled as one: nothing records the original's width. SKANK GUITAR's resonant filters amplify
  truncation (above): with 16-bit words the integer model departs from the float model by -46 dBFS on quiet noise.
- **The gate's detector:** an envelope on the DSP, threshold and time constant assumed (README, "The gate").
- **Bit-exactness** of a moving program: the sweeps' table rewrites in the same model, then a reverb through the
  stream.
