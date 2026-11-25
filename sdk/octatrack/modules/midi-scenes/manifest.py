"""MIDI SCENES -- scene locks for the MIDI tracks, after bkkbrls-del's midisc.

Stock 1.40C keeps scene locks for the audio tracks only. This module adds a
second table (MSC, `scene<<8 | track<<5 | flat`, 4096 bytes per Part, 0xff =
no lock) and routes the scene hold, the encoder press, the lock LEDs, the
crossfader and the scene clear / copy / paste rows to it when a MIDI track is
displayed. The mix follows the Part that plays (pattern switch, queued
pattern, Part event, panel write).

Port of Sam Banks' rewrite in octabam (modules/midi-scenes at f7d72906, MIT;
Sam's OK, 13 November 2026), which follows bkkbrls-del's MIDISC2.1. Changed
for the Modwerk base: the project events come from the base's hooks
(runtime.json, sdk/machines/octatrack/HOOKS.md) instead of octabam's STORE, and
its file and CRC helpers are in scenes.s; scenes.work is read slot by slot
(no second 256 KiB buffer); 0.3.1 keeps lock tables for at most 24 Parts (121 KB
instead of 272 KB of the module pool); the copy kept in battery RAM over a power cycle
holds only the current bank's locks, packed, at 0x100f9800 (battery-ram.json).
The manifest names each stock site by the SHA-256 of its bytes, never the
bytes. USB only: the package needs the base's hooks, so there is no card form.
"""

from remix.schema import Category, Claims, Detour, Kind, Linked, Module, Poke, Proof
from remix.stock_guard import stock_guard

H = bytes.fromhex

