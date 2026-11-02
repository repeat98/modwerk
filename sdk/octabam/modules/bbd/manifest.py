"""BBD -- a clocked bucket-brigade delay, one tap, FX2.

The mono sum goes through the chain: a Pade tanh folded into a 2:1 feedback
compressor, an 8th-order Butterworth anti-alias filter at a third of the
clock, a bucket line clocked at 5.1..20.5 kHz (1,023 / 4,095 buckets
read through a charge-transfer polynomial plus noise, held between ticks), a
7th + 2nd order reconstruction filter at the same cutoff, a DC blocker and
the expander. FDBK returns the wet through a feedback tilt (TONE, FREQ),
governed by LIM; FRZ fades the input and sustains the loop, 127 loops the line; HPF is a
20..400 Hz high-pass on the input (0 off).
Free-running TIME: the DSP side has no tempo word.

Reads the allocator at init (x:>$213) and uses the first 4,095 words of an
FX2 slot's 16,384-word Y buffer for the ring and base + $2000.. for the
filter coefficients; an FX1 slot (3,072 words) is too small, so FX2 only.
State lives in r7 + $00..$5a. bbd_ref.py is the float model the DSP is
proven against (verify.py).

Hidden slot 11 is 127; 0 there cuts BBD to dry and clears its line. It is the input
for the stop kill (STOP, STOP, STOP): stock's frame-record builder zeroes the reverbs'
slot 11 while a track is held (0x40004d0c), and stopkill.s does the same for BBD's id,
as a detour on card builds and as the base's ev_tail_kill subscriber over USB
(runtime.json)."""

from remix.schema import (Gate, Category, Proof, BusRole, Claims, Detour, DspSection, Formatter, Harness,
                          Kind, Linked, MenuEntry, Module, Param, YBase)
from remix.stock_guard import stock_guard

FX2_ID = 0x0e

MODULE = Module(
    name="bbd", key="BBD", kind=Kind.HYBRID,
    category=Category.TRACK, author="JamCones", author_url="https://github.com/JamCones",
    proof=Proof.RENDER, proof_note="`modules/bbd/verify.py` against bbd_ref.py, 51 gates; earlier builds played on an MKII (BBD01-BBD14)",
    doc="Clocked BBD delay: compander, clock/3 filters, bucket noise, freeze, governor; FX2.",
    menu=MenuEntry(fx2_id=FX2_ID, donor_desc=0x400d58b8,
                   abbr=b"BBD", fullname=b"BBD DELAY", build_tag=False),
    params=(
        Param(b"TIME", 64, active=True, formatter=Formatter.PLAIN,
              doc="clock 20.5..5.1 kHz: 50..200 / 200..800 ms by STGS"),
        Param(b"FDBK", 0, active=True, formatter=Formatter.PLAIN,
              doc="wet back through TONE; centred rings long, a full TONE oscillates from ~45"),
        Param(b"FRZ", 0, active=True, formatter=Formatter.PLAIN,
              doc="freeze: input fades out, FDBK goes to sustain; 127 loops the line exactly"),
        Param(b"TONE", 64, 128, active=True, formatter=Formatter.BIPOLAR,
              doc="feedback tilt: + treble up / bass down, - bandpass peak at FREQ, 9 dB"),
        Param(b"FREQ", 64, active=True, formatter=Formatter.PLAIN,
              doc="TONE's bandpass peak, 400..2000 Hz log, Q 1.5"),
        Param(b"MIX", 40, active=True, formatter=Formatter.PLAIN,
              doc="0-64 adds the wet up to unity over the whole dry; 64-127 fades the dry out"),
        Param(b"STGS", 0, count=2, active=True, formatter=Formatter.STEPPED,
              labels=("1024", "4096"),
              doc="bucket count: the delay range; a change fades out and clears"),
        Param(b"", 0),
        Param(b"LIM", 127, active=True, formatter=Formatter.PLAIN,
              doc="feedback governor, 0 off: self-oscillation settles near 2^(-3.5v/127) of the envelope"),
        Param(b"", 0),
        Param(b"HPF", 0, active=True, formatter=Formatter.PLAIN,
              doc="0 off, else a 12 dB/oct HPF on the signal entering the line, 20..400 Hz log"),
        Param(b"", 127),                     # hidden: the stop kill's input, 0 cuts to dry (stopkill.s)
    ),
    dsp=DspSection(asm="modules/bbd/bbd.asm", priority=16,
                   bus_role=BusRole.NONE, ybase=YBase.NEVER,
                   r7_latch_slot=None, gate_label=None),
    claims=Claims(stock_instance_buffer=True, buffer_words=0x203A),   # 8,250: up to the FREQ bandpass at +$2039 (as octabam since #783)
    linked=(Linked("bbd", "modules/bbd/stopkill.s", cpu="5475", dram=True),),
    detours=(
        Detour(0x40004d0c, stock_guard(0x40004d0c, 10, "3b007d2a1b16afbbff30a9df6d28c030691b4f5b3c32626a87be0a7b712408eb"), "bbd",
               "bbd_kill_hook", "STOP, STOP, STOP: zero BBD's slot 11, as stock does its reverbs'", pad_to=10),
    ),
    harness=Harness(layout_char=None, is_server=False),
    gates=(Gate("modules/bbd/verify.py", remix_arg=False),),
    dear={"TIME": 0, "FDBK": 127, "TONE": 0, "FREQ": 127, "MIX": 64, "STGS": 1, "HPF": 64},
)
