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
    detours=(
        Detour(0x4008ded0,stock_guard(0x4008ded0,8,"f7fddeefeac300af619b7028a954dc595076d9d098da7090973c1cbc1f649ec0"),"psl","psl_bank_read","retire history before native bank deserialization",kind="jmp",pad_to=8,subst_return=True),
        Detour(0x4002c89c,stock_guard(0x4002c89c,8,"507353099d0165038c68974b2f57dbdec61e24a2758e47418233ccbcb59b8d96"),"psl","psl_trig_paste","retire edit provenance before native mutation",kind="jmp",pad_to=8,subst_return=True),
        Detour(0x4002b65c,stock_guard(0x4002b65c,8,"ad0bb7f528727c8a2e3fde76c7f1aa5b2bd895933e1e818f75f3f0cd16ddee28"),"psl","psl_track_paste_entry","retire edit provenance before native mutation",kind="jmp",pad_to=8,subst_return=True),
        Detour(0x4002b9b0,stock_guard(0x4002b9b0,8,"efa23c0a55aebcd8ffb29c8ba97d3970d8e88ed9c16272d7b5ea0b4e8309ecf5"),"psl","psl_pattern_paste","retire edit provenance before native mutation",kind="jmp",pad_to=8,subst_return=True),
        Detour(0x4002b3b4,stock_guard(0x4002b3b4,8,"efa23c0a55aebcd8ffb29c8ba97d3970d8e88ed9c16272d7b5ea0b4e8309ecf5"),"psl","psl_undo","retire edit provenance before native mutation",kind="jmp",pad_to=8,subst_return=True),
        Detour(0x40039df4,stock_guard(0x40039df4,8,"0c6d3f0bfd198ddc78800e6503eccdc6cbc5c442209d882244584eda864e93ca"),"psl","psl_track_clear","retire edit provenance before native mutation",kind="jmp",pad_to=8,subst_return=True),
        Detour(0x400905d4,stock_guard(0x400905d4,8,"604756f90fe2564cd1c75b712a1c239b10ef2db438579e307632b3382bacd165"),"psl","psl_banks_load","retire edit provenance before native mutation",kind="jmp",pad_to=8,subst_return=True),
        Detour(0x40040ee0,stock_guard(0x40040ee0,8,"14607b32e7a5a2eae6fcb2e63e1770b2f2387c64c63e6289faf0eb8e75f9aa40"),
        "psl","psl_manual_sample","manual SAMPLE edit retires ownership, including same-value writes",kind="jmp",pad_to=8,subst_return=True),)+tuple(Detour(address, stock_guard(address, 6,
        "d35bfe797abb5bb27e98ec6d4cb422e20c44f307e5d6597af674380832f8dbdf"),
        "psl", "psl_open", "Part Edit opener: retain stock popup and expose module UI through core hooks", kind="jsr",subst_return=True)
        for address in (0x4002dc68, 0x4002dc90, 0x4002dcc4)),
    gates=(Gate("modules/pattern-sample-locks/verify.py", remix_arg=False),),
)
