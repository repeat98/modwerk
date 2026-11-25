"""KITS -- 255 Kits per project; a Kit is a saved Part.

The stock Part engine runs as it is: four working Part slots per bank, the
pattern's Part byte names one. KITS keeps a library of 255 Parts and, per
pattern, the Kit it plays; before a pattern is scheduled its Kit is copied
into a slot of its bank that nothing is playing and the pattern's Part byte
names that slot. LOAD KIT and SAVE KIT run the stock Part Reload and Part
Save; FUNC+CUE reloads the pattern's Kit. kits.work / kits.strd hold the
library beside the bank files.

Port of Sam Banks' module in octabam (modules/kits at f7d72906, MIT; the
owner's decision, 13 and 16 November 2026), after Em's Octakit design (MIT,
Copyright (c) 2026 June Kiff), with bkkbrls-del's slot-case fixes. Changed
for the Modwerk base: the project events come from the base's hooks
(runtime.json, sdk/machines/octatrack/HOOKS.md) instead of octabam's STORE,
and its file and CRC helpers are in kits.s; the library (1,622,944 bytes)
and the edit pool (405,632 bytes) live in 331 pages of sample memory the
base lends (ot_sample_memory), and Kits stays inactive while it lends none;
the module reads the loaded project when it is installed (ev_modules_ready);
a Kit carries no MIDI scene locks (kits.work version 1 only); the
battery-RAM copy is at 0x100f85a0 and 0x100fbf00 (battery-ram.json), tagged
with the project. Octabam's detours on the boot's blank path (the module
installs after the boot) and on FUNC+YES (Temp Save's site) are not here;
the LEVEL scroll in the lists takes the core's encoder event (module_enc)
where octabam's STORE patched the encoder dispatch call.
The manifest names each stock site by the SHA-256 of its bytes, never the
bytes. USB only: the package needs the base's hooks, so there is no card form.
"""

from remix.schema import Category, Claims, Detour, Kind, Linked, Module, Proof
from remix.stock_guard import stock_guard

