"""SEQ -- TRACK + PAGE opens a Euclidean rhythm, lock and melody window for audio and MIDI tracks.

Hold [TRACK] and press [PAGE] to open it. The rhythm page has A=PULS,
B=ROT, C=LANE, D=page and parameter, E=DPTH, and empty F. The Harmony page
has A=SCAL, B=ROOT, D=PHRS and E=JUMP on audio and MIDI tracks; MIDI also
has C=VOIC and F=CHRD. [YES] writes trigs and the selected destination's
locks into the pattern; [NO] closes. Settings are kept per project in
seq.work beside the bank files.

Port of ilia-murzinov's octabam module (modules/seq at 076e2d3c, MIT; the
seq.s of the OCTABAM 83 image the author confirmed on his MKII), kept
unchanged under upstream/. Changed for the Modwerk base:
1. No STORE. The project events come from the base's hooks (runtime.json,
   sdk/machines/octatrack/HOOKS.md); the file, CRC-32 and Part-context
   helpers are in seq.s. A seq.work SEQ cannot read is backed up to seq.bak
   at the next save, where octabam's STORE asked first.
2. No PLOCKS P2 and no CX OSC: the FX page-2 destinations (35-46) and the
   CX SETUP ones (30-34) are never selectable. seq.work keeps their bytes,
   so a file moves between octabam and Modwerk unchanged.
3. The FX2 descriptor table is stock's: the base's effect ids fit it.
4. Each stock site is named by the SHA-256 of its bytes.
USB only: the package needs the base's hooks.
"""

from remix.schema import Category, Detour, Gate, Kind, Linked, Module, Proof, SymbolRef
from remix.stock_guard import stock_guard

PAGE = 0x4004FFC4                  # PAGE press/release, at its prologue
MKII_TRIG_EDIT = 0x4007C0D0        # MKII FUNC+BANK / TRACK TRIG EDIT
FUNC_BANK_PRESS_MKI = 0x400BF4A4   # MKI FUNC-held BANK press, in the key table
FUNC_BANK_STOCK_MKI = 0x40058A64   # its stock handler (KITS detours it; SEQ calls it)

MODULE = Module(
    name="seq",
    key="SEQ",
    kind=Kind.CF_PATCH,
    category=Category.MACHINES,
    author="ilia-murzinov",
    author_url="https://github.com/ilia-murzinov",
    proof=Proof.HARDWARE,
    proof_note="MKII on development twin 4c7eb79b: procedure steps 6 to 10 and by-hand checks in TESTING.md; release-base procedure pending.",
    doc="TRACK + PAGE opens SEQ: Euclidean rhythms, lock rhythms, and generated melodies and chords, "
        "for audio and MIDI tracks.",
    linked=(Linked("seq", "modules/seq/seq.s", dram=True),),
    detours=(
        Detour(PAGE, stock_guard(0x4004ffc4, 8, "efa23c0a55aebcd8ffb29c8ba97d3970d8e88ed9c16272d7b5ea0b4e8309ecf5"),
               "seq", "ef_page", "PAGE: with a track held, open the SEQ window", pad_to=8),
        Detour(MKII_TRIG_EDIT, stock_guard(0x4007c0d0, 8, "97ed82145a0c16f9ea6184c6fbee2c2d7e8ba613b14810bf20320c82bbcaeb25"),
               "seq", "ef_fb_mkii", "MKII FUNC+BANK / TRACK TRIG EDIT: SEQ's clear list while SEQ is open",
               pad_to=8),
    ),
    symbol_refs=(
        SymbolRef(FUNC_BANK_PRESS_MKI, FUNC_BANK_STOCK_MKI, "seq", "ef_fb_mki",
                  "MKI FUNC+BANK: SEQ's clear list while SEQ is open, else the stock handler"),
    ),
    gates=(Gate("modules/seq/verify.py", remix_arg=False),),
)
