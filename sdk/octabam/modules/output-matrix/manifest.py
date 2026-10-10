"""OUTPUT MATRIX -- the headphone jack as a third assignable output pair.

PROJECT > CONTROL > AUDIO > CUE CFG gains a third choice, MATRIX, beside
NORMAL and STUDIO. In MATRIX, LEVEL sets each audio track's level and
CUE + LEVEL picks where the track goes: MAIN, CUE or PHONES as stereo pairs
in any combination, or one mono jack of the six. The choice is stored in
the track's cue-level byte of the Part, so it follows the Part and survives
Part save, Part reload and the SRC page reset. MIXER's MIX becomes the
PHONES output level. Inputs A/B and C/D keep stock DIR to MAIN.

Stock code it changes (OS 1.40C, read from the image and confirmed under the
ColdFire port; reference/phase0-notes.md in the Modwerk worktree):
- CUE CFG is the byte 0x80000037 (0 NORMAL, 1 STUDIO). Every stock reader
  but the AUDIO page tests it nonzero, so MATRIX (2) inherits STUDIO's
  behaviour there: CUE + TRACK does nothing and both gains are always sent.
- The project parse at 0x4008732a clamps CUE_STUDIO_MODE to 0/1, and the
  power-up check of the CS1 settings at 0x400100b8 counts a CS1 mirror above
  1 as damage (and the bank's CS1 copy is then not restored); both are
  widened to 0..2. A project saved in MATRIX loads on a stock OS as STUDIO.
- AUDIO page: draw 0x400651a8, key handler 0x40065430 (menu-state table
  0x400cbdd4), label/getter/action tables 0x400b277c..0x400b27ab.
- CUE + LEVEL: 0x4004e98c (in MATRIX it steps a destination code and
  hands it to the stock store at 0x4004ea10). LEV box with CUE held:
  0x4004dd64 (label), 0x4004ddb4 (the name), 0x4004df8c (the bars).
- Level page builder 0x4000d1a6 (detour 0x4000d1ea, after $29 is stored): in
  MATRIX the MAIN level word ($29) is rewritten
  as unity, so each track's ramped MAIN gain is its own level x XVOL; the
  real MAIN, CUE and PHONES levels and the eight destinations go in the
  page's unused words $37..$3b.
- Switching CUE CFG to or from MATRIX converts every Part's cue bytes (all
  banks, working and saved, the current bank's CS1 copies, the live bytes)
  and marks the banks it changed for the next save.
- DSP, payload A (core 0): P:0x257, the MASTER TRACK branch in front of the
  mixdown, becomes `jsr >omx_mix`; in MATRIX the module mixes CUE, MAIN and
  the PHONES bus itself and continues at P:0x2d5. P:0x30a, the phones
  crossfade, becomes `jsr >omx_phn`; in MATRIX it writes the PHONES bus and
  the metronome to ring words 4/5 and continues at P:0x35a.

Proof: under the ColdFire port only (verify.py; TESTING.md). Not run on
hardware.
"""

from remix.schema import (Category, Claims, Detour, DspHook, DspRange, DspSection, Gate, Kind,
                          Linked, Module, Poke, Proof, SymbolRef)
from remix.stock_guard import stock_dsp_words, stock_guard

UNIT = "matrix"

