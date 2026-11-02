"""BAR LED -- the tempo LED flashes green on beat 1 of every bar while the
sequencer plays; every other flash stays stock red.

Stock routines changed: one call. The clock-message loop's beat flash,
`jsr set_led` at 0x40056f24 (set_led(38, 3): the tempo LED's red half),
goes through bl_flash, which turns LED id 38 into 39 (its green half) on
every fourth beat counted from PLAY and then calls stock's set_led with the
same arguments. Stopped, nothing changes. unit.s has the ground.
"""

import os

from remix.schema import Category, Proof, Gate, Detour, Kind, Linked, Module
from remix.stock_guard import stock_guard

_HERE = os.path.relpath(os.path.dirname(os.path.realpath(__file__)))

MODULE = Module(
    name="bar-led",
    key="BAR LED",
    kind=Kind.CF_PATCH,
    doc="The tempo LED flashes green on the 1 of every bar while playing; the other beats stay red.",
    category=Category.MACHINES, author="nathangroth", author_url="https://github.com/nathangroth",
    proof=Proof.UNTESTED, proof_note="ot_emu, stock 1.40C with the unit preloaded, 2 Nov 2026 (verify.py); not yet run on a unit.",
    linked=(Linked("bar_led", os.path.join(_HERE, "unit.s"), dram=True),),
    detours=(
        Detour(0x40056F24, stock_guard(0x40056f24, 6, "2a8577452c3c276db1f0313a52ea148d53399396c3e003b4260e58a6ea89dec1"),
               "bar_led", "bl_flash",
               "tempo LED beat flash (set_led(38, 3)): id 39, green, on beat 1 of each bar while playing",
               kind="jsr"),
    ),
    gates=(Gate("modules/bar-led/verify.py", remix_arg=False),),
)