DETOURS = (
    Detour(0x400534CE, stock_guard(0x400534ce, 10, "0a34a9dae47506440d691aa67432e14ddd2067beefb8fd0a710b9d2602bd2ab6"), "scenes", "scn_hold_a",
           "scene A held + encoder, MIDI mode: the lock goes to MSC", pad_to=10),
    Detour(0x40052ECE, stock_guard(0x40052ece, 10, "c48200c62540f2bbf816fc02f6345c909f39c4a82c6e6db5871503b874f94aa6"), "scenes", "scn_hold_b",
           "scene B held + encoder, MIDI mode: the lock goes to MSC", pad_to=10),
    Detour(0x4004E348, stock_guard(0x4004e348, 6, "655d6cde4464d3fc4b96a5d4042196495b50b875d84102083b78853d87049b33"), "scenes", "scn_dial",
           "knob readout: the held scene's lock"),
    Detour(0x40053A9E, stock_guard(0x40053a9e, 10, "94cfbe1bad48e5e4815e66723dc09019463cada7a7d6dd797ee097b800be568d"), "scenes", "scn_enc_a",
           "scene held + encoder press, MIDI mode: the lock cleared", pad_to=10),
    Detour(0x40054392, stock_guard(0x40054392, 10, "99f93dbc184930d7c5fcef6f3b40b01f0d69c1e0992588d311f2f7686dd4c7ed"), "scenes", "scn_enc_b",
           "scene held + encoder press, MIDI mode (second function)", pad_to=10),
    Detour(0x400343E8, stock_guard(0x400343e8, 6, "a6b7abe55b36f6f401bdf3e42ae6914e7ed8bab6e6c8aeb2679c6bc3d5aa3617"), "scenes", "scn_taddi",
           "scene-block base per track: MSC in MIDI mode", kind="jsr"),
    Detour(0x4003448E, stock_guard(0x4003448e, 6, "6e095c0ed8bb13c8e2f1ed5964cc2aa9e525bc73af9a5e48dce20afec3af21f0"), "scenes", "scn_paddi",
           "scene-block base per page: MSC in MIDI mode", kind="jsr"),
    Detour(0x40034764, stock_guard(0x40034764, 6, "a6b7abe55b36f6f401bdf3e42ae6914e7ed8bab6e6c8aeb2679c6bc3d5aa3617"), "scenes", "scn_taddi",
           "lock LED paint, first scan: MSC in MIDI mode", kind="jsr"),
    Detour(0x40034950, stock_guard(0x40034950, 6, "a6b7abe55b36f6f401bdf3e42ae6914e7ed8bab6e6c8aeb2679c6bc3d5aa3617"), "scenes", "scn_taddi",
           "lock LED paint, second scan: MSC in MIDI mode", kind="jsr"),
    Detour(0x40031F44, stock_guard(0x40031f44, 8, "ca0e2748da716f189ef5678b1f45efd14403edf3e213734eda507773d491e9b4"), "scenes", "scn_pad",
           "scene pad lit when MSC holds a lock for the scene", pad_to=8),
    Detour(0x400434CA, stock_guard(0x400434ca, 6, "4fc2250cd387d3091460994656740d63a8f1278f4b4d68e746740952ccfc2f16"), "scenes", "scn_press",
           "scene key pressed, MIDI mode: the knob overlay redrawn"),
    Detour(0x40052A10, stock_guard(0x40052a10, 6, "8bba7275f6d14bc415fde1897a16d9e4a95dc8ae741ade0e062abe0a870f6c65"), "scenes", "scn_done",
           "scene recall completion (second path): mix at the XF"),
    Detour(0x40052AE0, stock_guard(0x40052ae0, 6, "8bba7275f6d14bc415fde1897a16d9e4a95dc8ae741ade0e062abe0a870f6c65"), "scenes", "scn_done",
           "scene recall completion (first path): mix at the XF"),
    Detour(0x4003F3A2, stock_guard(0x4003f3a2, 6, "5962065952cddcc9abd772416a3f5a49d83d6bb967439bcdc2e8ff04a048cab3"), "scenes", "scn_morph",
           "tail of the audio morph: mix when the XF moved"),
    Detour(0x40061E78, stock_guard(0x40061e78, 6, "da273da9ea374a8f9bc12ec7e2f622d1d5ce7e78d2d655e93655ae9977286e2d"), "scenes", "scn_xf1",
           "after the panel XF handler's CC 48 out: mix"),
    Detour(0x40062C32, stock_guard(0x40062c32, 6, "e98feec5aee0adf15225ef81ddf90c904a73d8f3b086fd3aa2eebf4719eb0c96"), "scenes", "scn_xf2",
           "after the second XF publish: mix"),
    Detour(0x400A3C2A, stock_guard(0x400a3c2a, 6, "4976e09ee4f9bc77ba41b130e2ab99e381ddbab18077cc24c924ac37af7ea86f"), "scenes", "scn_qrec",
           "sequencer tick: a queued pattern's Part waits for its first step"),
    Detour(0x400A169A, stock_guard(0x400a169a, 6, "fa6121e875f75fa4fc1ee60940bdaed6e72c082ea37c5ce19b6912b141ad2ddb"), "scenes", "scn_qcommit",
           "sequencer step routine: the waiting Part becomes the mix Part at its first step"),
    Detour(0x400A44F4, stock_guard(0x400a44f4, 12, "bd350cf7f7dbaa604e3d81a3d3bba68aa4b0342e311a0ed80cd0ee99ad79402d"), "scenes", "scn_switch",
           "pattern switch tick: the new pattern's Part becomes the mix Part", pad_to=12),
    Detour(0x400A4BA0, stock_guard(0x400a4ba0, 6, "a9a9fac5148fbf66c0c0ee987ced5b6c23cd59aad3aef94347ad18614be2f46d"), "scenes", "scn_step",
           "every playback step: a due mix runs"),
    Detour(0x4006221C, stock_guard(0x4006221c, 8, "d44faf1f3c1dd848c61c6796a8bdd5ac08bf7feb230cf30a15610b4aef4c5734"), "scenes", "scn_evt",
           "event that sets the current Part, after its Part writes: a due mix runs", pad_to=8),
    Detour(0x4005538A, stock_guard(0x4005538a, 8, "2d6e09987ff507dbdb14dd2b4e1036b3d9f36c5796205447cf16d47c1b10fb5f"), "scenes", "scn_pwrite",
           "panel MIDI parameter write: the mix runs, the record's value is sent", pad_to=8),
    Detour(0x400A19DA, stock_guard(0x400a19da, 8, "4c8c649aed2df3314d387c9b126651641b94c949356b59c70bd40ae380a461cb"), "scenes", "scn_snap1",
           "a trig plays on a MIDI track: its lane is kept as the track's snapshot", pad_to=8),
    Detour(0x400A1D32, stock_guard(0x400a1d32, 6, "6a3023efc147019e7106d59bd0ca8920f5c8d4b201029b70c4f08b37428b4f95"), "scenes", "scn_snap2",
           "after the track's 30-parameter loop: the track is re-mixed alone"),
    Detour(0x4009FAAA, stock_guard(0x4009faaa, 6, "41603bdef8548d4a8acefd677c03bd249f67b7776b7db92bb1b78e1078c79fc0"), "scenes", "scn_ccnote",
           "MIDI routine, before the note-on: the track's CC loop runs"),
    Detour(0x40062F24, stock_guard(0x40062f24, 6, "1b5449969cf7d2e5e4ad604545148cb6f6ae52abf834b0ca1cf51be4fbc00e48"), "scenes", "scn_clear",
           "CLEAR SCENE row: MSC[scene] wiped", kind="jsr"),
    Detour(0x40062FBE, stock_guard(0x40062fbe, 6, "95a65977926591c138e4e38d6934e763c743f4abc11d2744cbb6ee5fefb074ac"), "scenes", "scn_copy",
           "COPY SCENE row: MSC[scene] to the clipboard", kind="jsr"),
    Detour(0x40062E3C, stock_guard(0x40062e3c, 6, "17d3a295805f15920e3c1faae63ec3f70244430c108aa6b0e00a461c123db360"), "scenes", "scn_paste",
           "PASTE SCENE row: the clipboard to MSC[scene]", kind="jsr"),
)

