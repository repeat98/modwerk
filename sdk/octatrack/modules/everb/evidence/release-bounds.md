# E-Verb release resource bounds

## 0.1.2-experimental

0.1.2 shortens the delay ring to 15,870 words (modulus `$3dfd`) and keeps its
start-up clear inside it: of 0.1.1's 128 dry calls, the first four now clear
nothing and the last 124 clear 128 words each, and `m4` goes back to linear
before that path returns. The pre-delay keeps 0.1.1's law but is clamped at
5,008 samples (227 ms), and the reverse rate at the same point (issue #696). The
per-frame loop changes only in immediate constants, so both sample arms keep
their 468 and 382 modeled cycles, and the static census in TESTING.md gives the
same 468.

- **Cycle bound, recomputed.** The program is 1,602 words (`verify.py` placement).
  Charging it once per call, less the 468 sample words, gives 1,134 words. The 24
  `bsr` sites and the longest helper (`ev_usn`, 34 words) are unchanged: 816. Both
  clearing loops still run 132 and 128 iterations: 516. The union is
  `1,134 + 816 + 516 = 2,466`, which still rounds up to **2,560 modeled
  cycles/call**. The block bound is unchanged: `8 * (468 + 382) + 2 * 2,560 =
  11,920` per instance and **47,680/core/block** against 49,920, leaving 2,240.
- **Memory.** The OS still gives every FX2 instance its 16,384 Y words; E-Verb uses
  the first 15,870 and never touches the last 514, which Sidechain Compressor uses
  on T3 and T7. Per instance stays `256 * 3 + 16,384 * 3 = 49,920` bytes. Shared:
  two 1,602-word P programs (9,612 bytes), the 24-byte stack reservation, the
  416-byte descriptor and the 52-byte REV formatter: **10,104 bytes**. Eight
  instances total **409,464 bytes**.

The rest of this file is 0.1.0's accounting; 0.1.1 changed only descriptor words.

## 0.1.0-experimental

Native source: PR #376 at `e3047c0d9eb7bb150c003a86414886b22d8992f2`.
MAIN OS SHA-256: `b776efe203efecd0ceda90f68d7fe109cc8fc13a1f07bed00303f81af2769195`.
The release moves the module and adds metadata; its DSP, generator, native manifest,
render gates and performance runner are unchanged from that tested image.

### Software cycle upper bound

Basis: 44.1 kHz, 16 frames/block, eight FX2 instances, four per core.
The original 468 modeled cycles/sample prices only the dearer sample arm; it is
not a full-call bound and is not measured silicon timing. Both arms strictly
alternate, with the phase retained across split calls. An even 16-frame block
therefore costs at most `8 * (468 + 382) = 6,800` modeled sample-loop cycles.

For each call, conservatively charge the entire 1,588-word assembled program
once, excluding only 468 words already charged as sample work: 1,120 words.
This deliberately retains the other audio arm and every mutually exclusive
knob group. Charge all 24 `bsr` sites again at the largest complete helper's
upper word bound. The longest helper, `ev_usn` including both branches, contains
17 instructions, each at most two words: `24 * 34 = 816` extra words.
Charge both fixed clearing loops at two words per iteration, beyond the first
iteration already charged: `2 * (132 - 1) + 2 * (128 - 1) = 516`.
There are no recursive/nested helper calls, sample-loop helper calls, or other
backward loops outside the already priced sample loop. Thus the union bound
is `1,120 + 816 + 516 = 2,452`, rounded up to **2,560 modeled cycles/call**.
Charging init on both calls also covers initialization once per block.

Two calls per block cover a trigger split. The per-instance block bound is
`6,800 + 2 * 2,560 = 11,920`; four instances cost **47,680/core/block**.
The SDK module allowance is `3,120 * 16 = 49,920`, leaving 2,240 modeled cycles.
The original stock/scheduling reserve is kept outside this module allowance.
This is a conservative code-word model, not a whole-instrument contention or
wall-clock guarantee. Extra custom companion effects must fit the remaining
budget separately; arbitrary maximum-load combinations are not qualified.

Commands: `python3 modules/everb/generate.py --check`,
`python3 modules/everb/verify.py` (including the no-op loop marker proof),
and the source census `rg -n '\b(do|rep|bsr|jsr)\b' modules/everb/everb.asm`.
See TESTING.md for original tool versions, parameter matrix, dirty/init tests,
audio-input gates, matched stock instruction benchmark and eight-instance stress.
The owner reports a functional MKII audition separately. Chip bus contention,
maximum simultaneous streaming/USB/MIDI load and hardware canaries are unmeasured.

### Exact reserved memory

The original report inventories used X state. This release additionally counts
the unused 124-word remainder of the existing 256-word stock X instance block.
Per instance: `256 * 3 + 16,384 * 3 = 49,920` bytes, including 15 unused Y words.
Shared: two 1,588-word P programs (9,528 bytes), the conservative 24-byte stack
reservation on both cores, a 416-byte FX2 descriptor and 52-byte REV formatter:
**10,020 bytes**. Eight instances total **409,380 bytes**.

DSP numbers are logical 24-bit words; descriptor/formatter/stack counts use byte
accounting. This reuses stock instance buffers and dispatcher stack. There is
no authored heap, extra SDRAM allocation, ColdFire executable/callback or dynamic
allocation. Fixed-point tables are inline program immediates, already in P code.
The source leaves init registers r1/n1/m1 unchanged. The existing eight-instance
guard/dirty tests cover software isolation; they do not claim hardware canaries.
