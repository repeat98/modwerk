"""SCREEN OFF -- hold UP and tap NO to blank the panel until the same chord.

No stock site is patched. The Modwerk base already delivers every key and
every composed frame to the installed modules (runtime.json: module_key,
module_draw, module_tick). This unit takes only the NO that completes the
chord, and clears the frame while the blank is on. Audio, the sequencer,
MIDI and the lamps are untouched. UP alone and NO alone stay stock.

The unit is screen_off.s, the same decisions as screen_off.c. The host
gate runs the C. The author reports the chord on a MKII. An MKI is not tried.
"""

from remix.schema import Category, Gate, Kind, Linked, Module, Proof

MODULE = Module(
    name="screen-off",
    key="SCREEN OFF",
    kind=Kind.CF_PATCH,
    category=Category.FIXES,
    author="jonathanwardle1992-beep",
    author_url="https://github.com/jonathanwardle1992-beep",
    proof=Proof.UNTESTED,
    proof_note="Host gate on screen_off.c. The author reports the chord on a MKII.",
    doc="Hold UP and tap NO to blank the screen until the same chord. Other keys keep working.",
    linked=(
        Linked("screenoff", "modules/screen-off/screen_off.s"),
    ),
    gates=(Gate("modules/screen-off/verify.py", remix_arg=False),),
)
