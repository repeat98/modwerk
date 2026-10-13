"""SY DRUM -- a drum machine for the Octatrack's FLEX tracks, modelled on a classic
analog drum synthesizer (the SY-1 circuit; README.md), one voice a track, running on SYNTH
MACHINE's engine: chosen in the machine list (SELECT MACHINE TYPE or SRC SETUP: the
row after FM SYNTH), it plays PTCH MODE WDTH SWEP SPED DEC on its PLAYBACK page (stock
p-locks, LFOs and scenes reach them) with a dedicated LFO / S&H on its PLAYBACK SETUP
page (LSPD LDEP WAVE S&H: the Part's defaults, each lockable per step -- the development
line's dedicated step locks, kept in sylockNN files beside the project's banks). Requires
SYNTH MACHINE (synth/): the machine
list, the sample-free voice transport, the engine-owned AMP envelope, the keys and MIDI
are that module's; SYNTH MACHINE assembles its calls into this unit when SY DRUM is in
the remix (synth/manifest.py remix_include: HAVE_SYDRUM).

One DRAM unit (sydrum.s, with engine.inc.s, the step locks' sources and
synth/engine_abi.inc through its remix.inc), a 2 MiB DramRegion (the lock table) and 53
detours of its own: the page resolver's epilogue (0x40031ed6), where a SY DRUM track gets
its PLAYBACK page, the setup editor (0x4003a524), and the step locks' 51 (sequencer, UI,
clipboard, card I/O; LOCK_HOOKS). Not with STEM REC: the lock table and STEM REC's buffers
together exceed the platform reserve (conflicts). Verified in ot_emu (README.md).
"""

import os

from remix.stock_guard import stock_guard
from remix.schema import Category, Detour, DramRegion, Kind, Linked, Module, Proof

# This module's directory relative to the build's cwd (octabam's repo root): "modules/
# sy-drum" checked out directly, "modules/sy-drum/upstream/sy-drum" as octabam's
# submodule of timhastie/octatrick-modules. SYNTH MACHINE's directory is its sibling.
_HERE = os.path.relpath(os.path.dirname(os.path.realpath(__file__)))
_DIR = os.path.dirname(os.path.realpath(__file__))


def _read(*parts):
    with open(os.path.join(_DIR, *parts), encoding="utf-8") as source:
        return source.read()


def remix_include(modules):
    """sydrum.s's remix.inc, included twice: pass 1 at the top of the unit -- the flag
    SYNTH MACHINE's units use (always 1 here: SY DRUM requires SYNTH MACHINE and is in this
    remix) and the equates the two share (synth/engine_abi.inc, one copy); pass 2 at its
    end -- the engine (engine.inc.s), whose 40 KB of tables would otherwise put the glue's
    16-bit references out of reach, then the step locks (the setup stage, the lock table's
    code, the sequencer / UI / clipboard hooks and the card I/O; LOCKS below)."""
    return "\n".join((".ifndef SD_PASS1", ".set SD_PASS1, 1", ".set HAVE_SYDRUM, 1",
                      _read("..", "synth", "engine_abi.inc"), ".else", _read("engine.inc.s"),
                      *(_read(name + ".inc.s") for name in LOCKS), ".endif", ""))


# The step locks' sources, in the unit after the engine (pass 2 of remix.inc).
LOCKS = ("setup_stage", "locks_store", "locks_seq", "locks_ui", "locks_sparse", "locks_clip",
         "locks_transform", "locks_delete", "locks_live", "locks_io")


PAGE_HOOK = 0x40031ed6                  # `moveml %sp@,%d2-%d5; lea %sp@(16),%sp` (the page resolver's epilogue)
PAGE_STOCK = stock_guard(PAGE_HOOK, 8, "185563f89a350a9dafa830e003e1f364a0924eac9252760a48b05ce4266db463")
SETUP_EDIT_HOOK = 0x4003a524            # `lea 0x400d5f38,%a0; moveal %a0@(0,%d2:l:4),%a5` (the PLAYBACK SETUP editor)
SETUP_EDIT_STOCK = stock_guard(SETUP_EDIT_HOOK, 10, "5fcdfa76b149403ffc5c9e965ab4f72c0792156a1191eba88132e0de418f1307")

