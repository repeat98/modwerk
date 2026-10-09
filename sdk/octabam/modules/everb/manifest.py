"""E-Verb -- a modulated four-line FDN reverb for FX2, after Tom Erbe's ICMC 2015 design.

An original implementation from the paper "Building the Erbe-Verb" (CC BY 3.0),
with the hardware's control set. Main page: SIZE, DCY, ABSB / DPTH, SPD, MIX,
all lockable. SETUP: TILT, PRE, REV / EDCY, ESIZ. EDCY and ESIZ route the
reverb's own envelope into DCY and SIZE: the self-patch a modular player makes
with an envelope follower, inside the effect. The tank runs at 22.05 kHz; the
dry frames pass untouched.
"""

from remix.schema import (BusRole, Category, Claims, DspSection, Formatter, Gate,
                          Harness, Kind, MenuEntry, Module, Param, Proof, YBase)

P, S, B = Formatter.PLAIN, Formatter.STEPPED, Formatter.BIPOLAR

MODULE = Module(
    name="everb",
    key="EVERB",
    kind=Kind.DSP_EFFECT,
    doc="Modulated FDN reverb after the Erbe-Verb: size, decay, absorb, cyclic/ergodic/shimmer, reverse, tilt.",
    category=Category.TRACK, author="user1303836", author_url="https://github.com/user1303836",
    proof=Proof.RENDER, proof_note="its own render gates (modules/everb/verify.py); not on hardware",
    menu=MenuEntry(fx2_id=0x1b, donor_desc=0x400d58b8,   # DARK REV's descriptor, every field written
                   abbr=b"EVRB", fullname=b"E-Verb", build_tag=False),
    params=(
        Param(b"SIZE", 64, 128, True, P, doc="space: every delay over six octaves, 2 ms to 143 ms; glides as it moves"),
        Param(b"DCY", 64, 128, True, P, doc="decay gain 0..120%: sustains from about 106, saturates above"),
        Param(b"ABSB", 60, 128, True, P, doc="0..38 adds diffusion, 38..127 adds damping: darker and shorter"),
        Param(b"DPTH", 64, 128, True, B, doc="left: cyclic chorus; right: ergodic grains, shimmer from +48"),
        Param(b"SPD", 64, 128, True, P, doc="modulation speed 0.5..256 Hz: cyclic rate, ergodic grain rate"),
        Param(b"MIX", 51, 128, True, P, doc="equal-power dry/wet; 0 is exactly the dry signal"),
        Param(b"TILT", 64, 128, True, B, doc="wet tone: left warms (lows +12 dB), right brightens (highs +24 dB)"),
        Param(b"PRE", 25, 128, True, P, doc="pre-delay 7..250 ms; with REV on, the reverse window (at least 42 ms)"),
        Param(b"REV", 0, 2, True, S, labels=("OFF", "ON"), doc="reverse the pre-delay buffer; switches under a short duck"),
        Param(b"EDCY", 64, 128, True, B, doc="envelope into DCY: left reins the tail in, right swells it, no sustain"),
        Param(b"ESIZ", 64, 128, True, B, doc="reverb envelope into SIZE: the space shrinks or grows with level"),
        Param(),
    ),
    dsp=DspSection(asm="modules/everb/everb.asm", priority=18,
                   bus_role=BusRole.NONE, ybase=YBase.NEVER,
                   r7_latch_slot=None, gate_label=None),
    claims=Claims(stock_instance_buffer=True, buffer_words=16384),
    harness=Harness(layout_char="E", is_server=False),
    gates=(Gate("modules/everb/verify.py", remix_arg=False),),
    # The dearest settings for the pricer, the pressure render and fx:audit, measured
    # (benchmark_reverbs, one instance per core): SIZE 0 (the shortest grain period),
    # DPTH 127 (every grain gliding, both heads), REV on (two reverse heads), wet up.
    # SPD and ABSB do not change the cost.
    dear={"SIZE": 0, "DCY": 100, "ABSB": 90, "DPTH": 127, "TILT": 64, "MIX": 127,
          "SPD": 127, "PRE": 127, "REV": 1, "EDCY": 64, "ESIZ": 64},
)
