"""PROCESSOR LOAD -- how busy the ColdFire is making audio, as a
percentage in the stock TEMPO popup.

The frame interrupt (vector 0x41, every 16-sample block, 362.8 us at
44.1 kHz) is timed from its first instruction to its return with DMA timer
3, the free-running 132 MHz counter the stock OS already runs; the sum of
those durations over a quarter second, divided by the quarter second, is
the number the TEMPO popup shows at its top left: `47%`, `70%!` from 70 up,
`--%` while there is no fresh reading. With FUNC held the popup shows the
longest single block of the last quarter second instead, as a percentage
of one block (`W112`: a block that took 112 % of its 362.8 us).

One DRAM unit (loadmeter.s), four detours and one poke:
  * the vector install (0x4001fbf8, kind lea): main pushes `pl_isr`, an
    entry stamp in front of the stock handler, instead of the handler;
  * the frame interrupt's universal epilogue (0x4000d9a6, 10 bytes): the
    exit stamp, the running sum, the block count and the longest block,
    then the displaced restore and RTE;
  * the UI task's type-1 message path (0x40056c8a, 6 bytes, about 60
    times a second): the meter's tick -- the division, the text and the
    redraw run here, in the UI task, never in the interrupt;
  * the stock TEMPO draw (0x4004b528, 8 bytes): the stock body, then the
    meter's 18 x 6 px overlay;
  * one poke (0x4004b5b4) moving the TEMPO / EXT SYNC / PICKUP SYNC header
    down two pixels to leave the meter its band.
Timing starts at the first frame after stock's SYS startup flag
(0x460d180e) is set, so the boot logo's DTIM3 reset is never inside a
window. Nothing is saved, nothing writes a hardware register, the card or
a DSP. README.md says what the number means and what it cannot see.

Sam Banks's CF METER probe (octabam modules/cfmeter) found the two
interrupt sites and the DTIM3 method; the meter itself is the TEMPO meter
of the Octatrick diagnostic build (cfdiag loadmeter.s), stripped of
everything USB and diagnostic and made standalone.
"""

import os

from remix.stock_guard import stock_guard
from remix.schema import Category, Detour, Kind, Linked, Module, Poke, Proof

H = bytes.fromhex
# This module's own directory, relative to the build's cwd (octabam's repo root): the same
# file serves at modules/processor-load/ and at modules/processor-load/upstream/processor-load/.
_HERE = os.path.relpath(os.path.dirname(os.path.realpath(__file__)))

VECTOR_INSTALL = 0x4001FBF8      # main: `pea 0x4000aad0` -- the frame handler for vector 0x41
FRAME_EPILOGUE = 0x4000D9A6      # frame interrupt: `movem.l (sp),d0-a6; lea 252(sp),sp; rte`
UI_MESSAGE = 0x40056C8A          # UI task loop: `movea.l d6,a0; jsr (a0); tpf` (type-1 message path)
TEMPO_DRAW = 0x4004B528          # TEMPO popup draw: `link.w a6,#-24; movem.l d2-d4/a2,(sp)`
TEMPO_HEADER_Y = 0x4004B5B4      # TEMPO draw: `pea 0x25`, the header's y

MODULE = Module(
    name="processor-load",
    key="PROCESSOR LOAD",
    kind=Kind.CF_PATCH,
    category=Category.REFERENCE,
    author="timhastie",
    author_url="https://github.com/timhastie/octatrick-modules",
    proof=Proof.CHECK,
    proof_note="Built into octabam main 063a426 images (alone and in the octatrick remix) and run on the pinned "
               "ColdFire port, 8 Oct 2026: arms after a cold boot with the logo, reads at idle and while a project "
               "plays, FUNC shows the longest block; not yet flashed (README.md)",
    doc="The ColdFire's audio-interrupt load in the TEMPO popup (a quarter-second mean, '!' from 70 %, "
        "FUNC held: the longest block), timed on DMA timer 3; standalone, no USB.",
    linked=(Linked("procload", os.path.join(_HERE, "loadmeter.s"), cpu="5475", dram=True),),
    detours=(
        Detour(VECTOR_INSTALL, stock_guard(VECTOR_INSTALL, 6, "b98a3ef366f26b433178561b4c22bbaec2d64365154fc4a7a21f669d262bafa7"), "procload", "pl_isr",
               "frame vector install: an entry stamp in front of the stock handler", kind="lea"),
        Detour(FRAME_EPILOGUE, stock_guard(FRAME_EPILOGUE, 10, "60acbd38c2859ac73a63948d6c58796591fdbddd654799e50e88b0940be9a37a"), "procload", "pl_tail",
               "frame interrupt epilogue, every exit: the exit stamp, then the stock restore and RTE", pad_to=10),
        Detour(UI_MESSAGE, stock_guard(UI_MESSAGE, 6, "7e01b975b33c71e146c7e1b6a0205987c65a612933f3ad47f646e7c824a06b67"), "procload", "pl_ui",
               "UI task, type-1 message path: the meter's tick, then the stock countdown call"),
        Detour(TEMPO_DRAW, stock_guard(TEMPO_DRAW, 8, "328e35150f163e1db395dd08ce9248289e43dc8d5c619735742dbc3385f13808"), "procload", "pl_tempo_draw",
               "TEMPO draw: the stock popup, then the meter's overlay", pad_to=8),
    ),
    pokes=(
        Poke(TEMPO_HEADER_Y, stock_guard(TEMPO_HEADER_Y, 4, "5a2f3089a48fd2c6b89465f9d3c00c89f5f9765aba72e50734fc6a7f204cdc83"), H("48780023"),
             note="TEMPO / EXT SYNC / PICKUP SYNC header two pixels down: the meter's band above it"),
    ),
)
