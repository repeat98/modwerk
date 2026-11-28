"""CX OSC -- Buchla-flavoured complex oscillator (marker-less machine list).

Choose CX OSC in FUNC+SRC / SELECT MACHINE TYPE (FLEX + Part signature "CX",1).
Mono voice. PLAYBACK: PTCH (−64..+63) RATO INDX FINE FOLD MIX. SETUP:
CAR/MOD/DEC/SYMM/FDBK/PWM; LFO PMTR lists PLAYBACK names + 30..34 CAR/MOD/SYMM/FDBK/PWM (no DEC). No Tim VOIC/CHRD.

Machine list adapted from timhastie/octatrick-modules v2.15 SYNTH MACHINE
(MIT / Modwerk chooser lineage). Conflicts with SYNTH MACHINE and
BLACKPYRAMIDS_303. Beside ANALOG BD or OCTA303 it shares the machine list
through HOOKS (machine_rows): its row follows theirs.
"""

import os

from remix.schema import Category, Detour, Gate, Kind, Linked, Module, Proof
from remix.stock_guard import stock_guard

_HERE = os.path.relpath(os.path.dirname(os.path.realpath(__file__)))

# PLACE: DRAM (default) links page.s into the platform runtime and leaves the
# stock DELAY's table read alone (issues #771, #1007 / Keep on 0x400d24d0..0x400d2ca8).
# CAVE is the pinned ROM form at PAGE_AT; refused where DELAY is listed.
PAGE_AT = 0x400d24d0
PAGE_LEN = 1780
PG_RESOLVE_AT = 16
RESOLVER_HOOK = 0x40031ece
RESOLVER_STOCK = bytes.fromhex("20300c00" "6002")
PLACES = ("CAVE", "DRAM")


def engine_abi():
    with open(os.path.join(os.path.dirname(os.path.realpath(__file__)), "upstream/cxosc/engine_abi.inc"),
              encoding="utf-8") as f:
        return f.read()


def remix_include(modules, remix=None):
    return ".set HAVE_SYDRUM, 0\n" + engine_abi()


def machine_limits():
    with open(os.path.join(os.path.dirname(os.path.realpath(__file__)), "upstream/cxosc/machine_limits.inc"),
              encoding="utf-8") as f:
        return f.read()


def poly_include(modules, remix=None):
    have_ef = 0
    morph_path = os.path.join(_HERE, "upstream/cxosc/lfo_morph.inc.s")
    with open(morph_path, encoding="utf-8") as _lf:
        morph = _lf.read()
    return "\n".join((
        ".ifndef CX_PASS1",
        ".set CX_PASS1, 1",
        f".set HAVE_EF_CX, {have_ef}",
        ".set HK_MACHINE_ROWS, 0",
        ".set HAVE_SYDRUM, 0",
        ".else",
        morph,
        ".endif",
        "",
    ))



def machine_include(modules, remix=None):
    return "\n".join((
        ".set HAVE_SYDRUM, 0",
        ".set HK_MACHINE_ROWS, 0",
        remix_include(modules, remix),
        machine_limits(),
    ))


STOCK_RENDERER = bytes.fromhex("40004008")

