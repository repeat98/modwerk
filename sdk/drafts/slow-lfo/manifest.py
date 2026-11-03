"""SLOW LFO -- MULT 1/2X, 1/4X and 1/8X on the audio and MIDI tracks' LFOs.

Stock routines changed: the LFO engine's rate step and MULT load, in the
audio engine (0x4000cfa8) and its MIDI copy (0x40003c0e); the MULT count of
both LFO pages (7 -> 10); the shared MULT formatter. MULT 0..6 run stock's
code unchanged. 7, 8 and 9 shift the engine's per-pass step right by 1, 2
or 3 and skip stock's left shift, so they run at 1/2, 1/4 and 1/8 of 1X,
still from the project tempo. unit.s has the ground.
"""

import os

from remix.schema import Category, Proof, Gate, Detour, Kind, Linked, Module, Poke
from remix.stock_guard import stock_guard

_HERE = os.path.relpath(os.path.dirname(os.path.realpath(__file__)))

RATE = "c678245d7ce37e6e2015c6afd77586647e4256e7c6fe6a3a19becaf6a72a3c4e"   # mulsl %d3,%d6; movel #8657,%d0
MULT = "276d922e3f6a8ee67c6753d8daa4ad043ec1302312c00e3666359a8271bde460"   # mvzb 0x24(a2,d2.l),%d4; cmpl %d3,%d6
COUNT = "1561ade0621c5acf44b780521f95a1e0b19b4e5032945b860c4032fc28a3a23b"  # u32 7

MODULE = Module(
    name="slow-lfo",
    key="SLOW LFO",
    kind=Kind.CF_PATCH,
    doc="LFO MULT gains 1/2X, 1/4X and 1/8X on audio and MIDI tracks: LFOs up to eight times slower.",
    category=Category.MACHINES, author="nathangroth", author_url="https://github.com/nathangroth",
    proof=Proof.UNTESTED, proof_note="ot_emu, stock 1.40C with the unit preloaded, 2 Nov 2026 (verify.py); not yet run on a unit.",
    linked=(Linked("slow_lfo", os.path.join(_HERE, "unit.s"), dram=True),),
    detours=(
        Detour(0x4000CFB0, stock_guard(0x4000cfb0, 10, RATE), "slow_lfo", "sl_rate_audio",
               "audio LFO engine rate step: MULT 7-9 shift SPD x tempo right by 1-3", kind="jmp", pad_to=10),
        Detour(0x4000CFD6, stock_guard(0x4000cfd6, 6, MULT), "slow_lfo", "sl_mult_audio",
               "audio LFO engine MULT load: 7-9 shift the wrap count by 0", kind="jmp"),
        Detour(0x40003C16, stock_guard(0x40003c16, 10, RATE), "slow_lfo", "sl_rate_midi",
               "MIDI LFO engine rate step: as the audio engine's", kind="jmp", pad_to=10),
        Detour(0x40003C3C, stock_guard(0x40003c3c, 6, MULT), "slow_lfo", "sl_mult_midi",
               "MIDI LFO engine MULT load: as the audio engine's", kind="jmp"),
        Detour(0x4003BDA4, stock_guard(0x4003bda4, 6, "dc3fa25b517cf6f05c537857b0b95f8f0d59d4b7f8a6a811f3a52d309ef83c43"),
               "slow_lfo", "sl_format", "MULT formatter (both LFO pages): 7-9 print 1/2X, 1/4X, 1/8X", kind="jmp"),
    ),
    pokes=(
        Poke(0x400D38B0, expect=stock_guard(0x400d38b0, 4, COUNT), write=(10).to_bytes(4, "big"),
             note="audio LFO page MULT count 7 -> 10"),
        Poke(0x400D421C, expect=stock_guard(0x400d421c, 4, COUNT), write=(10).to_bytes(4, "big"),
             note="MIDI LFO page MULT count 7 -> 10"),
    ),
    gates=(Gate("modules/slow-lfo/verify.py", remix_arg=False),),
)
