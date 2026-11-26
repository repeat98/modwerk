"""BAR LED -- the tempo LED flashes green on the pattern's 1 while the
sequencer plays; every other flash stays stock red.

Stock routines changed: one call. The clock-message loop's beat flash,
`jsr set_led` at 0x40056f24 (set_led(38, 3): the tempo LED's red half),
goes through bl_flash, which turns LED id 38 into 39 (its green half) on
the first flash after the master step (0x800065b4) wraps, and on the first
flash after PLAY, then calls stock's set_led with the same arguments.
On an MKII (RGB lamps, #1680: id 39 alone never shows green there) it keeps
id 38 and sets that id's palette colour (0x40013368) to green for the flash
on the 1, and back to stock's red on the next. Stopped, nothing changes
(a green palette left from the last flash is set back to red). unit.s has
the ground.
"""

import os

from remix.schema import Category, Proof, Gate, Detour, Kind, Linked, Module
from remix.stock_guard import stock_guard

_HERE = os.path.relpath(os.path.dirname(os.path.realpath(__file__)))

MODULE = Module(
    name="bar-led",
    key="BAR LED",
    kind=Kind.CF_PATCH,
    doc="The tempo LED flashes green on the pattern's 1 while playing; the other beats stay red.",
    category=Category.MACHINES, author="nathangroth", author_url="https://github.com/nathangroth",
    proof=Proof.HARDWARE, proof_note="MKI, OS 1.40C: card build 2 Nov 2026 and over USB on the Modwerk beta base 4 Nov 2026 (reported, before the pause fix); gate: verify.py under ot_emu.",
    linked=(Linked("bar_led", os.path.join(_HERE, "unit.s"), dram=True),),
    detours=(
        Detour(0x40056F24, stock_guard(0x40056f24, 6, "2a8577452c3c276db1f0313a52ea148d53399396c3e003b4260e58a6ea89dec1"),
               "bar_led", "bl_flash",
               "tempo LED beat flash (set_led(38, 3)): green on the pattern's 1 while playing (MKI id 39, MKII id 38's palette)",
               kind="jsr"),
    ),
    gates=(Gate("modules/bar-led/verify.py", remix_arg=False),),
)