# Keep MIDI / amp / envelope hooks from the v2.9 engine port
LFO_DEPTH_HOOK = 0x40003ca4
LFO_DEPTH_HOOK2 = 0x4000d03e
LFO_DEPTH_STOCK = bytes.fromhex("71722a12" "43f04a00")
LFO_PAGE_HOOK = 0x40031e62
LFO_PAGE_STOCK = bytes.fromhex("203c400d37f6" "606c")
LFD_EDIT_HOOK = 0x400392cc
LFD_EDIT_STOCK = bytes.fromhex("2003" "7406" "4c420807")
LFD_NAME_HOOK = 0x4003bff2               # LFO PMTR names (base ot_machines site; was 0x4003bff0 in octabam HOOKS)
LFD_NAME_STOCK = stock_guard(
    0x4003bff2, 8, "646fea5c7ac7852156feed7591534de986df92af53074c25ecf54e4295d072ae"
)
LFD_STAGE_HOOK = 0x40058488
LFD_MOVE_HOOK = 0x4003a45c
LFD_DRAW_HOOK = 0x400574cc
LFD_EDITUI_HOOK = 0x40039020
LFD_PEA_STOCK = bytes.fromhex("4879400d37f6")          # pea LFO_P
LFD_LEA_STOCK = bytes.fromhex("49f9400d37f6")          # lea LFO_P,a4 (draw)
LFD_LEA3_STOCK = bytes.fromhex("47f9400d37f6")         # lea LFO_P,a3 (edit)
MIDI_MAP_HOOK = 0x4000e746
MIDI_MAP_STOCK = bytes.fromhex("721d" "2b812c00")
MIDI_OFF_HOOK = 0x4000dfd4
MIDI_OFF_STOCK = bytes.fromhex("7310" "7113" "b081" "661c")
MIDI_GATE_HOOK = 0x4000e452
MIDI_GATE_STOCK = bytes.fromhex("2006" "5580" "7405" "b480")
RETRIG_HOOK = 0x4000c634
RETRIG_STOCK = bytes.fromhex("226f0072" "10309800")
STOP_HOOK = 0x4000b2c8
STOP_STOCK = bytes.fromhex("42b9" "46c80350")
KILL_HOOK = 0x4000685c
KILL_STOCK = bytes.fromhex("4200" "13808800")
REL_HOOK = 0x4000b51a
REL_STOCK = bytes.fromhex("266f0072" "2031bc00")
MIDI_OFFGATE_HOOK = 0x4000de10
MIDI_OFFGATE_STOCK = bytes.fromhex("5580" "7605" "b680")
MIDI_REC_HOOK = 0x400625e0
MIDI_REC_STOCK = bytes.fromhex("202a0004" "23c046c7e956")
MIDI_TRIG_HOOK = 0x4006262a
MIDI_TRIG_STOCK = bytes.fromhex("752a0002" "2042" "41f02c00")
AMP_STAGE_HOOK = 0x40059d56
AMP_STAGE_STOCK = bytes.fromhex("4879400d3988")
AMP_DRAW1_HOOK = 0x4003685a
AMP_DRAW1_STOCK = bytes.fromhex("49f9400d39c2" "47f9400d3a6a")
AMP_DRAW2_HOOK = 0x400368ac
AMP_DRAW2_STOCK = bytes.fromhex("2f39400d3b16" "2f39400d3b12")
AMP_DRAW3_HOOK = 0x40036946
AMP_DRAW3_STOCK = AMP_DRAW2_STOCK
AMP_EDIT_HOOK = 0x4003ae40
AMP_EDIT_STOCK = bytes.fromhex("0680400d3988" "2240" "2069012a")
AMP_LANE_HOOK = 0x4003af0a
AMP_LANE_STOCK = bytes.fromhex("41f98000083c" "11820800")
OCT_HOOK = 0x40051fce
OCT_STOCK = bytes.fromhex("4ab9400bebae")
ASSIGN_HOOK = 0x400795ba
ASSIGN_STOCK = bytes.fromhex("d1fc0008f04a" "1081")
FM_MAIN_COMMIT_HOOK = 0x4007981c
FM_MAIN_COMMIT_STOCK = stock_guard(
    FM_MAIN_COMMIT_HOOK, 6, "89c50ac3ca041fdf5647ec5ee2c3580f9a67dd79f0b5cc15ceadda4b9e9bede0"
)
LISTWIN_HOOK = 0x4005a848
LISTWIN_STOCK = bytes.fromhex("d1fc0008eda2" "7910")
LOADSEL_HOOK = 0x40022686
LOADSEL_STOCK = bytes.fromhex("4eb940013a08")