# The step locks' stock hooks (the development line's, 8 Oct 2026, less its setup-scene and
# LFO-destination hooks): (address, the displaced instructions, the routine, what it does).
# Each is a jmp detour padded to the displaced length; the routines are in locks_*.inc.s.
LOCK_HOOKS = (
    (0x4000bafe, stock_guard(0x4000bafe, 8, "9127ff5b8f4845a81a10deda9554796ba9ed6501e08ce308b04f046b3bc50d74"), "sl_seq_consume",
     "Accepted/due event queue copy; d5 queueIndex=slot*8+track."),
    (0x4000c422, stock_guard(0x4000c422, 6, "38745d184855ca6e210f5229966abac017f1f536d9224187b2a42bed756560a5"), "sl_seq_full_restore",
     "Full Part/default publication and same-Part reload clear prior native lock state; preserve pending accepted row."),
    (0x4000c62e, stock_guard(0x4000c62e, 6, "b05db0e2c6e818a323c3e72cc9a8a5070faf9d4fff1106356df02553a940850b"), "sl_seq_publish",
     "After native lock restoration and application, before existing po_retrig."),
    (0x40022c16, stock_guard(0x40022c16, 6, "503cc83327f17ac270360f256196789c6cf7a061489249142f90cabf7bed632f"), "sl_io_background_request",
     "locks-only background dirty predicate"),
    (0x4005224a, stock_guard(0x4005224a, 8, "1f32afe109a68799b4ab5f3772a8ffd7f113cee714374eda804945044d91fe3d"), "sl_io_tick_hook",
     "UI tick's transport test: while the sequencer plays, the lock files' own background flush"),
    (0x40026768, stock_guard(0x40026768, 6, "1f78fbfb9a5a1d1d0517417369c81f72056176e41d1cb3e803cd8088b94455a9"), "sl_clip_raw_capture_hook",
     "SY DRUM step lock clip raw capture hook"),
    (0x4002689c, stock_guard(0x4002689c, 8, "1a241bd7b3090391ae8bfc0352ae22425a70817ccd477fa5d7aba231b95b8bc9"), "sl_clip_page_copy_hook",
     "SY DRUM step lock clip page copy hook"),
    (0x40026990, stock_guard(0x40026990, 8, "1a241bd7b3090391ae8bfc0352ae22425a70817ccd477fa5d7aba231b95b8bc9"), "sl_clip_page_undo_hook",
     "SY DRUM step lock clip page undo hook"),
    (0x40026eb0, stock_guard(0x40026eb0, 10, "1026d523a4f46be54546a3e5b42d970c6847f7899b5a007cccd51216361d6d11"), "sl_clip_pat_copy_hook",
     "SY DRUM step lock clip pat copy hook"),
    (0x40026ef0, stock_guard(0x40026ef0, 8, "4c6de0100c3e5eb1e6fc9b7e0d99266f375aef1318b8e3757199f2924e182e85"), "sl_clip_pat_undo_hook",
     "SY DRUM step lock clip pat undo hook"),
    (0x400294c0, stock_guard(0x400294c0, 8, "aafc8f979f6aeb11a4358bcf7b01706892acebe4c40d3e520f88528b3cac80a8"), "sl_clip_track_capture_hook",
     "SY DRUM step lock clip track capture hook"),
    (0x40029754, stock_guard(0x40029754, 8, "57ce6a873a72d55110bfba4569069ecc773810ea4134eb9191e9c6c1ccaa0714"), "sl_clip_full_capture_hook",
     "SY DRUM step lock clip full capture hook"),
    (0x4002a38c, stock_guard(0x4002a38c, 8, "9d8b5c6fa44fca2b22f8cb24de82782737e5615dff673baad1c7423135d0d27f"), "sl_clip_track_store_hook",
     "SY DRUM step lock clip track store hook"),
    (0x4002aefc, stock_guard(0x4002aefc, 8, "9763fb611c807f5dc904f9b5ee15ae74bda1e39d0f9e46671289a147cd2daaa7"), "sl_clip_page_store_hook",
     "SY DRUM step lock clip page store hook"),
    (0x4002b450, stock_guard(0x4002b450, 6, "8521e13dbb173ca0918443c83caf86ae18f86aefdb67d09dfbfa23f822053fe8"), "sl_clip_raw_restore_hook",
     "SY DRUM step lock clip raw restore hook"),
    (0x4002b654, stock_guard(0x4002b654, 8, "3e7c95b32f444fd280cb96b2a6ea90525fe223d6e6b9352086d2cf41941ae854"), "sl_clip_full_store_hook",
     "SY DRUM step lock clip full store hook"),
    (0x4002b9b0, stock_guard(0x4002b9b0, 8, "efa23c0a55aebcd8ffb29c8ba97d3970d8e88ed9c16272d7b5ea0b4e8309ecf5"), "sl_clip_pat_store_hook",
     "SY DRUM step lock clip pat store hook"),
    (0x4002bf38, stock_guard(0x4002bf38, 8, "2f00d9fdb64f51c6d0127dfa877aafe06a2b563333fd0cf980219fbddab7e663"), "sl_sparse_capture_hook",
     "Snapshot native tag1 selected-trig clipboard or undo companion rows"),
    (0x4002cb92, stock_guard(0x4002cb92, 8, "4c84d29db6ad3c55ff49e18d8710dd799b0a217a3fdf31ff931161ab4072749c"), "sl_sparse_store_hook",
     "Paste companion row using exact native selected-trig mapping"),
    (0x40033aac, stock_guard(0x40033aac, 8, "f104315925f98abf6c188a4f4a881e112b5853119a570e5c603d34432837fe39"), "sl_ui_cache_full_tail",
     "Overlay companion locks after full native has-lock cache refresh"),
    (0x40033b32, stock_guard(0x40033b32, 8, "185186ff675407f6190e294d2b11a5ff985e5bee7c7485d7678db0be97893c10"), "sl_ui_cache_row_tail",
     "Overlay companion locks after native single-row cache refresh"),
    (0x400388a8, stock_guard(0x400388a8, 8, "f43e013ef43cd87b96b92b3069a52bdd86f668da5abc30168cca144d58c0261d"), "sl_live_erase_hook",
     "Clear companion rows at actual live playhead for full trig or all-lock erase"),
    (0x40038b06, stock_guard(0x40038b06, 8, "f1c88be8c97ae96dc5e8f024c7dac1e5eabc1abb0fa1dc26d1c142522f7a3a65"), "sl_live_erase_tail",
     "Retain companion has-lock bit after native selected-column live erase"),
    (0x400398b4, stock_guard(0x400398b4, 8, "52dccc03e103dca3839c839017cffce1d4a1e675d8dfb2804764141e86c63841"), "sl_clear_page_hook",
     "Clear companion rows with native audio page clear"),
    (0x40039df4, stock_guard(0x40039df4, 8, "0c6d3f0bfd198ddc78800e6503eccdc6cbc5c442209d882244584eda864e93ca"), "sl_clear_track_hook",
     "Clear companion rows when native clears normal audio track sequence"),
    (0x4003a614, stock_guard(0x4003a614, 10, "ad14a643a51b28ae439d5e7d2988b9e42dd2b973b4e1a2ae230b8a6ecd99435f"), "sl_live_edit_hook",
     "SY DRUM step lock live edit hook"),
    (0x4003d916, stock_guard(0x4003d916, 8, "d76f469591191c1c7b41715238acb38172b1f7be3d1d07d862a2d46fe53ca2e1"), "sl_shift_hook",
     "Rotate companion rows over exact native active sequence length"),
    (0x40040e14, stock_guard(0x40040e14, 8, "52dccc03e103dca3839c839017cffce1d4a1e675d8dfb2804764141e86c63841"), "sl_clear_selected_hook",
     "Clear companion rows with native selected-trig/all-locks clear"),
    (0x4005040c, stock_guard(0x4005040c, 8, "82f9c301aead4e1a90d91f8f679ba9cb91d05c1ed69dcc1c270dc59485285f1e"), "sl_ui_key_hook",
     "Dedicated setup encoder press/release on held audio trigs"),
    (0x40050fd6, stock_guard(0x40050fd6, 6, "a56b367231e7d77a7c24613c65d499e76fae9c1b1a0cec40037b6e7bf0b437d8"), "sl_ui_trig_press_hook",
     "a trig press changed the held mask -- redraw an open SY DRUM PLAYBACK SETUP window, then the stock call"),
    (0x4005fbd2, stock_guard(0x4005fbd2, 6, "a56b367231e7d77a7c24613c65d499e76fae9c1b1a0cec40037b6e7bf0b437d8"), "sl_ui_trig_rel_hook",
     "a trig release changed the held mask -- redraw an open SY DRUM PLAYBACK SETUP window, then the stock call"),
    (0x400508e4, stock_guard(0x400508e4, 8, "2207fffe6c6df168aa44f4d606cde43662645ed9419bdd8f89b00259d5778c93"), "sl_ui_held_knob_hook",
     "Handle SY DRUM dedicated setup held-trig knob map before native modal-window rejection"),
    (0x400603f2, stock_guard(0x400603f2, 6, "d317798a5e6f5ff9e9d75b8f659bd29463e1f73689d72c532df8029adfa081ba"), "sl_grid_delete_hook",
     "Clear companion row after ordinary GRID tap-delete clears the native audio lock row inline."),
    (0x4008485e, stock_guard(0x4008485e, 6, "0bc2ef188c68224486591693fb94e822b6cc59b94e31323c678457ef5363120e"), "sl_io_dispatch",
     "engine dispatch preflush/context"),
    (0x4008ec4c, stock_guard(0x4008ec4c, 8, "d2d2ad55cf4a4dffa571fd968940e80d2baadc54b64ae62376a41653870f3755"), "sl_io_delete",
     "remove only known lock companions on explicit project delete"),
    (0x4008eda4, stock_guard(0x4008eda4, 8, "da4b8bf41daeba784e24ed3a16d4ef7c5f6397ee3db9e47c007b1022b395d2b9"), "sl_io_bank_store",
     "selected mask STORED save"),
    (0x4008ee74, stock_guard(0x4008ee74, 8, "7d5c431d467d3f7e6d9e050e69120eb7faae9c6eede0a0b6c5a8e01f12a224cc"), "sl_io_project_store",
     "project WORK/STORED save"),
    (0x4008f0b0, stock_guard(0x4008f0b0, 8, "da4b8bf41daeba784e24ed3a16d4ef7c5f6397ee3db9e47c007b1022b395d2b9"), "sl_io_bank_restore",
     "selected mask saved restore"),
    (0x4008f180, stock_guard(0x4008f180, 8, "7d5c431d467d3f7e6d9e050e69120eb7faae9c6eede0a0b6c5a8e01f12a224cc"), "sl_io_project_restore",
     "project saved lock restore"),
    (0x400905d4, stock_guard(0x400905d4, 8, "604756f90fe2564cd1c75b712a1c239b10ef2db438579e307632b3382bacd165"), "sl_io_banks_load",
     "validated project cache load"),
    (0x400909d8, stock_guard(0x400909d8, 10, "04b9d7a74c6bd182603087f929a77f363eac1667a5135d86b8fda1c6d35d9b82"), "sl_io_clear",
     "clear project cache, clip and sequencer state"),
    (0x400912c4, stock_guard(0x400912c4, 8, "ef3b763ec7fe48e228294def257018f5a1753bd89854058291f5ed24af485e1d"), "sl_io_export",
     "carry validated companion pair to export"),
    (0x400917c8, stock_guard(0x400917c8, 8, "b692e058a2f3049810c18b0571d61c085c3daba589a09b531fed42f528b96012"), "sl_io_banks_save",
     "WORK flush and SAVE TO NEW/empty destination"),
    (0x400919e4, stock_guard(0x400919e4, 8, "74c5c24f09bf544b8fad303723b3935f248a9f48eefdbd230049cf63bd8fee5e"), "sl_io_card_sync",
     "all dirty lock banks before card SYNC"),
    (0x4009a664, stock_guard(0x4009a664, 8, "2effba8e990d9a5e8d0ccefb64ff38bff78d39b97a08de89d32a809d669697ce"), "sl_page_nonempty_tail",
     "Protect companion-only destination page from scale auto-overwrite"),
    (0x4009b220, stock_guard(0x4009b220, 8, "04c6b670df9acf88738d96b42b425126ef6eb1b19681ddbad2f9a6aa460f881a"), "sl_seq_queue_clear",
     "Stock future queue reset only; active/pending/scratch preserved."),
    (0x4009b86e, stock_guard(0x4009b86e, 6, "280015090fac9b58d39bf5bcd9f920fcbab7973643dbf5ce8300be5098b299c7"), "sl_seq_promote_a",
     "First native scratch-to-queue-zero promotion; d3 track."),
    (0x4009c04e, stock_guard(0x4009c04e, 6, "280015090fac9b58d39bf5bcd9f920fcbab7973643dbf5ce8300be5098b299c7"), "sl_seq_promote_b",
     "Second native scratch-to-queue-zero promotion; d4 track."),
    (0x4009c8bc, stock_guard(0x4009c8bc, 8, "e398ae4718aa25b1a93c5bce98f6ab1c42cf49239c934a30b67dee219734f4a9"), "sl_duplicate_hook",
     "Duplicate companion page for explicit or scale-driven audio page duplication"),
    (0x4009d1e8, stock_guard(0x4009d1e8, 8, "9921e7a2179ac4fdb8cde53f686de2defea4b78e13c5a2c3e88958b635063458"), "sl_seq_produce",
     "Stock audio queue producer prologue; source bank/pattern/step are cdecl arguments."),
    (0x4009d39e, stock_guard(0x4009d39e, 8, "65b427004cad9ff6b83cd000147daf500848cd9b33cf89eb948bdcf4be58e266"), "sl_seq_eligible",
     "After native condition acceptance; ephemeral dedicated-only lock trigger acceptance."),
)

