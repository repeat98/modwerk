from remix.stock_guard import stock_guard
"""RECORDER LOOP FIX -- the recorder loop click: eight ColdFire caves, no DSP
code, for a FLEX voice playing its own recorder buffer every bar.

At a tempo whose bar is not a whole number of samples (82,687.5 at 128 BPM)
the sequencer arms the recorder at floor(k x period), 82,687 and 82,688
samples apart, while stock records one constant length. Four faults sat on
that, one cave group each (README.md, "The caves"):

- seek bind (seekbind.s, hook 0x4000f8cc): a same-slot/type/generation
  FLEX re-bind takes the bind's same-sample path, so the DSP seeks the
  running voice instead of re-priming it as a new note (a chirp, then hash
  at 140 % of the signal over 300 samples).
- seek-bind counter (seekbind_ctr.s, hook 0x4000f834): on that re-bind the
  voice's per-bind counter (+0x90) is left alone, so the frame builder does
  not re-send the voice as new (a +/-1.5-sample seam).
- spacing (spacing_cave.s, hook 0x40006e0c): a fixed-RLEN recording is
  exactly as long as the gap to the next arm, L' = q + floor((k+1)r/D) -
  floor(k r/D) with q, r = divmod(RLEN x 15,876,000, tempo24) and
  k = arm/q, from the current arm alone (a -26 dB, ~1 ms scuff on
  alternate bars).
- hold (hold_*.s + fix.inc, five hooks): in sound-on-sound the voice plays
  the previous pass; where its window is one sample longer than the
  recording, the sample past END is the last one repeated instead of a zero
  (the three fetch caves when the fetch past END comes back empty; the two
  guard caves where the copies' cap on a buffer being recorded into would
  stop the voice and zero-fill, after a second transport start).

On hardware: the first three as OCTABAM83 (Sam's MKII, 12 Sep 2026, the
self-recording loop); all eight as Bryan T's sos-capture BUILD=95
(3 Oct 2026, sound-on-sound). Formerly four modules: FLEX SEEK BIND,
FLEX SEEK BIND CTR, RECORDER SPACING, RECORDER HOLD.

Assemble (from the repo root, for the .include): `m68k-elf-as -mcpu=5475
-o x.o modules/recorder-loop-fix/<cave>.s`; the build re-assembles each
cave and compares against the pinned bytes below. objdump prints every
divu.l in spacing_cave.s as `remul` (0x4c4x is one encoding family, named
after the remainder form); with the extension's Dq and Dr fields equal,
ColdFire writes the quotient.
"""

from remix.schema import Category, Proof, CavePatch, Kind, Module

SEEKBIND_HOOK = 0x4000f8cc

SPACING_HOOK = 0x40006e0c

SPACING_CAVE_BYTES = bytes.fromhex("28005284e2844fefffd848ef030f00102239800018140c81000002d0650000c60c8100001c20620000bc20044c010000068000791fd0243c00f23fa04c420000670000a20c8000000040620000984c02000026004c4100006700008a24004c01000096806700006c2f430004202f00b4e58841f946c7fa84203008002e804c4200002f40000c610000684c420000262f000c96802f43000c20034c020000261796802e83202f000c528061000044d082b0976200000652af000c202f000c610000302e80202f000c5280610000249097d4802002908452800c80000000026200000428024cef030f00104fef00284e7522404c410000262f00084c0300002040200926004c4130034c0130009083262f00084c0300004c410000d0884e75")