DETOURS = (
    Detour(0x400A0570, stock_guard(0x400a0570, 8, "7357d174dda33b71e4d29ed8e6d02a3b96a76167a0a44ebe35f2a439406880f4"), "kits", "kits_sched",
           "the pattern schedule (every request): the pattern's Kit into a free slot", pad_to=8),
    Detour(0x4009C634, stock_guard(0x4009c634, 6, "20577862965e35b56da3cc4660ac5df6a325e455467496552d181b68fff15e2d"), "kits", "kits_chain",
           "the chain append: each chained pattern's Kit staged"),
    Detour(0x4002E7B8, stock_guard(0x4002e7b8, 6, "8adfee488b57380b5f698f0700f6346c3f459548c12c942a5843f2e750ab1a77"), "kits", "kits_partkey",
           "PART (MKII), FUNC+MIDI (MKI): LOAD KIT"),
    Detour(0x4002DC9C, stock_guard(0x4002dc9c, 6, "d0ec7e0980705bdda9e9859f3b6caa119d97dab71385585f3a78e9e893f81d5d"), "kits", "kits_savekey",
           "the Part edit menu's opener (MKII FUNC+PART): FUNC+PASTE+PART's clone, else stock (the base's Part Edit menu)"),
    Detour(0x40058A64, stock_guard(0x40058a64, 8, "2be469e0167bae6ee4ac4288dff1ce5ed285f46e1d21b5aa77321c0aecdb208c"), "kits", "kits_mkisave",
           "the MKI FUNC+BANK dispatch: SAVE KIT from LOAD KIT, else stock", pad_to=8),
    Detour(0x4004C146, stock_guard(0x4004c146, 6, "721b1a82cfa67d26611e24e28c05a498a15c2e72fbce2bc3a06cbad6e01cc6a7"), "kits", "kits_status",
           "the status line's Part field: NNN name of the pattern's Kit, NNN --- without one"),
    Detour(0x4005E038, stock_guard(0x4005e038, 10, "c3fb4ed43661714f0c251c3e565b8c4580d761d65cf108c80692f11ea32c9763"), "kits", "kits_freload",
           "FUNC+CUE: the current pattern's Kit from the library (KIT RELOADED), stock without one", pad_to=10),
    Detour(0x40060F34, stock_guard(0x40060f34, 8, "2be469e0167bae6ee4ac4288dff1ce5ed285f46e1d21b5aa77321c0aecdb208c"), "kits", "kits_lcopy",
           "FUNC+REC: with a KITS list open, copy the Kit under the cursor", pad_to=8),
    Detour(0x40060DB0, stock_guard(0x40060db0, 8, "2be469e0167bae6ee4ac4288dff1ce5ed285f46e1d21b5aa77321c0aecdb208c"), "kits", "kits_lpaste",
           "FUNC+STOP: with a KITS list open, paste onto it (again: undo)", pad_to=8),
    Detour(0x40060EB4, stock_guard(0x40060eb4, 8, "2be469e0167bae6ee4ac4288dff1ce5ed285f46e1d21b5aa77321c0aecdb208c"), "kits", "kits_lclear",
           "FUNC+PLAY: with a KITS list open, clear it (again: undo)", pad_to=8),
    Detour(0x40026EB0, stock_guard(0x40026eb0, 10, "1026d523a4f46be54546a3e5b42d970c6847f7899b5a007cccd51216361d6d11"), "kits", "kits_pcopy",
           "the pattern copy: the pattern's Kit goes with it", pad_to=10),
    Detour(0x40026EF0, stock_guard(0x40026ef0, 8, "4c6de0100c3e5eb1e6fc9b7e0d99266f375aef1318b8e3757199f2924e182e85"), "kits", "kits_psnap",
           "the paste's undo snapshot: the target's Kit kept", pad_to=8),
    Detour(0x4002B9B0, stock_guard(0x4002b9b0, 8, "efa23c0a55aebcd8ffb29c8ba97d3970d8e88ed9c16272d7b5ea0b4e8309ecf5"), "kits", "kits_pstore_ptn",
           "a pattern written from the clipboard or the undo buffer: its Kit", pad_to=8),
    Detour(0x40056B2C, stock_guard(0x40056b2c, 8, "c0625c05ebaea4e811a9b30d8781875a60b3a7619a301a44cb01b2d6c12bee95"), "kits", "kits_ptrig",
           "a pattern trig with PTN held: with FUNC held too, the target of PTN+FUNC+TRIG", pad_to=8),
    Detour(0x400503C4, stock_guard(0x400503c4, 8, "91fea154aed7ca7f7aed1e03380f8eba791542d2f01b3f4a9b173e2dec9df118"), "kits", "kits_fright",
           "FUNC+RIGHT with PTN held: the pattern and its Kit copied to the next empty ones", pad_to=8),
)

MODULE = Module(
    name="kits",
    key="KITS",
    kind=Kind.CF_PATCH,
    category=Category.PARTS, author="sambanks", author_url="https://github.com/sambanks",
    proof=Proof.UNTESTED,
    proof_note="USB package only; no emulator or hardware result for this port yet (TESTING.md).",
    doc="255 Kits per project: PART = LOAD KIT, FUNC+PART = SAVE, RELOAD, RENAME KIT (MKI: FUNC+MIDI, "
        "then FUNC+BANK); each pattern plays its Kit through the stock Part slots. After Em's Octakit.",
    linked=(Linked("kits", "modules/kits/kits.s", dram=True),),
    detours=DETOURS,
    # Battery RAM (sdk/machines/octatrack/battery-ram.json): RESID with a magic and a sum that starts
    # from the project's id, and ASSIGN, so the slots' Kits and the patterns' Kits survive a power cycle.
    claims=Claims(sram=((0x100F85A0, 0x48, "KITS: which Kit each Part slot holds"),
                        (0x100FBF00, 0x100, "KITS: each pattern's Kit"))),
)
