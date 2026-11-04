from remix.stock_guard import stock_guard
"""TRACK_MUTES -- PERSONALIZE -> TRACK MUTES checkbox: empty (stock T selects,
FUNC+T mutes) or ticked (T mutes/unmutes, FUNC+T selects the track).

Default empty, so installing the module changes nothing until the musician
ticks it. CUE+T stays stock.

Stock T1-T8 keys call 0x40040250. Type 1 ends at 0x400402aa jmp 0x40083ab4
(select). 0.1.0 inverted FUNC_HELD around 0x40040250; X did nothing.
0.1.1 toggled mute on T; FUNC+T stayed on T1. 0.1.2 wrote 0x80000035
(LEVEL's track) so FUNC+T highlighted but knobs still edited T1. 0.1.3
jsr'd 0x400837f8 (wrong: file offset, not runtime 0x40083bf8) so knobs
stayed on T1, and only two T keys muted at once because type-1 jmp is
not the per-key entry. FUNC+T is not 0x40040250: the FUNC-layer keymap sends T1-T8 to
0x40083dfc. 0.1.4-0.1.7 never hooked that, so FUNC+T never selected and
the page editor stayed on T1. 0.1.8 hooked 0x40083dfc for select.
FUNC+REC1/REC2 create the recorder-buffer page unless MIDI_MODE is set
(0x40033970 at 0x4002fec8). 0.1.26 continues that create on the MIDI
TRACKS page. 0.1.25 hooked the pickup toggle; that is not FUNC+REC.
With X, T-alone no longer double-taps into the sample slot list.
0.1.27-0.1.28 entered 0x40083ab4 (MIDI UI / 0x40044920). 0.1.29 jsr's
0x400791e4 after FUNC+T select; on T8 MASTER that overlay is the MASTER
TRACK title and hold re-ran TRACK_PAGES. 0.1.30 selects on press only
and skips that overlay for T8 in MASTER mode. 0.1.31 jsr's 0x40078850
and 0x4002f2f8 so AED's waveform follows FUNC+T. T8 mute eor's bit 15
without stock 0x4007c428 coupling.

PERSONALIZE: a stock checkbox (glyphs 0x15 empty / 0x16 ticked). The
setting is tm_setting in this module, not Mute Modes' battery word
0x800000dc (and not 0x800000d8, which Direct Jump used). It resets to
empty on boot until the base settings store exists. The PERSONALIZE
pointer arrays are still the same tables Mute Modes grows, so the two
cannot share a build until ot_personalize_rows (#1023) lands; this
module does not retarget those sites while that pull request is open.
Input 0x40068fd0: YES wrap=1, LEFT/RIGHT/cursor wrap=0. The JSON names
mute-modes and playmodes in conflicts. Play Start is not listed yet.

No DSP code, no effect slot, no project bytes: a project saved with the
module loads unchanged on stock (the setting is PERSONALIZE, not the
project).
"""

import os

from remix.schema import Category, Detour, Gate, Kind, Linked, Module, Poke, Proof, TableGrow

_HERE = os.path.relpath(os.path.dirname(os.path.realpath(__file__))).replace("\\", "/")
H = bytes.fromhex

LABELS, GETTERS, SETTERS = 0x400b2a34, 0x400b2a74, 0x400b2ac0
COUNT_AT = 0x40068fb2
TRACK_KEY = 0x40040250
FUNC_TRACK = 0x40083dfc
UI_JSR = 0x4005227e
TRIG_JMP = 0x40060cfc
REC_CREATE = 0x4002fec8

MODULE = Module(
    name="track-mutes",
    key="TRACK MUTES",
    kind=Kind.CF_PATCH,
    category=Category.MACHINES,
    author="jonathanwardle1992-beep",
    author_url="https://github.com/jonathanwardle1992-beep",
    proof=Proof.UNTESTED,
    proof_note="0.1.33 is not flashed. 0.1.32 card: FUNC+T AED follow reported by one tester; that card does not include the register save, gated FUNC+REC, or the move off Mute Modes' battery word. USB Keep/Undo and ot_emu untested.",
    doc="PERSONALIZE -> TRACK MUTES checkbox: empty keeps stock T=select / FUNC+T=mute; ticked makes T mute and FUNC+T select.",
    linked=(
        Linked("trackmutes", _HERE + "/trackmutes.s"),
    ),
    detours=(
        Detour(
            TRACK_KEY,
            stock_guard(TRACK_KEY, 6, "d6c9f1f60272197a17511f496fc19dd21ddd7df5f1f1ec0cab7a16cad60b0609"),
            "trackmutes",
            "tm_track_key",
            "T1-T8 without FUNC: mute on first down when X",
            kind="jmp",
        ),
        Detour(
            FUNC_TRACK,
            stock_guard(FUNC_TRACK, 6, "20577862965e35b56da3cc4660ac5df6a325e455467496552d181b68fff15e2d"),
            "trackmutes",
            "tm_func_track",
            "FUNC+T1-T8: select; FUNC+double-tap T: sample list when X",
            kind="jmp",
        ),
        Detour(
            UI_JSR,
            stock_guard(UI_JSR, 6, "80e3b3bacf0a340cfa364a60bf1e721328e12778ebf4e28c005054d306ca3438"),
            "trackmutes",
            "tm_ui",
            "After 0x4009b290/0x40022c00: apply T and QUICK MUTE chords",
            kind="jmp",
        ),
        Detour(
            TRIG_JMP,
            stock_guard(TRIG_JMP, 6, "24a4ac4652b0df33c702278d799161373e773858168f015ce11c8ae2bd116826"),
            "trackmutes",
            "tm_trig",
            "QUICK MUTE: latch trig 0-15 presses when X",
            kind="jmp",
        ),
        Detour(
            REC_CREATE,
            stock_guard(REC_CREATE, 6, "afb1e03ec6dcf9b775885009ac3ef7c41009b3b69c2c95a8f9de39127fa6723a"),
            "trackmutes",
            "tm_rec_midi",
            "FUNC+REC1/REC2: still open recorder buffers on the MIDI TRACKS page",
            kind="jmp",
        ),
    ),
    tables=(
        TableGrow("PERSONALIZE labels", LABELS, 16, (("trackmutes", "lbl_trackmutes"),),
                  ((0x40068efe, LABELS),), insert_at=2),
        TableGrow("PERSONALIZE getters", GETTERS, 16, (("trackmutes", "get_trackmutes"),),
                  ((0x40068f0a, GETTERS),), insert_at=2),
        TableGrow("PERSONALIZE setters", SETTERS, 16, (("trackmutes", "set_trackmutes"),),
                  ((0x40069022, SETTERS), (0x4006903e, SETTERS), (0x40069056, SETTERS)),
                  insert_at=2),
    ),
    pokes=(
        Poke(COUNT_AT, stock_guard(COUNT_AT, 2, "5dd82fd23ac20130aebe3391a4c9a9fda6ca01bd143223a558ec253b65083dfd"), H("7210"),
             "PERSONALIZE rows 15 -> 16 (MKI), 16 -> 17 (MKII): + TRACK MUTES"),
    ),
    gates=(Gate("modules/track-mutes/verify.py", remix_arg=False),),
)
