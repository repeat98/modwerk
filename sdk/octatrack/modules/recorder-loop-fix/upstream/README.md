# `recorder-loop-fix` — RECORDER LOOP FIX

A FLEX track that plays its own recorder buffer every bar (the
self-recording loop, or sound-on-sound with SRC3 = the track) clicks at the
loop point at any tempo whose bar is not a whole number of samples: 82,687.5
at 128 BPM. The sequencer arms the recorder at `floor(k × 82,687.5)`, so the
arms are alternately 82,687 and 82,688 samples apart. Four faults sit on
that. Each has its own caves in this module.

## 1. Every bar restarts the voice

**Fault.** On a re-trig of the same recorder buffer, the bind routine
(`0x4000f450`) finds the same slot, type and generation, but its position
compare fails, so it reports a new note. The DSP re-primes the voice: a
chirp, then hash at 140 % of the signal for about 300 samples.

**Fix.** `seekbind.s`, hooked at `0x4000f8cc`: when slot, type and
generation match, the bind takes the same-sample path, and the DSP seeks the
running voice.

## 2. The read pointer resets

**Fault.** The same-sample path still increments the voice's per-bind
counter (`+0x90`). The frame builder reads that as a new voice and resets
the read pointer: a ±1.5-sample seam at the loop point.

**Fix.** `seekbind_ctr.s`, hooked at `0x4000f834`: on a same-sample re-bind
the counter is left alone.

## 3. One input sample is lost on alternate passes

**Fault.** The length converter (`0x40006dfc`) gives every pass the same
length, 82,687 samples at 128 BPM / RLEN 16. On the passes where the next
arm comes 82,688 samples later, one input sample is never recorded, and the
wrap joins two moments two samples apart: a −26 dB, ~1 ms scuff on
alternate bars.

**Fix.** `spacing_cave.s`, hooked at `0x40006e0c`: each pass is exactly as
long as the gap to the next arm, computed from the current arm:

    q, r = divmod(RLEN × 15,876,000, tempo24)
    k    = arm / q
    L'   = q + floor((k+1)·r / tempo24) − floor(k·r / tempo24)

## 4. Sound-on-sound plays a zero

**Fault.** With a REC3 trig (SRC3 = the track) on the step of the PLAY
trig, the voice plays the previous pass. Its window is the current arm
spacing and its content the previous pass's length, so on every other pass
the window is one sample longer than the recording. That sample plays as a
zero, and SRC3 records it back into the loop. The zero comes from two
places:

- The fetch of index END (`+0x64`) finds no block and returns the empty pool
  base.
- After a second transport start (PLAY again, or PLAY after CONTROL >
  MEMORY reallocates the recorders), the recording stays 82,687 samples on
  every pass, and the recorder is past END when the voice reaches it. The
  copy loops cap a voice reading the buffer its own recorder writes at
  END − index. At END that cap is 0, so the voice is stopped and the rest of
  the frame is zero-filled.

**Fix.** The last sample is repeated instead.

- Three fetch caves (`hold_copy.s`, `hold_xfade_a.s`, `hold_xfade_b.s`, with
  `fix.inc`), hooked at `0x400086c2`, `0x4000853e` and `0x4000854e`: an
  empty fetch of END becomes a fetch of END − 1 with a count of one.
- Two guard caves (`hold_guard.s`, `hold_xguard.s`), hooked at `0x40008716`
  (plain copy) and `0x400085d8` (crossfade copy): at END, the copy takes
  one sample from END − 1 instead of stopping the voice.

A loop whose period is not a whole number of samples still gains or loses
one sample at each wrap. In sound-on-sound the repeated sample is recorded
into the loop and replays until the next skip removes it.
