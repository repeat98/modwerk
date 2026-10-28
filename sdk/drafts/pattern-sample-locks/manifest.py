"""Pattern Sample Locks: explicit native edits and private origin material.

Part Edit uses core UI events and three unshared opener sites. The dedicated
SAMPLE editor wrapper retires origin even for a same-value manual edit. No
stock Part/pattern padding is used for metadata. Experimental, not qualified.
"""
from remix.schema import Category, Proof, Gate, Detour, Kind, Linked, Module, Claims
from remix.stock_guard import stock_guard

MODULE = Module(
    name="pattern-sample-locks", key="PATTERN SAMPLE LOCKS", kind=Kind.CF_PATCH,
    doc="Lock Part-assigned samples into a pattern, or clear its SAMPLE locks.",
    category=Category.FIXES, author="twwwy", author_url="https://github.com/twwwy",
    proof=Proof.UNTESTED, proof_note="Experimental native writer; emulator checks in TESTING.md; no hardware qualification.",
    linked=(Linked("psl", "modules/pattern-sample-locks/unit.s", cpu="5475", dram=True),),
    claims=Claims(sram=((0x100f9000,0x3000,"PSL sparse ownership; ends before base diagnostics"),)),
    detours=(Detour(0x40040ee0,stock_guard(0x40040ee0,8,"14607b32e7a5a2eae6fcb2e63e1770b2f2387c64c63e6289faf0eb8e75f9aa40"),
        "psl","psl_manual_sample","manual SAMPLE edit retires ownership, including same-value writes",kind="jmp",pad_to=8),)+tuple(Detour(address, stock_guard(address, 6,
        "d35bfe797abb5bb27e98ec6d4cb422e20c44f307e5d6597af674380832f8dbdf"),
        "psl", "psl_open", "Part Edit opener: retain stock popup and expose module UI through core hooks", kind="jsr")
        for address in (0x4002dc68, 0x4002dc90, 0x4002dcc4)),
    gates=(Gate("modules/pattern-sample-locks/verify.py", remix_arg=False),),
)