MODULE = Module(
    name="recorder-loop-fix",
    key="RECORDER LOOP FIX",
    kind=Kind.CF_PATCH,
    category=Category.FIXES, author="sambanks", author_url="https://github.com/sambanks",
    proof=Proof.HARDWARE,
    proof_note="OCTABAM83, 12 Sep 2026 (self-loop); Bryan T's MKII, sos-capture BUILD=95, 3 Oct 2026 (sound-on-sound)",
    doc="ColdFire caves: the recorder loop click -- seek on a same-sample FLEX re-bind, keep its "
        "counter, record exactly the arm spacing, and repeat the last sample where sound-on-sound "
        "would play a zero.",
    cf_patches=(
        CavePatch(
            label="seek-bind cave",
            cave_addr=None,
            pinned=bytes.fromhex("4a2f003b670a7001588f4ef94000f8ec588f4ef94000f8ea"),
            source="modules/recorder-loop-fix/seekbind.s",
            hook_addr=SEEKBIND_HOOK,
            hook_stock=stock_guard(SEEKBIND_HOOK, 6, "a3f764639ca07534cc4150642deaf4f10c519053b868df0cd3e051af427b7f60"),
            report_note=" (same-sample re-bind -> seek path)",
        ),
        CavePatch(
            label="seek-bind counter cave",
            cave_addr=None,
            pinned=bytes.fromhex("4a2f003b660452aa0090254800984e75"),
            source="modules/recorder-loop-fix/seekbind_ctr.s",
            hook_addr=0x4000f834,
            hook_stock=stock_guard(0x4000f834, 8, "394be08d1b375089ffcb34270ce0bb194ed6769a3fcbe7d56c656c6db976d6ac"),
            report_note=" (same-sample re-bind keeps +0x90)",
        ),
        CavePatch(
            label="spacing cave",
            cave_addr=None,
            pinned=SPACING_CAVE_BYTES,
            source="modules/recorder-loop-fix/spacing_cave.s",
            hook_addr=SPACING_HOOK,
            hook_stock=stock_guard(SPACING_HOOK, 6, "3b77fc06791be946482421e53ffef0821264bef53b186b831a0a6505d56d79cb"),
            report_note=" (fixed-RLEN length := the next arm's spacing, from the current arm)",
        ),
        CavePatch(
            label="hold cave (copy)",
            cave_addr=None,
            pinned=bytes.fromhex("225f206f0004508f6100000826004a814ed10c8040a955e0660000504a816f00004a4a2a00156c000042b1ea00646600003a538820086b00002c2f012f092f002f0a206effbc4e90508f225f0c8040a955e06700000e4a816f000008588f72014e75221f203c40a955e04e75"),
            source="modules/recorder-loop-fix/hold_copy.s",
            pool_base_literals=3,
            hook_addr=0x400086c2,
            hook_stock=stock_guard(0x400086c2, 6, "3378c72f1ed9109d2bd92f1e85e72150e10a4604376578dd792af4e59c10c0fc"),        # move.l d0,d3 / addq.l #8,sp / tst.l d1
            report_note=" (recorder voice at END reads END - 1, not the null block)",
        ),
        CavePatch(
            label="hold cave (crossfade, +0x48)",
            cave_addr=None,
            pinned=bytes.fromhex("225f206f00046100000c264028012f2a004c4ed10c8040a955e0660000504a816f00004a4a2a00156c000042b1ea00646600003a538820086b00002c2f012f092f002f0a206effbc4e90508f225f0c8040a955e06700000e4a816f000008588f72014e75221f203c40a955e04e75"),
            source="modules/recorder-loop-fix/hold_xfade_a.s",
            pool_base_literals=3,
            hook_addr=0x4000853e,
            hook_stock=stock_guard(0x4000853e, 8, "77fc999ca1fc167b277dc189315c0be0b8cfff81d92c4986a55d6127a37be354"),    # movea.l d0,a3 / move.l d1,d4 / move.l (76,a2),-(sp)
            report_note=" (as above, the crossfade copy's first read)",
        ),
        CavePatch(
            label="hold cave (crossfade, +0x4c)",
            cave_addr=None,
            pinned=bytes.fromhex("225f206f00046100000c2e004fef00104a844ed10c8040a955e0660000504a816f00004a4a2a00156c000042b1ea00646600003a538820086b00002c2f012f092f002f0a206effbc4e90508f225f0c8040a955e06700000e4a816f000008588f72014e75221f203c40a955e04e75"),
            source="modules/recorder-loop-fix/hold_xfade_b.s",
            pool_base_literals=3,
            hook_addr=0x4000854e,
            hook_stock=stock_guard(0x4000854e, 8, "a4c7b8c2e06be9c6dd682837e7d18743db2c2e38f748fac2ca1763b3079f8450"),    # move.l d0,d7 / lea (16,sp),sp / tst.l d4
            report_note=" (as above, the crossfade copy's second read)",
        ),
        CavePatch(
            label="hold cave (copy guard)",
            cave_addr=None,
            pinned=bytes.fromhex("588f93c0b3c26c00000424094a826e000040b3fc00000000660000364a816f000030202a006453806b0000262f012f002f0a206effbc4e90508f0c8040a955e06700000c4a816f00000626007401221f4ef94000871e"),
            source="modules/recorder-loop-fix/hold_guard.s",
            pool_base_literals=1,
            hook_addr=0x40008716,
            hook_stock=stock_guard(0x40008716, 6, "15734e36c99ed02a2dfcbc4e5f51363cbb71e4f4d4f87b8bfaeacc2f83df6f8b"),        # suba.l d0,a1 / cmpa.l d2,a1 / bge.s
            report_note=" (the copy's cap at END while the recorder writes the buffer: END - 1 once, not a stop)",
        ),
        CavePatch(
            label="hold cave (crossfade guard)",
            cave_addr=None,
            pinned=bytes.fromhex("588f9a80ba826c00000424054a826e0000604a856600005a4a846f0000544a816f00004e4a2a001766000046202a006453806b00003c2f012f002f0a206effbc4e90508f0c8040a955e0670000224a816f00001c2a2a0064baaa0048660000042640baaa004c660000042e007401221f4ef9400085e0"),
            source="modules/recorder-loop-fix/hold_xguard.s",
            pool_base_literals=1,
            hook_addr=0x400085d8,
            hook_stock=stock_guard(0x400085d8, 6, "b318906f923048d283a9c0b1db59cf11e1c592631a9d142296ed4708b2e7594e"),        # sub.l d0,d5 / cmp.l d2,d5 / bge.s
            report_note=" (the crossfade copy's cap at END, as above)",
        ),
    ),
)
