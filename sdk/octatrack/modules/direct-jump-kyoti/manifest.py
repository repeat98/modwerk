from remix.stock_guard import stock_guard
"""DIRECT_JUMP_KYOTI -- an optional immediate pattern change, toggled from the
front panel with [PTN] + [YES] (a toast confirms; it comes up OFF at every
power-on, so a unit that never enables it behaves exactly as stock).

A cued pattern takes over on the NEXT STEP instead of waiting for the current
one to finish, and the landing is LOCKED TO THE MASTER CLOCK: the new pattern
plays where it would be had it been running since the LAST RESTART -- PLAY, or
the last stock pattern change (V7.3) -- whatever its track lengths, scales or
master settings. START SILENT and the Part's pattern-wide
settings change as on a stock pattern change; each track's own Part settings
(its LFO setups, with LFO AUTO CHANGE on) reach the engine with that track's
first sounding trig of the new pattern; trig conditions stand where the new
pattern's would, had it played since that restart; with SILENCE TRACKS on, the tracks
the switch silences are released with stock's note-off first. The last MIDI
Program Change sent names the pattern that plays. The arranger and pattern
chains are untouched.

HOW IT LANDS (the author's): stock already re-lands the whole sequencer from a
snapshot behind the countdown byte 0x80006687 in phase D of its tick handler.
The unit arms that countdown and prepares the snapshot one tick before the
step boundary (V7.1), suppresses the MIDI START a jump must not send, and owns
the [PTN]-held [YES] key. Every per-track counter and the pattern-boundary body
stay stock. V7.2 adds one site: the light Part apply's LFO AUTO CHANGE test, so
the one apply after a jump leaves each track's LFO setup to that track's own
publish. V7.3 adds another: stock's own pattern switch (DIRECT JUMP off, a chain,
the arranger) calls COND_RESET(-1) at 0x400a4850 right after restarting the
master; dj_swres re-bases the jump's clock there and tail-jumps COND_RESET, which
still sees stock's return address and argument. A jump never runs that block.

STATE. One word, DJ_MODE (0 = OFF, 1 = ON), inside the unit. A DRAM unit is
loaded by the base at every install and boot (USB) or unpacked at every boot
(native card build), so it starts at 0 by construction; no battery restore
reaches it.

MODWERK. The author's declaration (Zac-Kyoti/octatrack-kyoti-fw cd788e9,
octabam-modules/direct-jump-kyoti/manifest.py; upstream/README.md is his README
from that commit) carries the stock bytes it expects at each site, `requires`
BATCH_BUGFIXES and declares conflicts. Here every stock expectation is an
address/length/SHA-256 guard read from the builder's own OS file, and there is
no `requires`: Modwerk modules never need another module. The bundle was
required for its MIDI_PLAYS_FREE_FIX: stock's PER TRACK scale seed reads a MIDI
track's scale with the audio stride, so the byte Direct Jump reads to place that
track is garbage (the source then falls back to the master's). Since 0.1.1 that
fix is folded in here, as the author's standalone image does: patch_trigscale.s,
his file at cd788e9 with one label renamed (`cave` -> `ts_cave`, as it links
beside Direct Jump's unit), as a second unit `ts` with one 18-byte splice. The bundle's other two fixes stay out. The two
Keeps that protected the rest of the [PTN]-layer YES record are dropped: a USB
package cannot carry them, and the symbol reference's own guard (the slot is
NULL) still refuses a changed record. The author's conflicts name modules
Modwerk does not have (octabam's DIRECT JUMP and OCTAKIT; Octakit wraps stock's
switch block around the fifth site, and Modwerk's Kits, which follows its design,
hooks the pattern schedule and chain append instead), so none is declared.
patch_directjump_v7.s is the author's V7.3 file unchanged, so the unit is his
bytes. Up to the V7.2.2 preparation Modwerk re-encoded six spots (and moved one
instruction of patch_trigscale.s) only so that no 12 bytes of the USB package
matched a run of the stock OS. Base 0.7.5 (#1475) dropped that refusal, and those
runs were the author's original code calling the OS the way the OS calls itself
(the same arguments pushed, then the same routine), not Elektron bytes, so the
re-encodings are gone.
"""

import os

from remix.schema import Detour, Kind, Linked, Module, SymbolRef

