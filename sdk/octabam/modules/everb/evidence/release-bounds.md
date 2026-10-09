# E-Verb 0.1.0-experimental release resource bounds

Native source: PR #376 at `e3047c0d9eb7bb150c003a86414886b22d8992f2`.
MAIN OS SHA-256: `b776efe203efecd0ceda90f68d7fe109cc8fc13a1f07bed00303f81af2769195`.
The release moves the module and adds metadata; its DSP, generator, native manifest,
render gates and performance runner are unchanged from that tested image.

## Software cycle upper bound

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

## Exact reserved memory

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
