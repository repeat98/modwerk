from remix.stock_guard import stock_guard
"""DIRECT_JUMP_KYOTI -- an optional immediate pattern change, toggled from the
front panel with [PTN] + [YES] (a toast confirms; it comes up OFF at every
power-on, so a unit that never enables it behaves exactly as stock).

A cued pattern takes over on the NEXT STEP instead of waiting for the current
one to finish, and the landing is LOCKED TO THE MASTER CLOCK: the new pattern
plays where it would be had it been running since START, whatever its track
lengths, scales or master settings. The Part, START SILENT and trig conditions
change as on a stock pattern change, and the last MIDI Program Change sent
names the pattern that plays. The arranger and pattern chains are untouched.

HOW IT LANDS (the author's): stock already re-lands the whole sequencer from a
snapshot behind the countdown byte 0x80006687 in phase D of its tick handler.
The unit arms that countdown and prepares the snapshot on the landing tick,
suppresses the MIDI START a jump must not send, and owns the [PTN]-held [YES]
key. Every per-track counter and the pattern-boundary body stay stock.

STATE. One word, DJ_MODE (0 = OFF, 1 = ON), inside the unit. A DRAM unit is
unpacked at every boot (card build) or loaded by the base at every install and
boot (USB), so it starts at 0 by construction; no battery restore reaches it.

MODWERK. The author's declaration (octabam b725fb1a, his submodule pinned to
329b801c) carries the stock bytes it expects at each site and `requires`
BATCH_BUGFIXES. Here every stock expectation is an address/length/SHA-256 guard
read from the builder's own OS file, and there is no `requires`: Modwerk modules
never need another module. The bundle was required for its MIDI_PLAYS_FREE_FIX
(upstream/README.md, "Required: the bugfix bundle"): stock's PER TRACK scale seed
reads a MIDI track's scale with the audio stride, so the byte Direct Jump reads
to place that track is garbage (the source then falls back to the master's).
Since 0.1.1 that fix is folded in here, as the author's standalone image does:
patch_trigscale.s, his file from the same pin, as a second unit `ts` with one
18-byte splice. The bundle's other two fixes stay out; the author measured
PART_CHANGE_CARRYOVER_FIX as independent of this module, and the empty-pattern
LED has nothing to do with it. The two Keeps that protected the rest of the [PTN]-layer YES record
are dropped: a USB package cannot carry them, and the symbol reference's own
guard (the slot is NULL) still refuses a changed record. The author's conflicts
name modules Modwerk does not have (octabam's DIRECT JUMP and OCTAKIT), so none
is declared. patch_directjump_v7.s is the author's file, unchanged.
"""

import os

from remix.schema import Detour, Kind, Linked, Module, SymbolRef

# This module's own directory, relative to the build's cwd (octabam's repo root).
_HERE = os.path.relpath(os.path.dirname(os.path.realpath(__file__)))

# ---- the three hook sites ----------------------------------------------------
LAND_HOOK = 0x400a1f72      # phase D of the tick handler: the landing countdown read
NOFA_HOOK = 0x400a221c      # the MIDI START (0xFA) gate a jump must not open
PTNREL_HOOK = 0x40043418    # [PTN] release: the chooser stays shut after [PTN]+[YES]
# The [PTN]-held keymap layer's YES record (0x400bf0be) is NULL in stock; its press slot:
PTN_LAYER_YES_PRESS = 0x400bf0c0
# The author's MIDI_PLAYS_FREE_FIX: the 18-byte per-track scale seed in FUN_4009b5c8. All 18 are
# guarded (the cave redoes them); only the first instruction becomes the jmp. His BATCH_BUGFIXES
# pads the rest with nops, but the cave rejoins stock at 0x4009b704 past them, and six nops are a
# stock run the USB package's scan refuses.
TS_HOOK = 0x4009b6f2

# patch_directjump_v7.s, m68k-elf-as -mcpu=5407 or 54455 (identical), linked at 0x400d6d38:
# 2016 bytes. Re-linked there and compared on every build. The author's unit at that address
# (his manifest's oracle, the DIRECT JUMP code of his KYOTI V1.0 image) is 2026 bytes, SHA-256
# a0f480909d91b7fac0fb77d08dd8b5e2199fc14731d4bb427be71478e296bf9e; this source links to exactly
# that with its MODWERK re-encoding taken back (three kernel posts through dj_post, two leas
# swapped, so no 12 bytes of the USB package repeat stock code).
UNIT_BYTES = 2016
REFERENCE = (0x400d6d38, "2965bf7d4866fc6818040f6128cd0a2ece62305b534882d97e2379a40a249684")
# patch_trigscale.s, position independent, 62 bytes. With its MODWERK change taken back (one
# movea.l moved, the label renamed) it links to the author's pinned bytes, SHA-256
# a1eec6b67bb817cc2e063f23897377697f6057a9bf2389d5eb442813b854bba4.
TS_REFERENCE = (0x400d7b00, "3f30e0a33d3776fc897803f95fe79ee14abe15ed8aa0496d645d22d4ecce604b")

MODULE = Module(
    name="direct-jump-kyoti",
    key="DIRECT_JUMP_KYOTI",
    kind=Kind.CF_PATCH,
    author="Zac-Kyoti", author_url="https://github.com/Zac-Kyoti",
    doc="Clock-locked DIRECT JUMP ([PTN]+[YES]): a cued pattern lands on the "
        "next step exactly where it would be had it played since START.",
    linked=(
        Linked("dj7", os.path.join(_HERE, "patch_directjump_v7.s"), dram=True, reference=REFERENCE),
        Linked("ts", os.path.join(_HERE, "patch_trigscale.s"), dram=True, reference=TS_REFERENCE),
    ),
    detours=(
        Detour(LAND_HOOK, stock_guard(LAND_HOOK, 6, "4aaaa6d9488b552fc485627001a1f1b8b4fc72156809c7f9750050c787869e56"),
               "dj7", "dj_land", "phase-D countdown read: arm the stock re-landing", kind="jsr"),
        Detour(NOFA_HOOK, stock_guard(NOFA_HOOK, 6, "6d3f127d6f8c27521bb383e06dae4599364ceb88426d80464a0cdffdc7d71cda"),
               "dj7", "dj_nofa", "no MIDI START (0xFA) on a jump", kind="jsr"),
        Detour(PTNREL_HOOK, stock_guard(PTNREL_HOOK, 6, "b229662bc9a5d09d0d4613dc32ce8de200fbda85d81dd13630451d0b780946e2"),
               "dj7", "dj_ptnrel", "[PTN] release: keep the chooser shut after [PTN]+[YES]"),
        Detour(TS_HOOK, stock_guard(TS_HOOK, 18, "1737cfa861055a533a8a63f6ee4a007de11433354ad97185fba8e79c7a06ac43"),
               "ts", "ts_cave", "MIDI Plays-Free fix: a MIDI track's PER TRACK scale read with the MIDI stride"),
    ),
    symbol_refs=(
        SymbolRef(PTN_LAYER_YES_PRESS, 0, "dj7", "dj_toggle",
                  "[PTN]-layer YES press handler (NULL in stock)"),
    ),
)
