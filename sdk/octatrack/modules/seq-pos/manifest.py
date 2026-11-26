"""SEQ POS -- sequencer position as LFO PMTR destination SPOS (index 37).

USB (MOP-48 / MOP-61): runtime.json contributes sp_lfo_pmtr to ot_lfo_pmtr_dest
(order 80). Alone-sink count/formatter/beq/lea are base-owned after #21/#23/#25.

MOP-73: after_store arms address mode; Detour sp_audio_step at 0x400a2d6a
(playmodes class) remaps the tick audio step. Conflicts with playmodes.
MOP-195: toast builders + module_key/module_enc in runtime.json (USB tip;
no private Detour). Catalog-pinned MOP-248 under sdk/octabam/modules/seq-pos/.
"""

import os

from remix.schema import Category, Detour, Proof, Gate, Kind, Linked, Module
from remix.stock_guard import stock_guard

_HERE = os.path.relpath(os.path.dirname(os.path.realpath(__file__))).replace("\\", "/")

MODULE = Module(
    name="seq-pos",
    key="SEQ POS",
    kind=Kind.CF_PATCH,
    doc="Sequencer position as LFO PMTR destination SPOS (index 37); audio_step remap.",
    category=Category.MACHINES,
    author="jonathanwardle1992-beep",
    author_url="https://github.com/jonathanwardle1992-beep",
    proof=Proof.UNTESTED,
    proof_note=(
        "Guards filled from local 1.40C. MOP-73: sp_on_store arms enable; "
        "Detour 0x400a2d6a → sp_audio_step (same stock_guard as playmodes). "
        "MOP-61 lea-free contribute (SPOS 37). Conflicts: playmodes. "
        "Catalog-pinned MOP-248; jump-colour Unproven/waived mop243."
    ),
    linked=(Linked("unit", f"{_HERE}/unit.s", cpu="5475", dram=True),),
    detours=(
        Detour(
            0x400A2D6A,
            stock_guard(0x400A2D6A, 6, "1cb5e6a4478a2248b033baac126f63d4930860b767556518139cf5f717c08433"),
            "unit",
            "sp_audio_step",
            "tick audio step load → address remap when SPOS enabled (playmodes class)",
        ),
    ),
    gates=(Gate("modules/seq-pos/verify.py", remix_arg=False),),
)
