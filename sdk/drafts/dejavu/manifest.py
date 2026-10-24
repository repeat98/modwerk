"""DEJA VU -- audio-track LFO waveforms with a looping random memory (draft).

WAVE 19 DJV (stepped), 20 DJQ (snapped to whole knob steps), 21 DJC (glides):
one loop of remembered values per LFO; SPD sets how often a slot is replayed,
MULT the loop length, TRIG what moves through it (dejavu.c).

Sites (docs/firmware/LFO.md sections 4 and 6; re-read in objdump on 1.40C):
  0x400d625c  slots 19-21 of the audio waveform dispatch table 0x400d6210 (SAW
  -0x400d6264 padding) -> dv_wave, dq_wave, dc_wave
  0x400d38ac  WAVE's value count (u32, descriptor slot 7) 19 -> 22
  0x4003be50  the WAVE formatter's clamp `moveq #19,%d1` -> #22
  0x4004693c  the WAVE cell drawer's icon bound `moveq #19,%d0` -> #21
  0x400be38e  the 19-entry label pointer array, grown by DJV DJQ DJC; its one reference
              is the `lea` operand at 0x4003be5c
  0x400bdf36  the 19-entry WAVE icon table LFO SETUP draws (stock entry 19 is a
              null pointer); refs: `lea` operands at 0x400469ec and 0x40046a56
Both tables grow inside the unit: StockCopy fills dv_labels/dv_icons with the
19 stock pointers and SymbolRefs point the three `lea` operands at them. The
runtime package (USB) carries that; it carries no TableGrow. Where the schema
has no StockCopy (upstream octabam, used for emulator dev builds) the same
growth is declared as TableGrow.
Not touched: the MIDI-LFO table 0x400d6290 and its count (MIDI tracks keep 19 waves).
A project saved with WAVE 19-21 on a firmware without the module dispatches the
stock SAW padding and draws label 0 (LFO.md section 6).
"""

from remix import schema
from remix.schema import Category, Proof, Gate, Kind, Linked, Module, Poke, SymbolRef, TableGrow
from remix.stock_guard import stock_guard

STOCK_COPY = getattr(schema, "StockCopy", None)

DISPATCH_SLOT19 = 0x400D625C
DISPATCH_SLOT20 = 0x400D6260
DISPATCH_SLOT21 = 0x400D6264
WAVE_COUNT = 0x400D38AC
LABEL_CLAMP = 0x4003BE50
ICON_BOUND = 0x4004693C     # the WAVE cell drawer's `moveq #19,%d0` (cmpl / bcs: no icon above 19)
LABELS = 0x400BE38E
LABELS_REF = 0x4003BE5C
ICONS = 0x400BDF36          # LFO SETUP WAVE cell icons, 19 records; entry 19 is null in stock
ICONS_REFS = (0x400469EC, 0x40046A56)
# The 19 stock entries in copies of at most 32 bytes (loader.h): (offset, length, SHA-256)
LABELS_SHA = ((0, 32, "f9025da6eb7b72f2981b61b88a3c4550b5cbf1a8e4419447783a78f48c03f69a"),
              (32, 32, "64ceddafdc05ed176c048f996e711e36143553d2d0455dd498fe8413766f07cd"),
              (64, 12, "6868e706b7b19739d7f7f317eb4abe6237c4b5ffe08cd7de3ecdecca1f195538"))
ICONS_SHA = ((0, 32, "3400011c4a8a31330d904e4c8f95b664277499f4ac376054479b745a05ffe184"),
             (32, 32, "0075669bab0ce2e4c9db9dac0a8caa5d404c792ab807427d1cff9a944908588a"),
             (64, 12, "ba0085deb7f4cf169b8681a9d92a8bcdc675c20839eaf7ea9d0b782dbbae58db"))

if STOCK_COPY:
    UNIT = Linked("unit", "modules/dejavu/dejavu_core.s", cpu="5475", dram=True, stock_copies=tuple(
        STOCK_COPY(sym + ("_%d" % (o // 4) if o else ""), stock_guard(base + o, n, sha))
        for sym, base, rows in (("dv_labels", LABELS, LABELS_SHA), ("dv_icons", ICONS, ICONS_SHA))
        for o, n, sha in rows))
    GROWN = (SymbolRef(LABELS_REF, LABELS, "unit", "dv_labels", "WAVE labels -> 22-entry copy"),) + tuple(
        SymbolRef(r, ICONS, "unit", "dv_icons", "WAVE icons -> 22-entry copy") for r in ICONS_REFS)
    TABLES = ()
else:
    UNIT = Linked("unit", "modules/dejavu/dejavu_core.s", cpu="5475", dram=True)
    GROWN = ()
    TABLES = (
        TableGrow("LFO WAVE labels + DJV", old=LABELS, count=19,
                  symbols=(("unit", "dv_label"), ("unit", "dq_label"), ("unit", "dc_label")),
                  refs=((LABELS_REF, LABELS),)),
        TableGrow("LFO WAVE icons + DJV", old=ICONS, count=19,
                  symbols=(("unit", "dv_icon"), ("unit", "dq_icon"), ("unit", "dc_icon")),
                  refs=tuple((r, ICONS) for r in ICONS_REFS)),
    )

MODULE = Module(
    name="dejavu",
    key="DEJAVU",
    kind=Kind.CF_PATCH,
    doc="DEJA VU (draft): audio-track LFO waves DJV, DJQ and DJC, a loop of random values that replay or renew by chance.",
    category=Category.TRACK, author="jankolkmeier", author_url="https://github.com/jankolkmeier",
    proof=Proof.CHECK, proof_note="draft; emulator, and first use on one MKII over USB (reported)",
    linked=(UNIT,),
    symbol_refs=(
        SymbolRef(DISPATCH_SLOT19, 0x400038BC, "unit", "dv_wave",
                  "audio LFO waveform 19 (stock SAW padding) -> DJV"),
        SymbolRef(DISPATCH_SLOT20, 0x400038BC, "unit", "dq_wave",
                  "audio LFO waveform 20 (stock SAW padding) -> DJQ"),
        SymbolRef(DISPATCH_SLOT21, 0x400038BC, "unit", "dc_wave",
                  "audio LFO waveform 21 (stock SAW padding) -> DJC"),
    ) + GROWN,
    pokes=(
        Poke(WAVE_COUNT, expect=stock_guard(WAVE_COUNT, 4, "14236fe421fe9ddb8377a19b60ce71dd655704bcefc225c9287fb11127ba6569"),
             write=(22).to_bytes(4, "big"), note="audio LFO WAVE count 19 -> 22"),
        Poke(LABEL_CLAMP, expect=stock_guard(LABEL_CLAMP, 2, "afd885afcad49315c2cba37a4f6b17abafb8df20fa93d37b0d46e532e9e1c761"),
             write=bytes.fromhex("7216"), note="WAVE formatter clamp moveq #19 -> #22"),
        Poke(ICON_BOUND, expect=stock_guard(ICON_BOUND, 2, "68bd05451fe04da6a2f75b3119f049d40707e12cb1ec7562fc238dcfa9aa3ec2"),
             write=bytes.fromhex("7015"), note="WAVE cell icon bound moveq #19 -> #21"),
    ),
    tables=TABLES,
    gates=(Gate("modules/dejavu/verify.py", remix_arg=False),),
)
