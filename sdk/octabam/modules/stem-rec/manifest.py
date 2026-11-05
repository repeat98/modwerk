"""STEM REC -- tracks to the card while the sequencer plays, streamed.

Modwerk's card build of STEM REC (https://github.com/yvesrosius/octabam,
modules/stems); upstream/manifest.py is the original. This copy differs in four ways, each named in
sdk/imports/stem-rec-*.json:

  1. No `requires`: Modwerk's builder places DramRegions at the top of its
     fixed platform reserve, where octabam's MEMORY module sizes one.
  2. No YES detour (0x4005e4c8): APPLY SCENE patches that site and a card
     build has no key bus, so the main page's YES double tap is left out.
     UP + REC and the YES on STEM REC's own row are unchanged.
  3. The gain table comes in as stock copies (guarded spans of the user's
     OS, filled at build time) instead of an `.incbin` of the OS slice.
  4. The displaced stock instructions are named by stock guards (address,
     length, SHA-256), not written out.

UP + REC opens STEMS (toggle), drawn as SYSTEM > PERSONALIZE; REC alone
stays stock. In STEMS, YES on STEM REC arms a recording, or starts one if
the sequencer is running; again, it stops it, and so does the sequencer
stopping or 60 minutes. T1 to T8, MAIN, CUE and the pairs AB and CD turn
sources on and off (T1 alone at boot; locked during a take); a pair's STEREO
(on at boot) records it as one stereo file, or each of its inputs that's on
as a mono one; 24 BIT (on at boot) records 24-bit files. Each take is a
folder and each source a file in it, <set>/AUDIO/!STEMS/YYMMDD-HHMM/
YYMMDD-HHMM-<name>.wav: the tracks after the fader, MAIN and CUE as mixed,
the inputs raw.

HOW: a detour at the per-frame routine's only call site (0x40004b12) mirrors
core 0's MAIN gains every frame and, while a take runs, packs each source
into its file's own ring in the 8 MiB ring region, through the uncached
alias, as the file's bytes; a task of the module's own streams each ring's
whole sectors to the card, straight from the ring, through the file layer's
raw sector routines, then rewrites each file's header and sets its length.
The ring, the task's stack and the sector-0 copies are DramRegions.
"""

from remix.schema import Category, Detour, DramRegion, Gate, Kind, Linked, Module, Proof, StockCopy
from remix.stock_guard import stock_guard

# The per-frame routine's only call site, inside the audio interrupt at IPL
# 5: a jsr and the SR write after it. The hook performs both, so a jsr and a
# nop replace them.
FRAME_SITE = 0x40004B12
# The stock PIO write routine (0x40014c48), right after its wait for DRQ:
# the stub streams the first sector after advancing the handler's pointer and
# count, not before, and returns through stock's epilogue.
ATA_FIRST_SITE = 0x40014CFE
# The REC press handler: UP held opens STEMS instead; REC alone falls
# through to stock.
REC_SITE = 0x40048774
# The UI task's loop, after its queue_receive returns: the stub replays the
# displaced instructions and redraws STEMS when its labels changed. TUNER
# claims the loop's head, 0x40056c72.
UI_RECV_SITE = 0x40056C7C

# Core 0's gain table (X:0x6c00, 258 words, 3 bytes each, little-endian),
# copied from the user's OS at build time in chunks of at most 32 bytes:
# (offset, length, SHA-256 of the chunk).
GTAB_ADDR = 0x400EA18A
GTAB_CHUNKS = (
    (0, 32, "7f115797b4617e91b6d1a5d3034b451c7ce1167804086d7a8d5cbbc43db7b8d7"),
    (32, 32, "d8e52536dd0310844f52ae872b3df325bbad9dd92b66fc6ad1633f8e0aaddb7d"),
    (64, 32, "d81a5d6a247cde36b97b9509bdf9df8397dd6dd6148cbe6f2a086bdf12b7c35f"),
    (96, 32, "61d8204174dfc4122f65f1a553b5dff0bf6bb3670b75fd7f257351a71a2f6da1"),
    (128, 32, "8cafb80ee98a0458ddae28e9fa1f1d6f324e52fd3c0c012e656a00161c46f4ae"),
    (160, 32, "e8cc61ebc8a2376f3284d529d8f3d3df0f6f4cc5940bf817f55534afb04baebb"),
    (192, 32, "9f0af43d3cced4a509bec724f831fa7ba8c509b17c329309ddaaccb13faed4ff"),
    (224, 32, "8c044e7625a6d0599339534e6cfe73a8632722835db65326cf6f03ff95f0ff59"),
    (256, 32, "c5e12b2f136391ab196d9fed5217d08bb150af964717735f3997fd61e51df3bf"),
    (288, 32, "88d711b2d2d1c4c8699940af7b12ccd7f2bba2d1d98e5191bb1fa0e1db402db3"),
    (320, 32, "1e0589f2458343ffbdd4274d79a25d56796531f6dc5066f420d54c0eb9f480db"),
    (352, 32, "7bbb0e1320fe7d22e215dd4abab1ca938b2f961cc1199ce2218eec4d4862f9dc"),
    (384, 32, "19caf5b64a33d2f814403e5ded758258454a365c61fe8aa024c23ea05feae997"),
    (416, 32, "fa63fd1e8b338c6207a6245c3b3c76575ce98794e9467580d39f02d9cdae9c2e"),
    (448, 32, "e69ddd0e538336b11ca74ce214460ad59dc85523fde565bc13bbfe2ea5852e19"),
    (480, 32, "204c8017733fbbb28484904b1b7d9cd86a208873b67245eea5529dab43807f14"),
    (512, 32, "9657a33244677f33875767b58486a4f2489f4fbb125016fd697a8bc92dae3c35"),
    (544, 32, "40fe62dcd001090f1c8875b9711b72dd1215225c9265625800be138ba9e46f08"),
    (576, 32, "d047a0e97273dc227363e8a2405b5d82d7e7ac9819de7fc4cbfe7dfdb19998ab"),
    (608, 32, "f530fed4edf64e5ff3fa84391675cc94faacfabe78e91409a3660995496a1ca4"),
    (640, 32, "7629feca4ec79355fc44877456189290e5d0d4d883ba326407ee5196538686d5"),
    (672, 32, "a0e2cd49f2276781bee185ba954769c0ab6788ed2c6d78503d76bf8372944d78"),
    (704, 32, "281d6703a025d6a289c0fcd8697dfdfd22be1920f4e79f488c047cfe8f80fb6b"),
    (736, 32, "1a46f915bdcb70abd0175efc19020993056ee70dba061785d589ea043d523136"),
    (768, 6, "ec133f6cfab42e9acfaad41d012e0e0ac6bc37a6c7d01e349d6ce9cbe8d96ce5"),
)


