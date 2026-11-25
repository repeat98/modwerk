"""Pattern Sample Locks: ordinary native SAMPLE edits, no ownership ledger.

Its row in the base's Part Edit menu (runtime.json: ot_part_menu) opens Lock or Clear;
the screens after it use the core UI events. No stock site is patched. Lock preserves
existing SAMPLE locks by default; Clear removes all selected SAMPLE locks.
"""
from remix.schema import Category, Proof, Gate, Kind, Linked, Module

MODULE = Module(
    name="pattern-sample-locks", key="PATTERN SAMPLE LOCKS", kind=Kind.CF_PATCH,
    doc="Lock Part-assigned samples into a pattern, or clear its SAMPLE locks.",
    category=Category.FIXES, author="twwwy", author_url="https://github.com/twwwy",
    proof=Proof.UNTESTED, proof_note="Experimental native writer; emulator checks in TESTING.md; no hardware qualification.",
    linked=(Linked("psl", "modules/pattern-sample-locks/unit.s", cpu="5475", dram=True),),
    gates=(Gate("modules/pattern-sample-locks/verify.py", remix_arg=False),),
)