# The lock table: 16 banks x 8,192 rows x 16 bytes, uninitialised DRAM at the top of the
# platform's arena reserve (locks_store.inc.s; sl_reset fills it before any reader).
LOCK_TABLE_BYTES = 16 * 8192 * 16

MODULE = Module(
    name="sy-drum",
    key="SY DRUM",
    kind=Kind.CF_PATCH,
    requires=("SYNTH MACHINE",),
    category=Category.MACHINES,
    author="timhastie/octatrick-modules",
    author_url="https://github.com/timhastie/octatrick-modules",
    proof=Proof.PORT,
    proof_note="ot_emu (MKII panel, DSP lockstep) with SYNTH MACHINE 2.11: the machine-list walk, "
               "renders sample-identical to the development builds' on-board engine, save / reload; not yet on hardware",
    doc="SY DRUM in the machine list (after FM SYNTH): an analog-style drum machine, one voice a track, on FLEX "
        "tracks -- PTCH MODE (A..F) WDTH SWEP SPED DEC with stock p-locks, LFOs and scenes, and a "
        "dedicated LFO / S&H (LSPD LDEP WAVE S&H) on its PLAYBACK SETUP page, lockable per step "
        "(sylockNN files beside the banks). Needs SYNTH MACHINE.",
    linked=(
        Linked("sydrum", os.path.join(_HERE, "sydrum.s"), cpu="5475", dram=True, include=remix_include),
    ),
    detours=(
        Detour(PAGE_HOOK, PAGE_STOCK, "sydrum", "sd_page",
               "the page resolver's epilogue: the PLAYBACK page of a FLEX track with SY DRUM chosen (\"SY\", 1) "
               "is SY DRUM's (PTCH MODE WDTH SWEP SPED DEC; its SETUP half LSPD LDEP WAVE S&H); every other "
               "lookup untouched",
               kind="jmp", pad_to=8),
        Detour(SETUP_EDIT_HOOK, SETUP_EDIT_STOCK, "sydrum", "sd_setup_edit",
               "PLAYBACK SETUP editor on SY DRUM's page: held trigs edit the step locks, a default edit "
               "releases the playing step's lock of that control; every other page stock",
               kind="jmp", pad_to=10),
    ) + tuple(Detour(address, stock, "sydrum", symbol, what, kind="jmp",
                     pad_to=len(stock))
              for address, stock, symbol, what in LOCK_HOOKS),
    dram_regions=(DramRegion("sl_work_table", LOCK_TABLE_BYTES),),
    conflicts=(("KITS", "both hook the project load / save / reload / clear jobs and the pattern clipboard "
                        "(SY DRUM's step-lock files and clipboard)"),
               ("PLOCKS P2", "both hook the sequencer's lock queue and clear paths and the held-trig encoder "
                             "(SY DRUM's step locks)"),
               ("STEM REC", "both take DRAM regions at the top of the platform reserve: SY DRUM's 2 MiB lock table "
                            "and STEM REC's ring, stack and stream buffers do not fit it together (the build "
                            "refuses: the runtime would end above the lowest region)"),),
)
