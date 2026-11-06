"""TRACK SOLO: a temporary audio-frame mute/solo view.

The live mute/solo word is restored before leaving each normal audio frame;
project and battery-backed state are not written. USB settings use
ot_sequencer_rows. See TESTING.md for qualification limits.
"""
from pathlib import Path
import os
from remix.schema import Category, Proof, Gate, Detour, Kind, Linked, Module
from remix.stock_guard import stock_guard

HERE = Path(os.path.relpath(Path(__file__).resolve().parent))
MODULE = Module(
    name="track-solo", key="TRACK SOLO", kind=Kind.CF_PATCH,
    category=Category.FIXES, author="twwwy", author_url="https://github.com/twwwy",
    doc="Hold a track for 0.5 seconds, tap other tracks to join, release to restore.",
    proof=Proof.UNTESTED, proof_note="Local prototype; no hardware qualification.",
    linked=(Linked("ts_core", str(HERE / "core.s"), dram=True),
            Linked("ts_gate", str(HERE / "gate.s"), dram=True),
            Linked("ts_input", str(HERE / "input.s"), dram=True)),
    detours=(
        Detour(0x4000aee0,
            stock_guard(0x4000aee0, 6, "a9cf923563c63eb3f84f7d7e7cfdf94cc7ce0dcc4b79e52cee79945983be391e"),
            "ts_gate", "ts_frame_enter", "temporary view after timer/DMA setup, before track processing"),
        Detour(0x4000d98e,
            stock_guard(0x4000d98e, 6, "fc50dbf7d937c5b78b3d03b9524f10648b41ef48df239d9afe1d12ca81cbbb17"),
            "ts_gate", "ts_frame_leave", "restore real state before USB Audio and frame return"),
        Detour(0x4009220c, stock_guard(0x4009220c, 6, "d6c9f1f60272197a17511f496fc19dd21ddd7df5f1f1ec0cab7a16cad60b0609"),
            "ts_core", "ts_stock_key", "hide the anchor from stock held-key queries"),
        Detour(0x40092230, stock_guard(0x40092230, 6, "bd4b326758c0f4f943f4248ce0cf5a835d3e17ba5618afddbc500c3d3a6a3de6"),
            "ts_core", "ts_stock_row", "hide the anchor from stock held-row queries"),
        Detour(0x400135b0, stock_guard(0x400135b0, 8, "d43e64e0210fdd98e9dd8476d7cea57c93492ec611d50eddcbf6fd90ea80cef7"),
            "ts_input", "ts_led_level", "temporary TRACK brightness through native panel levels"),
        Detour(0x40013654, stock_guard(0x40013654, 6, "7d924323d90a22f75825e09900096b9563f43d2e0a02939a8c4ba78f832f58c1"),
            "ts_input", "ts_panel_row", "keep excluded TRACK lamps dim but lit"),
        Detour(0x400866c4, stock_guard(0x400866c4, 8, "2701c9f06c655d1a5b7aab9961c0a3d23848764c2e559d362850d8d7831e7702"),
            "ts_input", "ts_project_load", "cancel before the shared project-load seam"),
    ),
    gates=(Gate("modules/track-solo/verify.py", remix_arg=False),),
)
