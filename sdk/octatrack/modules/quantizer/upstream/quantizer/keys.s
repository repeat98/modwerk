| SCALE QUANTIZER -- the paraphonic key mailbox (24 Sep 2026). GNU as, -mcpu=5475.
|
| What the CHROMATIC key hooks (quantizer.s qz_leg0/1/2) tell the synth's
| paraphonic engine (modules/synth/poly.s, a DRAM unit that reads these as OS
| absolutes, like the GLIDE byte): PINNED at KEYS_AT = 0x400d2cb0 (modules/
| quantizer/manifest.py), 45 bytes of the second zero run between the synth
| page cave (ends 0x400d2c6c) and the end of the run (the GLIDE byte lived at
| 0x400d2cdc until 26 Sep 2026; it is battery RAM now, quantizer.s NV_GLIDE).
|   qz_pkey[t]   the live key (index + 1) whose trig was just posted for track
|                t; the engine reads and clears it at the voice start, so a
|                start with 0 here is a sequencer trig;
|   qz_pmask[t]  the keys held on track t, bit = key index 0..24; the engine
|                releases a key's voices when its bit goes;
|   qz_clock     written by the engine at its first frame: the address of its
|                sequencer clock (ticks, ticks a step, frames a step -- poly.s
|                po_clock), which the live-record note-length hooks read
|                (0 until the engine has run);
|   qz_oct       the CHROMATIC octave of a synth track, -4..+4 (quantizer.s
|                qz_octkey steps it, qz_chrom reads it; 0 at boot, as stock's
|                word) -- here, at KEYS_AT + 44, since 26 Sep 2026, so the
|                engine can pitch a key the handler never posted (poly.s: the
|                same-scan sweep, QZ_OCT_AT). 45 bytes: the run ends at
|                0x400d2ce0.
        .text
        .global qz_pkey, qz_pmask, qz_clock, qz_oct
qz_pkey:
        .fill   8, 1, 0
qz_pmask:
        .fill   8, 4, 0
qz_clock:
        .long   0
qz_oct:
        .byte   0