# Machine list (v2.15)
FM_NAME_HOOK = 0x400334d8
FM_NAME_STOCK = bytes.fromhex("2f02" "222f0008")
FM_NAMES_HOOK = 0x4003c928
FM_NAMES_STOCK = bytes.fromhex("4bf9400a78c8")
FM_NAME_A_HOOK = 0x4003d718
FM_NAME_A_STOCK = bytes.fromhex("41f9400a78c8")
FM_SETUP_ROW_HOOK = 0x4003c980
FM_SETUP_ROW_STOCK = bytes.fromhex("7110" "4fef0018")
FM_CHOOSER_ROW_HOOK = 0x400786c8
FM_CHOOSER_ROW_STOCK = bytes.fromhex("7110" "b480" "662e")
FM_SETUP_OPEN_HOOK = 0x400585dc
FM_SETUP_OPEN_STOCK = bytes.fromhex("1610" "7903" "4879400bb704")
FM_CHOOSER_OPEN_HOOK = 0x40078886
FM_CHOOSER_OPEN_STOCK = bytes.fromhex("7110" "2f00" "4879460e7386")
# SRC SETUP editor/drawer row*6 (BASE 0x40000400 -> file +0x3a12e / +0x3c998).
FM_EDIT6_HOOK = 0x4003a52e
FM_EDIT6_STOCK = bytes.fromhex("2002" "e788" "d482" "9082")
FM_DRAW6_HOOK = 0x4003cd98
FM_DRAW6_STOCK = bytes.fromhex("2e06" "e78f" "dc86" "9e86")
FM_TICK_HOOK = 0x4005221e
FM_TICK_STOCK = bytes.fromhex("4ebaff1c" "4eb94007e940")
FM_SRC_COMMIT_HOOK = 0x4005a616
FM_SRC_COMMIT_STOCK = bytes.fromhex("2239460d5c30")
FM_SRC_COMMIT2_HOOK = 0x4005a850
FM_SRC_COMMIT2_STOCK = bytes.fromhex("2239460d5c30")
FM_VALIDATE_HOOK = 0x40002318
FM_VALIDATE_STOCK = bytes.fromhex("4fefffa0" "48d77cfc")
FM_SOURCE_HOOK = 0x4000d514
FM_SOURCE_STOCK = bytes.fromhex("205c" "26c8" "48780010")
ML_WIN_COUNT_HOOK = 0x40079248
ML_WIN_COUNT_STOCK = bytes.fromhex("48780005" "48780006")
ML_SRC_COUNT_HOOK = 0x400585fa
ML_SRC_COUNT_STOCK = bytes.fromhex("48780005" "48780005")
ML_NAME_BOUND_HOOK = 0x4003c950
ML_NAME_BOUND_STOCK = bytes.fromhex("7204" "b282" "6504")
ML_DRAW_BOUND_HOOK = 0x40078678
ML_DRAW_BOUND_STOCK = bytes.fromhex("7004" "b082" "6d24" "2f02" "2043" "4e90")
ML_HI_BOUND_HOOK = 0x400786ce
ML_HI_BOUND_STOCK = bytes.fromhex("7004" "b082" "6d28")
ML_CUR_BOUND_HOOK = 0x40079904
ML_CUR_BOUND_STOCK = bytes.fromhex("7604" "b684" "6c00fec2")
ML_CLAMP_HOOKS = (0x40078c22, 0x40078cb0, 0x40078d2e, 0x40078dee, 0x40078e7c)
ML_CLAMP_STOCK = bytes.fromhex("7205" "b280" "6c02" "7005")
PAGE_STORE_HOOK = 0x40027e98
PAGE_STORE_STOCK = bytes.fromhex("162a0013" "7d03" "1e2a0012")
TRACK_PASTE_HOOK = 0x4002b99e
TRACK_PASTE_STOCK = bytes.fromhex("4879460c8122" "4ebafcae")
TRACK_UNDO_HOOK = 0x4002b962
TRACK_UNDO_STOCK = bytes.fromhex("4879460bf218" "4ebafcea")
PART_PASTE_HOOK = 0x40029b8a
PART_PASTE_STOCK = bytes.fromhex("4879460c8122" "4ebafeba")
PART_UNDO_HOOK = 0x40029b54
PART_UNDO_STOCK = bytes.fromhex("4879460bf218" "4ebafef0")
PREVIEW_HOOK = 0x40096d22
PREVIEW_STOCK = bytes.fromhex("7710" "23c346105424" "10bc0001")

