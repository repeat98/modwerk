"""USB AUDIO OUT TRACKS MAIN CUE -- the unit as a UAC2 audio input, 20 channels at 44.1 kHz 24-bit.

High speed: the eight tracks' L/R (post-FX, pre-fader) on channels 1-16,
MAIN on 17-18, CUE on 19-20. Full speed: the tracks' stereo sum.
markandrus (octemu, MIT); MAIN/CUE Bryan T. A DRAM unit with build-time
detours. Needs USB MIDI: the audio function joins its composite, and the
ISR shim chains to USB MIDI's through octabam's receive shim (usbmidi_rx.s,
which timestamps each MIDI clock byte for the tempo). README.md has the
design and what was measured. USB AUDIO OUT TRACKS (modules/usb-audio-out-tracks, the sixteen track
channels) and USB AUDIO OUT MASTER (modules/usb-audio-out-master, track 8's two)
assemble the same source with another USB_LAYOUT.
"""

from remix.stock_guard import stock_guard
from remix.schema import Category, Gate, Proof, Detour, Kind, Linked, Module, Override, Poke

H = bytes.fromhex


SOURCE = "modules/usb-audio-out-tracks-main-cue/usbaudio.s"


def layout_inc(layout):
    """The `remix.inc` usbaudio.s includes: USB_LAYOUT 0 (these twenty
    channels), 1 (USB AUDIO OUT TRACKS), 2 (USB AUDIO OUT MASTER), 3 (USB AUDIO OUT MAIN
    CUE) or 4 (USB AUDIO OUT MAIN);
    USB_IN 1 when a USB AUDIO IN module is in the remix (usbaudio.s then answers
    GET_INTERFACE(5) from that unit's in_alt)."""
    def inc(modules):
        usb_in = int(any(k in modules for k in ("USB AUDIO IN AB", "USB AUDIO IN CD", "USB AUDIO IN ABCD")))
        return (f"| remix.inc -- usbaudio.s's layout\n    .set USB_LAYOUT, {layout}\n"
                f"    .set USB_IN, {usb_in}\n")
    return inc


DETOURS = (
    Detour(0x4001dd04, stock_guard(0x4001dd04, 6, "3bb0c07995b814d9b68c9fe7705b47b484a246631bc6d15296b6b51f9ce8d7e0"), "usbaudio", "audio_setiface_shim",
           "SET_INTERFACE: interface 4 alt 1 brings the stream up, alt 0 down; others stock"),
    Detour(0x4001d824, stock_guard(0x4001d824, 6, "b7af10bdbb07e409a3549af2716077cbf1f52e8c4c26b68b57f338d447c55ab2"), "usbaudio", "audio_getiface_shim",
           "GET_INTERFACE: interface 4 reports the alt setting the host asked for"),
    Detour(0x4001de64, stock_guard(0x4001de64, 6, "868378f30d4ed1251a28851782180b919dbfbd18ea839b594142244f6e06fb8a"), "usbaudio", "audio_ctrl_shim",
           "class requests to the clock source (sample rate CUR/RANGE, validity); the rest STALL as stock"),
    Detour(0x4001d4b2, stock_guard(0x4001d4b2, 6, "ab0cbd2f401f4120ff21c07bb467c402a69a55bec648a66e48c7f15f4dc08926"), "usbaudio", "audio_ep0page_shim",
           "usb_ep0_send fills the dTD's buffer page 1 too: a configuration straddling a 4 KB page transmitted truncated"),
    Detour(0x4000d9a0, stock_guard(0x4000d9a0, 6, "37a52c3300cbe2e0b5453bac91ed193defe49493058e8a287b2f9a1c47a325b9"), "usbaudio", "audio_frame_shim",
           "frame_isr's last instruction: the per-block producer (20 channels: tracks, MAIN, CUE; + the sum into the rings) and the packet builder"),
    Detour(0x4001e606, stock_guard(0x4001e606, 6, "2fc3d5168f6ee3ffb4b419a9cbbe48a7837d42e9e47db7bb5bced5cd13b62dc0"), "usbaudio", "audio_isr_shim",
           "usb_isr UI path: retire EP3 IN completions, then USB MIDI's receive shim and USB MIDI's shim"),
    Detour(0x4001e91c, stock_guard(0x4001e91c, 6, "78eb060ff0d9ffb4236ffdf4b3b210c34887760745a3767f657917d9ec1d58f2"), "usbaudio", "audio_reset_shim",
           "USB bus reset: request alternate setting 0 before the frame ISR tears EP3 down"),
    Detour(0x4001e952, stock_guard(0x4001e952, 6, "95d6c1eb26340f4df0419ac71e537a21277443225e26589bf5094352b48e3b29"), "usbaudio", "audio_sessend_shim",
           "USB session end: request alternate setting 0 before stock stops the controller"),
)

MODULE = Module(
    name="usb-audio-out-tracks-main-cue", key="USB AUDIO OUT TRACKS MAIN CUE", kind=Kind.CF_PATCH,
    category=Category.MIDI_USB, author="markandrus/octemu", author_url="https://github.com/markandrus/octemu",
    proof=Proof.HARDWARE, proof_note="Sam's MKII (image 64, 25 Sep 2026); Tim's MKI (OCTATRICK9, 26 Sep 2026)",
    doc="Twenty 24-bit channels over USB (UAC2): the tracks post-FX pre-fader, MAIN, CUE; the stereo sum at full speed (markandrus/octemu).",
    linked=(Linked("usbaudio", SOURCE, cpu="5475", dram=True, include=layout_inc(0)),
            # octabam's USB MIDI receive path (4caa1965, unchanged), reached
            # from audio_isr_shim: room in the MIDI FIFO and the 0xF8
            # timestamp the clock handler builds the tempo from. Its
            # SET_CONFIGURATION shim is not installed (that hook stays USB
            # MIDI's), so the high-speed RX dTD keeps the firmware's 64 bytes.
            Linked("usbmidi_rx", "modules/usb-audio-out-tracks-main-cue/usbmidi_rx.s", cpu="54455", dram=True)),
    detours=DETOURS,
    # The ISR site is USB MIDI's; this shim does its EP3 work and jumps to
    # usbmidi_rx's shim by symbol, which hands on to USB MIDI's (the units
    # link together).
    overrides=(Override(0x4001e606, "USB MIDI"),),
    pokes=(Poke(0x400e2004, stock_guard(0x400e2004, 3, "709e80c88487a2411e1ee4dfb9f22a861492d20c4765150c0c794abd70f8147c"), H("ef0201"),
                "device descriptor: class/subclass/protocol = interface-association composite"),),
    # MAIN/CUE aligned with the tracks (skips without a source project)
    gates=(Gate("tools/verify/verify_usb_align.py", remix_arg=False, venv=True, stage="image"),),
)