# This module's own directory, relative to the build's cwd (octabam's repo root).
_HERE = os.path.relpath(os.path.dirname(os.path.realpath(__file__)))

# ---- the hook sites ------------------------------------------------------------
LAND_HOOK = 0x400a1f72      # phase D of the tick handler: the landing countdown read
NOFA_HOOK = 0x400a221c      # the MIDI START (0xFA) gate a jump must not open
PTNREL_HOOK = 0x40043418    # [PTN] release: the chooser stays shut after [PTN]+[YES]
# V7.2: the light Part apply's LFO AUTO CHANGE test (`tst.b`, stock's `beq.w` follows on its Z flag). The one
# apply after a jump sees Z = 1 and skips its per-track LFO part; each track's publish brings it at its first trig.
LFOQ_HOOK = 0x40009ebe
# V7.3: stock's switch block (a real pattern change: DIRECT JUMP off, a chain, the arranger) calls COND_RESET(-1)
# here (`jsr 0x400a539c`, after its `pea -1`), right after restarting the master. dj_swres sets the jump's clock to
# that restart (dj_T = -tps_old, dj_rsm = the start step) and tail-jumps COND_RESET without pushing anything, so the
# callee sees return address 0x400a4856 and the -1 as from stock's own call.
SWRES_HOOK = 0x400a4850
# The [PTN]-held keymap layer's YES record (0x400bf0be) is NULL in stock; its press slot:
PTN_LAYER_YES_PRESS = 0x400bf0c0
# The author's MIDI_PLAYS_FREE_FIX: the 18-byte per-track scale seed in FUN_4009b5c8. All 18 are
# guarded (the cave redoes them); only the first instruction becomes the jmp. His BATCH_BUGFIXES
# pads the rest with nops, but the cave rejoins stock at 0x4009b704 past them, and six nops were a
# stock run the USB package's scan refused (until base 0.7.5 dropped the refusal).
TS_HOOK = 0x4009b6f2

# patch_directjump_v7.s, m68k-elf-as -mcpu=5407 or 54455 (identical), linked at 0x400d6d38:
# 3938 bytes, the author's V7.3 byte for byte: his manifest's REFERENCE at cd788e9, the code of his
# KYOTI V1.8C image KY18C DJR1. Re-linked there and compared on every build.
UNIT_BYTES = 3938
REFERENCE = (0x400d6d38, "51478a6773f5b987dc98c595f55a3dd88e9de514d1cedb8fbd35cffe4755e48d")
# patch_trigscale.s, position independent, 62 bytes: the author's pinned bytes (the label rename
# changes no byte).
TS_REFERENCE = (0x400d7b00, "a1eec6b67bb817cc2e063f23897377697f6057a9bf2389d5eb442813b854bba4")

MODULE = Module(
    name="direct-jump-kyoti",
    key="DIRECT_JUMP_KYOTI",
    kind=Kind.CF_PATCH,
    author="Zac-Kyoti", author_url="https://github.com/Zac-Kyoti",
    doc="Clock-locked DIRECT JUMP ([PTN]+[YES]): a cued pattern lands on the "
        "next step exactly where it would be had it played since PLAY or the last pattern change.",
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
        Detour(LFOQ_HOOK, stock_guard(LFOQ_HOOK, 6, "37edecfc18058ca757b701a5e909152025e5ceb96e33328800af3bea09dd5e94"),
               "dj7", "dj_lfoq", "light Part apply: per-track part deferred to each track's first trig", kind="jsr"),
        Detour(SWRES_HOOK, stock_guard(SWRES_HOOK, 6, "3eb71e079e73b289302dbd71e2397466226349dc505a46c2cc16a49a1595c7db"),
               "dj7", "dj_swres", "stock pattern switch: the jump's clock restarts there", kind="jsr"),
        Detour(TS_HOOK, stock_guard(TS_HOOK, 18, "1737cfa861055a533a8a63f6ee4a007de11433354ad97185fba8e79c7a06ac43"),
               "ts", "ts_cave", "MIDI Plays-Free fix: a MIDI track's PER TRACK scale read with the MIDI stride"),
    ),
    symbol_refs=(
        SymbolRef(PTN_LAYER_YES_PRESS, 0, "dj7", "dj_toggle",
                  "[PTN]-layer YES press handler (NULL in stock)"),
    ),
)