MODULE = Module(
    name="cx-osc",
    key="CX OSC",
    kind=Kind.CF_PATCH,
    category=Category.MACHINES,
    proof=Proof.UNTESTED,
    proof_note="MKII USB (Nov 2026): accept, CX OSC playable, SETUP_ALL/FDBK; host gate test_cx_osc_port.py.",
    author="ilia-murzinov",
    author_url="https://github.com/ilia-murzinov",
    doc="Buchla-style complex oscillator as a machine: FM, a wavefolder, waveform morphs and feedback.",
    gates=(
        Gate("modules/cx-osc/verify.py", remix_arg=False),
    ),
    linked=(
        Linked("poly", os.path.join(_HERE, "standalone/poly.s"), cpu="5475", dram=True),
        Linked("fmmachine", os.path.join(_HERE, "standalone/machine.s"), cpu="5475", dram=True),
        Linked("page", os.path.join(_HERE, "upstream/cxosc/page.s"), cpu="5475", dram=True),
        Linked("cxreg", os.path.join(_HERE, "cx_registration.s"), cpu="5475", dram=True),
    ),
    detours=(
        Detour(LFO_DEPTH_HOOK, LFO_DEPTH_STOCK, "poly", "cx_lfo_standalone",
               "PMTR 30..34 (CMOR/MMOR/SYMM/FDBK/PWM) private LFO words; stock depth otherwise",
               kind="jmp", pad_to=8),
        Detour(LFO_DEPTH_HOOK2, LFO_DEPTH_STOCK, "poly", "cx_lfo_frame",
               "frame-builder LFO depth: CMOR/MMOR/SYMM/FDBK private words",
               kind="jmp", pad_to=8),
        Detour(LFO_PAGE_HOOK, LFO_PAGE_STOCK, "poly", "cx_lfo_page",
               "LFO page: PMTR count 34 on CX OSC (CMOR/MMOR/SYMM/FDBK)",
               kind="jmp", pad_to=8),
        Detour(LFD_EDIT_HOOK, LFD_EDIT_STOCK, "poly", "cx_lfo_pmtr_edit",
               "LFO SETUP PMTR walk includes 30/31 on CX OSC",
               kind="jmp", pad_to=8),
        Detour(LFD_STAGE_HOOK, LFD_PEA_STOCK, "poly", "cx_lfo_stage",
               "LFO SETUP stages CX PMTR destination count", kind="jmp"),
        Detour(LFD_MOVE_HOOK, LFD_PEA_STOCK, "poly", "cx_lfo_move",
               "LFO SETUP row move stages CX PMTR count", kind="jmp"),
        Detour(LFD_DRAW_HOOK, LFD_LEA_STOCK, "poly", "cx_lfo_draw",
               "LFO SETUP draws CAR/MOD/SYMM/FDBK/PWM PMTR labels", kind="jmp"),
        Detour(LFD_EDITUI_HOOK, LFD_LEA3_STOCK, "poly", "cx_lfo_edit",
               "LFO SETUP edits CX PMTR destination count", kind="jmp"),
        Detour(MIDI_MAP_HOOK, MIDI_MAP_STOCK, "poly", "po_mon",
               "MIDI IN note-on", kind="jmp"),
        Detour(MIDI_OFF_HOOK, MIDI_OFF_STOCK, "poly", "po_moff",
               "MIDI IN note-off", kind="jmp", pad_to=8),
        Detour(REL_HOOK, REL_STOCK, "poly", "po_rel",
               "AMP-release consumer", kind="jmp", pad_to=8),
        Detour(STOP_HOOK, STOP_STOCK, "poly", "po_stop",
               "STOP ends engine voices", kind="jmp"),
        Detour(RETRIG_HOOK, RETRIG_STOCK, "poly", "po_retrig",
               "sequencer START rewrite", kind="jmp", pad_to=8),
        Detour(KILL_HOOK, KILL_STOCK, "poly", "po_kill",
               "voice kill", kind="jmp"),
        Detour(MIDI_GATE_HOOK, MIDI_GATE_STOCK, "poly", "po_mgate",
               "MIDI note gate", kind="jmp", pad_to=8),
        Detour(MIDI_OFFGATE_HOOK, MIDI_OFFGATE_STOCK, "poly", "po_mogate",
               "MIDI note-off gate", kind="jmp"),
        Detour(MIDI_REC_HOOK, MIDI_REC_STOCK, "poly", "po_mrec",
               "MIDI live recorder", kind="jmp", pad_to=10),
        Detour(MIDI_TRIG_HOOK, MIDI_TRIG_STOCK, "poly", "po_mtrig",
               "MIDI with trig held", kind="jmp", pad_to=8),
        Detour(OCT_HOOK, OCT_STOCK, "poly", "po_octave",
               "FUNC+UP/DOWN octave", kind="jmp"),
        Detour(AMP_STAGE_HOOK, AMP_STAGE_STOCK, "poly", "po_ampstage",
               "AMP SETUP LEG staging", kind="jmp"),
        Detour(AMP_DRAW1_HOOK, AMP_DRAW1_STOCK, "poly", "po_ampdraw1",
               "AMP SETUP drawer names", kind="jmp", pad_to=12),
        Detour(AMP_DRAW2_HOOK, AMP_DRAW2_STOCK, "poly", "po_ampdraw2",
               "AMP SETUP drawer nibbles", kind="jmp", pad_to=12),
        Detour(AMP_DRAW3_HOOK, AMP_DRAW3_STOCK, "poly", "po_ampdraw3",
               "AMP SETUP drawer nibbles", kind="jmp", pad_to=12),
        Detour(AMP_EDIT_HOOK, AMP_EDIT_STOCK, "poly", "po_ampedit",
               "AMP page-2 LEG editor", kind="jmp", pad_to=12),
        Detour(AMP_LANE_HOOK, AMP_LANE_STOCK, "poly", "po_amplane",
               "AMP LEG live-lane suppress", kind="jmp", pad_to=10),
        Detour(ASSIGN_HOOK, ASSIGN_STOCK, "poly", "po_assign",
               "slot assign became-CXOSC", kind="jmp", pad_to=8),
        Detour(LISTWIN_HOOK, LISTWIN_STOCK, "poly", "po_machlist",
               "sample-list window", kind="jmp", pad_to=8),
        Detour(LOADSEL_HOOK, LOADSEL_STOCK, "poly", "po_loadsel",
               "file browser", kind="jsr"),
        Detour(FM_SOURCE_HOOK, FM_SOURCE_STOCK, "poly", "po_fmsource",
               "frame builder supplier", kind="jmp", pad_to=8),
        Detour(PAGE_STORE_HOOK, PAGE_STORE_STOCK, "fmmachine", "fm_page_store",
               "SRC page store guard", kind="jmp", pad_to=10),
        Detour(TRACK_PASTE_HOOK, TRACK_PASTE_STOCK, "fmmachine", "fm_track_paste",
               "track paste guard", kind="jmp", pad_to=10),
        Detour(TRACK_UNDO_HOOK, TRACK_UNDO_STOCK, "fmmachine", "fm_track_undo",
               "track undo guard", kind="jmp", pad_to=10),
        Detour(PART_PASTE_HOOK, PART_PASTE_STOCK, "fmmachine", "fm_part_paste",
               "Part paste guard", kind="jmp", pad_to=10),
        Detour(PART_UNDO_HOOK, PART_UNDO_STOCK, "fmmachine", "fm_part_undo",
               "Part undo guard", kind="jmp", pad_to=10),
        Detour(PREVIEW_HOOK, PREVIEW_STOCK, "fmmachine", "fm_preview",
               "FLEX preview guard", kind="jmp", pad_to=10),
        Detour(
            RESOLVER_HOOK, RESOLVER_STOCK, "page", "pg_resolve",
            "PLAYBACK page resolver for CX OSC tracks (DRAM page)", kind="jmp",
        ),
    ),
)
