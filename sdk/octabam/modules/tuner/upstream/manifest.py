"""TUNER -- a guitar-tuner readout of the current audio track.

UP held + TEMPO opens a window (the TEMPO window's class, so the two
evict each other) that prints the note, octave, cents and a needle for
whatever the current audio track is playing, post-FX pre-fader, from the
read-back arena the USB AUDIO producer reads too. TEMPO alone, FUNC +
TEMPO (tap tempo) and UP alone stay stock; the window closes with TEMPO,
YES, NO or UP + TEMPO again, the stock TEMPO window's keys.

A DRAM unit (tuner.s) with three detours: the TEMPO opener's first
instruction (the chord), frame_isr's tail (16 mono samples a block into a
4,096-sample ring while the window is open, nothing when it is closed),
and the UI task's loop head (the analysis and the redraw, ~7 times a
second, in the UI task, never in the interrupt). The detector is McLeod's
normalised square difference at 11,025 Hz refined by the YIN difference
at 44,100 Hz, integer only (no EMAC). README.md has what was measured.
"""
import importlib.util
import os

from remix.schema import Detour, Kind, Linked, Module

_HERE = os.path.relpath(os.path.dirname(os.path.realpath(__file__)))
# The displaced bytes of each hook are read from the build's own MAIN OS section (stock_guard.py, the same
# reader the synth, quantizer and sy-drum modules carry): no stock bytes in this file.
_guard_spec = importlib.util.spec_from_file_location("tu_stock_guard", os.path.join(_HERE, "stock_guard.py"))
_guard_module = importlib.util.module_from_spec(_guard_spec)
_guard_spec.loader.exec_module(_guard_module)
stock_guard = _guard_module.stock_guard

TEMPO_OPEN = 0x40059EF0          # the TEMPO key's press handler (keymaps 0x400bfc10 / 0x400c01f4, code 0x18)
FRAME_TAIL = 0x4000D99A          # frame_isr: the store of d1 to 0x80004800, the instruction before USB AUDIO's site 0x4000d9a0
UI_LOOP = 0x40056C72             # the UI task 0x40056c40: the push of 0x460d1664 before every queue_receive

MODULE = Module(
    name="tuner",
    key="TUNER",
    kind=Kind.CF_PATCH,
    doc="UP + TEMPO: a tuner window for the current audio track -- note, octave, cents, needle, Hz "
        "(McLeod NSDF + YIN refine on the ColdFire, in the UI task).",
    linked=(Linked("tuner", os.path.join(_HERE, "tuner.s"), cpu="5475", dram=True),),
    detours=(
        Detour(TEMPO_OPEN, stock_guard(TEMPO_OPEN, 6), "tuner", "tu_tempo",
               "TEMPO opener: with UP held the tuner toggles instead of the stock TEMPO window"),
        Detour(FRAME_TAIL, stock_guard(FRAME_TAIL, 6), "tuner", "tu_frame",
               "frame_isr tail: the current track's 16 mono samples a block into the tuner's ring while its window is open"),
        Detour(UI_LOOP, stock_guard(UI_LOOP, 6), "tuner", "tu_tick",
               "UI task loop head: every 400 blocks with the window open, analyse the ring and redraw"),
    ),
)
