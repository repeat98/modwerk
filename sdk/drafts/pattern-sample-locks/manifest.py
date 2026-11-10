"""Pattern Sample Locks: ordinary native SAMPLE edits, no ownership ledger.

Part Edit uses core UI events and three unshared opener sites. Lock preserves
existing SAMPLE locks by default; Clear removes all selected SAMPLE locks.
"""
from remix.schema import Category, Proof, Gate, Detour, Kind, Linked, Module
from remix.stock_guard import stock_guard

MODULE = Module(
    name="pattern-sample-locks", key="PATTERN SAMPLE LOCKS", kind=Kind.CF_PATCH,
    doc="Lock Part-assigned samples into a pattern, or clear its SAMPLE locks.",
    category=Category.FIXES, author="twwwy", author_url="https://github.com/twwwy",
    proof=Proof.UNTESTED, proof_note="Experimental native writer; emulator checks in TESTING.md; no hardware qualification.",
    linked=(Linked("psl", "modules/pattern-sample-locks/unit.s", cpu="5475", dram=True),),
    detours=tuple(Detour(address, stock_guard(address, 6,
        "d35bfe797abb5bb27e98ec6d4cb422e20c44f307e5d6597af674380832f8dbdf"),
        "psl", "psl_open", "Part Edit opener: retain stock popup and expose module UI through core hooks", kind="jsr",subst_return=True)
        for address in (0x4002dc68, 0x4002dc90, 0x4002dcc4)),
    gates=(Gate("modules/pattern-sample-locks/verify.py", remix_arg=False),),
)