def gtab_symbol(offset):
    return "stems_gtab" if offset == 0 else f"stems_gtab_{offset}"


def gtab_inc(modules, remix=None):
    """remix.inc for stems.s: stems_gtab as zero placeholders, one labelled
    chunk each, which the stock copies fill from the user's OS."""
    names = [gtab_symbol(o) for o, _, _ in GTAB_CHUNKS]
    lines = ["| remix.inc -- STEM REC's copy of core 0's gain table, filled from the user's OS",
             "        .global " + ", ".join(names)]
    for (o, n, _), name in zip(GTAB_CHUNKS, names):
        lines += [f"{name}:", f"        .space  {n}"]
    return "\n".join(lines) + "\n"


MODULE = Module(
    name="stem-rec",
    key="STEM REC",
    kind=Kind.CF_PATCH,
    category=Category.MACHINES, author="yvesrosius", author_url="https://github.com/yvesrosius",
    proof=Proof.HARDWARE, proof_note="Yves's MKII: this card build as STEMMW1 (5 Nov 2026), two takes of eleven "
        "24-bit files; built and booted under ot_emu (verify.py)",
    doc="Multitrack recording to the card: each track (after its fader), MAIN, CUE and the "
        "inputs as separate WAV files, 16 or 24 bits, up to 60 minutes. UP + REC opens STEMS.",
    linked=(Linked("stems", "modules/stem-rec/stems.s", dram=True, include=gtab_inc,
                   stock_copies=tuple(StockCopy(gtab_symbol(o), stock_guard(GTAB_ADDR + o, n, sha))
                                      for o, n, sha in GTAB_CHUNKS)),),
    detours=(Detour(FRAME_SITE, stock_guard(FRAME_SITE, 8, "61457fda52e39497654f67af6f3e0507e7135c9ac711c31c1c69add361dabeac"),
                    "stems", "stems_frame_hook",
                    "per-frame tap: the enabled tracks into the ring, then the stock routine",
                    kind="jsr", pad_to=8),
             Detour(ATA_FIRST_SITE, stock_guard(ATA_FIRST_SITE, 6, "0b7f6672fbe969f01a10e02ad5a4839b5b9e88ee5ea8a8a45b8eed136ed7b232"),
                    "stems", "stems_ata_first",
                    "the PIO write's first sector, pointer and count advanced first",
                    kind="jmp"),
             Detour(REC_SITE, stock_guard(REC_SITE, 8, "7248c8f0aa7a9f2ca441781f8220afbc1fa171f8aa359acd7c436d71dcff4af5"),
                    "stems", "stems_rec_key",
                    "REC press: UP held toggles STEMS; else stock grid recording",
                    kind="jmp", pad_to=8),
             Detour(UI_RECV_SITE, stock_guard(UI_RECV_SITE, 6, "b38eeb8378eeb038720571203272ff9edfd0b483c17a68b0013897ceaa0412d4"),
                    "stems", "stems_ui_tick",
                    "the UI task's next message: redraw STEMS when its labels moved",
                    kind="jmp"),),
    dram_regions=(DramRegion("stems_ring", 0x800000),
                  DramRegion("stems_stack", 0x2000),
                  DramRegion("stems_buf", 14 * 512, align=512),),
    gates=(Gate("modules/stem-rec/verify.py", remix_arg=False),),
)
