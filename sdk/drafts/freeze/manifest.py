"""Freeze -- a grid-locked, tape-like live loop on FX2 (engine: freeze.c; blocked on DELAY_HOOK_PROPOSAL.md).

The skeleton below is the scaffold's, kept until the hook exists; unit.s is not the engine.

THE SKELETON OF A COLDFIRE MODULE: code the build links and places for
you, reached from stock code by detours you name by SYMBOL.
`npm run module:new` made this draft under sdk/drafts/. It builds as it is:
`npm run module:dev -- <id>` tries it on your unit over USB, and
`npm run module:doctor -- --draft <id>` checks it.

sdk/octatrack/modules/repitch/ is a finished one (one linked unit, detours,
pokes); sdk/octatrack/modules/quantizer/ another (units built from the
author's source, kept under upstream/). sdk/octabam/docs/remixer/MODULES.md
"Declaring a ColdFire module" is the guide; sdk/octabam/docs/remixer/PLACEMENT.md
says where the bytes go; docs/OCTATRACK_API.md lists the hooks.

Say what the module is, which stock routines it changes, what is measured
and what is inferred. Delete every comment below once answered.
"""

from remix.schema import Category, Proof, Gate, Detour, Kind, Linked, Module, Poke
from remix.stock_guard import stock_guard

MODULE = Module(
    # `name` MUST equal the directory name. `key` is the build identifier and
    # appears in the build report, which other tools parse -- so it is API.
    name="freeze",
    key="FREEZE",
    kind=Kind.CF_PATCH,             # no DSP code, no chooser row
    doc="Grid-locked tape-like live loop in the track delay ring; needs the proposed ev_delay_track hook.",
    category=Category.TRACK, author="jacobphono", author_url="https://github.com/jacobphono",
    proof=Proof.UNTESTED, proof_note="Engine host-tested only (verify.py); not runnable until a base carries ev_delay_track.",

    # ---- the code: GNU-as units, linked by the build ----------------------
    # ORDER IS LINK ORDER: a unit may reference symbols of units before it.
    # `dram=True` puts the unit in the platform runtime (linked with every
    # other DRAM unit in the remix, appended behind the loader, depacked at
    # boot into the platform's 10 MB reserve at the bottom of the audio
    # page arena -- where anything bigger than a few hundred bytes
    # belongs; the unit gives up 10 MB of sample memory). `dram=False` places
    # it in one of the OS image's free zero runs (~8 KB, shared by everyone)
    # for code that must be ROM-resident. Sources are `.s` for m68k-elf-as;
    # `cpu="5407"` and "5475" encode this ISA subset identically.
    linked=(
        Linked("unit", "modules/freeze/unit.s", dram=True),
        # Building from someone else's repository? Add it as a submodule
        # under modules/<name>/upstream and point `source` into it; the
        # sources stay theirs and an update is a submodule bump.
        # `reference=(addr, sha256)` re-links the unit at the AUTHOR'S own
        # address on every build and compares, so a drift from the bytes
        # they ratified fails loudly.
    ),

    # ---- how stock code reaches it: detours, wired by symbol --------------
    # `site` is a stock instruction; `expect` its bytes (whole instructions,
    # asserted before anything is written -- a site that has moved stops
    # the build). `kind`: "jmp" for a stub that replays what it displaced
    # and jumps on (the common case), "jsr" for a callable that returns,
    # "lea" to rewrite a six-byte `lea abs.l,An`'s operand. `pad_to` nops
    # the rest of a displaced span longer than six bytes.
    detours=(
        # Detour(0x400xxxxx, stock_guard(0x400xxxxx, 8, "<sha256>"), "unit", "my_hook",
        #        "what this hook is for", kind="jsr", pad_to=None),
    ),

    # ---- plain asserted rewrites ------------------------------------------
    pokes=(
        # Poke(0x400xxxxx, expect=stock_guard(0x400xxxxx, 2, "<sha256>"),
        #      write=bytes.fromhex("6012"), note="bne -> bra: never re-apply"),
    ),

    gates=(Gate("modules/freeze/verify.py", remix_arg=False),),

    # A stock pointer array that needs more entries: TableGrow relocates it
    # into free space with your symbols appended and repoints every
    # reference.
    # tables=(TableGrow("...", old=0x400xxxxx, count=16,
    #                   symbols=(("unit", "my_row"),),
    #                   refs=((0x400xxxxx, 0x400xxxxx),)),),
)
