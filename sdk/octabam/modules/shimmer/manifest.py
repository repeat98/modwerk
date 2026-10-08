"""Shimmer: a stereo FX2 reverb with continuously shifted feedback.

Original Shimmer implementation by juliussylvest-lab. The allocator-owned
insert and FDN design retain credit to Mini Verb / octabam contributors.
No hardware or sonic qualification is implied by this declaration.
"""
from remix.schema import (BusRole, Category, Claims, DspSection, Formatter, Gate,
                          Harness, Kind, MenuEntry, Module, Param, Proof, YBase)

# Original mathematical table: signed phase increment in Q8 units.
# Table coordinates represent -12 .. +12 semitones in 0.75-semitone steps.
PITCH_INCREMENT = tuple(
    round((1 - 2 ** ((index - 16) / 16)) * 4096 * 256) & 0xFFFFFF
    for index in range(33)
)

MODULE = Module(
    name="shimmer", key="SHIMMER", kind=Kind.DSP_EFFECT,
    category=Category.TRACK,
    author="juliussylvest-lab", author_url="https://github.com/juliussylvest-lab",
    proof=Proof.UNTESTED,
    proof_note="Development build: native and physical-unit qualification pending.",
    doc="Stereo diffuse reverb with smoothed -12..+12 semitone feedback pitch shift.",
    menu=MenuEntry(fx2_id=0x1e, donor_desc=0x400d58b8,
                   abbr=b"SHMR", fullname=b"Shimmer", build_tag=False),
    params=(
        Param(b"TIME", 96, count=128, active=True, formatter=Formatter.PLAIN,
              doc="Tail length through bounded, smoothed feedback; 0 short, 127 long."),
        Param(b"SIZE", 96, count=128, active=True, formatter=Formatter.PLAIN,
              doc="Smoothed fractional delay spread; 0 compact, 127 spacious."),
        Param(b"PTCH", 127, count=128, active=True, formatter=Formatter.PLAIN,
              doc="Feedback pitch: 0 = -12 semitones, 64 = unity, 127 = +12 semitones."),
        Param(b"SHMR", 48, count=128, active=True, formatter=Formatter.PLAIN,
              doc="Shifted share of normalized feedback; 0 ordinary reverb, 127 maximum shimmer."),
        Param(b"TONE", 64, count=128, active=True, formatter=Formatter.PLAIN,
              doc="Feedback and wet-path brightness; 0 dark, 127 bright, with antialias filtering."),
        Param(b"MIX", 0, count=128, active=True, formatter=Formatter.PLAIN,
              doc="Smoothed dry/wet mix; 0 exact dry, 127 wet only."),
        *(Param(b"", 0, count=128, active=False, formatter=Formatter.PLAIN)
          for _ in range(6)),
    ),
    dsp=DspSection(asm="modules/shimmer/engine.asm", priority=18,
                   bus_role=BusRole.NONE, ybase=YBase.NEVER,
                   r7_latch_slot=None, gate_label=None, ptable=PITCH_INCREMENT),
    claims=Claims(stock_instance_buffer=True, buffer_words=16384),
    harness=Harness(layout_char="8", is_server=False),
    gates=(Gate("modules/shimmer/verify.py", remix_arg=False),),
    dear={"TIME": 127, "SIZE": 127, "PTCH": 127,
          "SHMR": 127, "TONE": 127, "MIX": 127},
)