POKES = (
    Poke(0x4009FE4E, stock_guard(0x4009fe4e, 6, "a76c64eec81cc3fe50212efa69f334db62a3df187cb4f1d818c7bc75cb3cc355"), H("4ef94009ffea"), "the stock CC loop after the note-on is jumped over (jmp 0x4009ffea)"),
    Poke(0x400343BC, stock_guard(0x400343bc, 6, "ef8b9ca3b718a0a3a2211fe3c4f46e8929feb159071ae75a8020b3428fefe195"), H("4ef9400343c4"), "per-track lock offset: always the audio path (jmp 0x400343c4)"),
    Poke(0x4003445E, stock_guard(0x4003445e, 6, "ef8b9ca3b718a0a3a2211fe3c4f46e8929feb159071ae75a8020b3428fefe195"), H("4ef940034466"), "per-page lock offset: always the audio path (jmp 0x40034466)"),
    Poke(0x40034754, stock_guard(0x40034754, 2, "7bdb08fa04994418cc3888650522434eddc440782c695752b17696658db61575"), H("4e71"), "lock LEDs scan MSC too, first scan (bne -> nop)"),
    Poke(0x4003493E, stock_guard(0x4003493e, 2, "a89aad5cb9834d06e8ebfa5695b54d1ac6bdba2c3deb109738472e69db48b911"), H("4e71"), "lock LEDs scan MSC too, second scan (bne -> nop)"),
)

MODULE = Module(
    name="midi-scenes",
    key="MIDI SCENES",
    kind=Kind.CF_PATCH,
    category=Category.PARTS, author="bkkbrls-del/midisc", author_url="https://github.com/bkkbrls-del/midisc",
    proof=Proof.UNTESTED,
    proof_note="USB package only; emulator and hardware results in TESTING.md.",
    doc="Scene locks for the MIDI tracks (hold-to-lock, readout, unlock, lock LEDs, XF morph, "
        "scene clear / copy / paste), kept per Part in scenes.work and battery RAM. After bkkbrls-del's midisc.",
    linked=(Linked("scenes", "modules/midi-scenes/scenes.s", dram=True),),
    detours=DETOURS,
    pokes=POKES,
    # Battery RAM: the current bank's unsaved locks, packed, so they survive a power cycle as stock's own
    # scene locks do (sdk/machines/octatrack/battery-ram.json).
    claims=Claims(sram=((0x100F9800, 0x2700, "MIDI SCENES: the current bank's locks, packed"),)),
)