# The destination codes, in CUE + LEVEL order (matrix.s dest_names), as the
# DSP's code table: per code, for CUE, MAIN and PHONES in turn, the number
# of the list the track joins, 3 x bus + kind (kind 1 stereo, 2 mono left,
# 3 mono right), or 0 when the code does not reach that bus.
_KIND = {"off": 0, "st": 1, "L": 2, "R": 3}
_CODES = (  # (CUE, MAIN, PHONES)
    ("off", "st", "off"),   # 0 MAIN
    ("st", "off", "off"),   # 1 CUE
    ("off", "off", "st"),   # 2 PHNS
    ("st", "st", "off"),    # 3 M+C
    ("off", "st", "st"),    # 4 M+P
    ("st", "off", "st"),    # 5 C+P
    ("st", "st", "st"),     # 6 ALL
    ("off", "L", "off"),    # 7 MNL
    ("off", "R", "off"),    # 8 MNR
    ("L", "off", "off"),    # 9 CUL
    ("R", "off", "off"),    # 10 CUR
    ("off", "off", "L"),    # 11 PHL
    ("off", "off", "R"),    # 12 PHR
    ("off", "off", "off"),  # 13 OFF
)
CODE_TABLE = tuple(3 * bus + _KIND[k] if _KIND[k] else 0
                   for code in _CODES for bus, k in enumerate(code))

