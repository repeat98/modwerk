"""USB AUDIO OUT TRACKS POST -- USB AUDIO with the sixteen track channels after
each track's own MAIN gain.

High speed: the eight tracks' L/R on channels 1-16, each block multiplied by
the gain core 0 gives that track in the MAIN mix -- track LEVEL, mute, solo
and XLV (the crossfader's scene level), with core 0's 16-sample ramp -- and
MAIN_LEVEL left out. Full speed: the stereo sum of those stems. USB AUDIO
OUT TRACKS MAIN CUE's source (markandrus/octemu, MIT) assembled with
USB_LAYOUT = 5; the POST layout is allmyfriendsaresynths's (@clickysteve).
The XLV curve is the first quarter of payload A's sine at X:0x6c00, extracted
from the user's own stock image when the remix is built (no stock bytes in
the repo). It takes the same hook sites as the other USB AUDIO OUT modules,
so a remix carries one of them. README.md.
"""
import dataclasses
import importlib.util
import math
import pathlib

from remix import schema, stock
from remix.schema import Category, Gate, Proof, Linked, Module

_ROOT = pathlib.Path(schema.__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location(
    "usbaudio_manifest", _ROOT / "modules/usb-audio-out-tracks-main-cue/manifest.py")
usbaudio = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(usbaudio)

_PRODUCER = 0x4000d9a0
_LAYOUT = 5
XLV_ADDR, XLV_WORDS = 0x6c00, 256           # X:0x6c00.., indexed by XLV >> 7 (0..254 in use)


def xlv_table(image=None):
    """Payload A's X:0x6c00..0x6cff as 24-bit words, from the user's stock
    image. Refuses unless they are the first quarter of a sine (the curve
    core 0 applies to the MAIN gain): the image or the parse is wrong
    otherwise, and the stems would be silently mis-scaled."""
    import sys
    sys.path.insert(0, str(_ROOT / "tools/build"))
    import dsp_modmap
    img = image if image is not None else stock.STOCK_IMAGE.read_bytes()
    tag, va, ln = dsp_modmap.PAYLOADS[0]
    assert tag == "A"
    mods, blob = dsp_modmap.modules(img, va, ln)
    for sp, addr, cnt, data in mods:
        if sp == 1 and addr <= XLV_ADDR and XLV_ADDR + XLV_WORDS <= addr + cnt:
            off = data + (XLV_ADDR - addr) * 3
            words = [dsp_modmap.w24(blob, off + 3 * i) for i in range(XLV_WORDS)]
            break
    else:
        raise ValueError("USB AUDIO OUT TRACKS POST: payload A has no X record over X:0x6c00..0x6cff")
    for i, w in enumerate(words):
        want = round(math.sin(2 * math.pi * i / 1024) * 0x7fffff)
        if abs(w - want) > 64 or (i and w <= words[i - 1]):
            raise ValueError(f"USB AUDIO OUT TRACKS POST: X:0x{XLV_ADDR + i:04x} = 0x{w:06x} is not the "
                             f"sine core 0's XLV curve reads (expected about 0x{want:06x})")
    return words


def post_inc(modules):
    """usbaudio.s's remix.inc for layout 5, plus the XLV table as a macro the
    data section expands (post_xlv)."""
    words = xlv_table()
    lines = ["| the XLV curve: payload A X:0x6c00..0x6cff from the user's stock image (manifest.py)",
             ".macro POST_XLV_TABLE"]
    for i in range(0, XLV_WORDS, 8):
        lines.append("    .long " + ", ".join(f"0x{w:06x}" for w in words[i:i + 8]))
    lines.append(".endm")
    return usbaudio.layout_inc(_LAYOUT)(modules) + "\n".join(lines) + "\n"


MODULE = Module(
    name="usb-audio-out-tracks-post", key="USB AUDIO OUT TRACKS POST", kind=usbaudio.MODULE.kind,
    category=Category.MIDI_USB, author="markandrus/octemu", author_url="https://github.com/markandrus/octemu",
    proof=Proof.HARDWARE, proof_note="allmyfriendsaresynths's MKII, P3 (usb-out-tracks-post), 5 Oct 2026: 16 channels, each track on its pair, LEVEL/mute/solo/crossfader follow; the gain engine nulled against MAIN in a 20-channel diagnostic build; 7 Oct 2026: streaming costs +2.8 µs a frame over OUT TRACKS (CF METER); MASTER TRACK and the no-host cost not on a unit",
    doc="Sixteen 24-bit channels over USB (UAC2): each track after its own MAIN gain (LEVEL, mute, solo, XLV; MAIN_LEVEL left out); the stems' stereo sum at full speed. USB AUDIO OUT TRACKS MAIN CUE's source (markandrus/octemu), the POST layout allmyfriendsaresynths's (@clickysteve).",
    linked=(Linked("usbaudio", usbaudio.SOURCE, cpu="5475", dram=True, include=post_inc),),
    detours=tuple(
        dataclasses.replace(d, **({"note": "frame_isr's last instruction: the per-track MAIN gains (every block) and the per-block producer (16 channels: the tracks after their gains; + the sum into the rings) and the packet builder"}
                                  if d.site == _PRODUCER else {}))
        for d in usbaudio.DETOURS),
    overrides=usbaudio.MODULE.overrides,
    pokes=usbaudio.MODULE.pokes,
    # the stems against core 0's own MAIN, sample by sample, under the port (skips without a source project)
    gates=(Gate("tools/verify/verify_usb_post.py", remix_arg=False, venv=True, stage="image"),),
)

