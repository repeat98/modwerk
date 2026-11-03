"""ARP KEY LOCKS -- a KEY (root and mode) locked per step on a MIDI track's arpeggiator and sequencer notes.

Hold a trig in MIDI ARP SETUP and turn KEY: the step keeps a key in its spare lock byte 30, which stock neither
edits, applies nor validates. A lock holds until the next locked step and wraps at the track's length; a pattern
without one plays stock's KEY. Seven modes in all twelve roots: MAJOR, DORIAN, PHRYGIAN, LYDIAN, MIXOLYDIAN, MINOR,
LOCRIAN. The track's own KEY stays stock's (OFF, MAJOR, MINOR): a value stock's Part validator rejects can lose the
bank at power-up, so the added modes live in the locks only.

Three stock sites, the ones the base shares as events over USB (runtime.json):
- 0x4009fb58, the MIDI note sender (ev_midi_note_key): a held lock moves the note into its key.
- 0x4007a2ec, MIDI ARP SETUP's encoder handler (ev_arp_setup_knob): KEY with a trig held stores the locks.
- 0x4007a1ec, MIDI ARP SETUP's drawer (ev_arp_setup_text): KEY with a trig held shows the step's lock.

The C core (akl.c, compiled to akl.s) is tested on the host (test_akl.c, verify.py). Emulator and hardware
results are in TESTING.md.
"""

from remix.schema import Category, Proof, Gate, Detour, Kind, Linked, Module
from remix.stock_guard import stock_guard

MODULE = Module(
    name="arp-key-locks",
    key="ARP KEY LOCKS",
    kind=Kind.CF_PATCH,
    doc="Lock the arpeggiator's KEY per step on MIDI tracks: seven modes, held until the next lock.",
    category=Category.MIDI_USB, author="jopolokk1", author_url="https://github.com/jopolokk1",
    proof=Proof.UNTESTED, proof_note="Host tests of the C core; emulator and hardware results in TESTING.md.",
    linked=(
        Linked("akl", "modules/arp-key-locks/akl.s", dram=True),
        Linked("akl_unit", "modules/arp-key-locks/unit.s", dram=True),
    ),
    detours=(
        Detour(0x4009FB58, stock_guard(0x4009FB58, 6, "b9fd3e826833844716d1d4904ee373c65d291047e78b9f34f8d9e3c95dac30fd"),
               "akl_unit", "akl_note_entry", "the MIDI note sender: a held lock's key on each note"),
        Detour(0x4007A2EC, stock_guard(0x4007A2EC, 8, "9d8b5c6fa44fca2b22f8cb24de82782737e5615dff673baad1c7423135d0d27f"),
               "akl_unit", "akl_knob_entry", "MIDI ARP SETUP's encoders: KEY with a trig held locks the steps",
               pad_to=8),
        Detour(0x4007A1EC, stock_guard(0x4007A1EC, 6, "5a5d9a451cef368d61badb2d5212624df56beca30e3fcaa6483f0c42a35a92ee"),
               "akl_unit", "akl_text_entry", "MIDI ARP SETUP's KEY with a trig held: the step's lock instead of the track's KEY"),
    ),
    gates=(Gate("modules/arp-key-locks/verify.py", remix_arg=False),),
)