MODULE = Module(
    name="output-matrix",
    key="OUTPUT MATRIX",
    kind=Kind.HYBRID,
    doc="CUE CFG MATRIX: the headphone jack becomes a third output pair; "
        "CUE + LEVEL picks each track's outputs.",
    category=Category.BUS, author="npp1993", author_url="https://github.com/npp1993",
    proof=Proof.UNTESTED, proof_note="verify.py under the ColdFire port; not run on hardware",

    linked=(Linked(UNIT, "modules/output-matrix/matrix.s", dram=True),),

    detours=(
        Detour(0x4008732A, stock_guard(0x4008732a, 14, "968adf63466a054aefd6609f18536e3719bbcc144b6dc0a43de49794c3bb3718"),
               UNIT, "parse_mode", "project load: CUE_STUDIO_MODE clamps to 0..2, not 0..1",
               kind="jsr", pad_to=14),
        Detour(0x4004E98C, stock_guard(0x4004e98c, 8, "4c0570fc6ef0682508e64de2367e111c27f895b6b78e58c300b3f2e7b8010118"),
               UNIT, "cue_level_enc", "CUE + LEVEL: in MATRIX, step the track's destination",
               pad_to=8),
        Detour(0x4004DD64, stock_guard(0x4004dd64, 6, "4a0e8b026de2be316135a324da1ec8860f198cd3d26d2c6e1477772403baa3f0"),
               UNIT, "lev_box_cue", "LEV box with CUE held: in MATRIX, labelled with the track's destination"),
        Detour(0x4004DDB4, stock_guard(0x4004ddb4, 18, "599199441e3ed6b14d404d9165c6960c172372cb3afb1138eb987a85056f356c"),
               UNIT, "lev_box_val", "LEV box with CUE held: in MATRIX, the destination's name",
               pad_to=18),
        Detour(0x4004DF8C, stock_guard(0x4004df8c, 6, "f8f99e5fbedfdea641ce1ee91dd4b343c5f584bdbdcfdb906cc7b2ff700b81e4"),
               UNIT, "lev_bars", "LEV box bars: in MATRIX both show the level, solid on every track"),
        Detour(0x4007C498, stock_guard(0x4007c498, 6, "44ed799109c451f24e666752e6cbb64d01b2569a031747ca70862d4e993655c9"),
               UNIT, "mixer_mix_label", "MIXER: in MATRIX, MIX is labelled PHN (the PHONES level)"),
        Detour(0x4007C50A, stock_guard(0x4007c50a, 6, "8094ae1fc8f6652016413873ceeff62f4c61f3626e4cd0d1aea9eb7365b2e681"),
               UNIT, "mixer_mix_left", "MIXER: in MATRIX, the PHN slider's left end reads -"),
        Detour(0x4007C52C, stock_guard(0x4007c52c, 6, "89256b8a6327e056fd997c1d763d596c02d198f79acb7ee65049c8771cb8b5ce"),
               UNIT, "mixer_mix_right", "MIXER: in MATRIX, the PHN slider's right end reads +"),
        Detour(0x4000D1EA, stock_guard(0x4000d1ea, 6, "84ba946536b14dc94d29f98643355d547c696eaf466a6aa97f9e4d654e1c9296"),
               UNIT, "page_levels", "level page: unity MAIN word, real levels and destinations in $37..$3b",
               kind="jsr"),
    ),

    symbol_refs=(
        SymbolRef(0x40065276, 0x400B277C, UNIT, "t8_labels", "AUDIO: TRACK 8 labels, a third (blank) row"),
        SymbolRef(0x4006527C, 0x400B2784, UNIT, "t8_getters", "AUDIO: TRACK 8 checkboxes"),
        SymbolRef(0x4006532C, 0x400B5EA8, UNIT, "str_outcfg", "AUDIO: the CUE CFG box is titled OUT CFG"),
        SymbolRef(0x4006535C, 0x400B278C, UNIT, "cue_labels", "AUDIO: CUE CFG labels + MATRIX"),
        SymbolRef(0x40065368, 0x400B2794, UNIT, "cue_getters", "AUDIO: CUE CFG checkboxes"),
        SymbolRef(0x400654B2, 0x400B279C, UNIT, "t8_actions", "AUDIO: TRACK 8 YES actions"),
        SymbolRef(0x400654C0, 0x400B27A4, UNIT, "cue_actions", "AUDIO: CUE CFG YES actions"),
        SymbolRef(0x400CBDD4, 0x40065414, UNIT, "audio_enter", "AUDIO page: three rows"),
        SymbolRef(0x400CBDE0, 0x40065430, UNIT, "audio_keys", "AUDIO page: keep TRACK 8's cursor on its two rows"),
    ),

    pokes=(
        Poke(0x40065332, stock_guard(0x40065332, 2, "06b6b4095e023805a3cd41879f15ba5ab2f2e33a6f53d916904496062f324995"),
             bytes.fromhex("001d"), "AUDIO: the CUE CFG box grows by one row (22 -> 29 px)"),
        Poke(0x4006533A, stock_guard(0x4006533a, 2, "f09a7a12954169ae595d12d870e69a4c0092003157d72523d626d2a3990241e2"),
             bytes.fromhex("0004"), "AUDIO: ... downward: its bottom edge 11 -> 4, so the top stays put"),
        Poke(0x400100BE, stock_guard(0x400100be, 2, "0b14b394f74bdc2f13a4efc3e6bcec310ba2288bcf64811943a1fe443229d05b"),
             bytes.fromhex("7402"), "power-up CS1 check: CUE CFG up to 2 is valid (1 counted 2 as damage)"),
        Poke(0x400100C4, stock_guard(0x400100c4, 2, "1f2e6d00279b4659b6d6f1ad57e12568e4a50f80908af50d1e861001b2be2a3b"),
             bytes.fromhex("7002"), "... and above 2 clamps to 2"),
    ),

    dsp=DspSection(
        asm="modules/output-matrix/matrix_mix.asm",
        priority=21,
        payloads=frozenset({"A"}),
        ptable=CODE_TABLE,
        hooks=(
            DspHook({"A": 0x00257}, stock_dsp_words("A", 0x00257, 2, "43a6ab9f9273577277c56b298e158b037e7b6f3c457da73cd18868c7501a9fd9"),
                    "omx_mix", "core 0 mixdown: the MASTER TRACK branch; MATRIX takes its own path"),
            DspHook({"A": 0x0030A}, stock_dsp_words("A", 0x0030A, 2, "749460b0c4484ec3134e24309d29382fd6265a4eeefbd813a9d97fa485a259f0"),
                    "omx_phn", "core 0 phones crossfade; MATRIX writes the PHONES bus"),
        ),
    ),

    claims=Claims(dsp_ranges=(
        DspRange("y", 0xC00, 0xC1, "bus ramps, routing lists, PHONES out and y scratch (payload A)"),
    )),

    gates=(Gate("modules/output-matrix/verify.py", remix_arg=False, venv=True, stage="image"),),
)
