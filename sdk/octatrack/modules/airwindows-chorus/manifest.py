"""AIR CHORUS: Chris Johnson's Airwindows Chorus (MIT), FX2 only.
Full original range at 44.1 kHz; stereo rings reuse the slot's allocator.
Free-running modulation is the audio-rate LFO of the original chorus, not
a sequencer clock. Hardware operation remains untested.
"""
from remix.schema import (Category, Proof, BusRole, Claims, DspSection,
                          Formatter, Gate, Harness, Kind, MenuEntry, Module, Param, YBase)
from pathlib import Path
from runpy import run_path

BLANK = Param(b"", 0, 128, active=False, formatter=Formatter.PLAIN)
MODULE = Module(
    name="airwindows-chorus", key="AIR CHORUS", kind=Kind.DSP_EFFECT,
    category=Category.TRACK, author="repeat98", author_url="https://github.com/repeat98",
    proof=Proof.RENDER, proof_note="Native render, float-reference, control-click and memory checks passed; hardware pending.",
    doc="Chris Johnson / Airwindows Chorus: sine-modulated stereo delay, air compensation, three-point interpolation.",
    menu=MenuEntry(fx2_id=0x1e, donor_desc=0x400d58b8, abbr=b"AIRC",
                   fullname=b"Air Chorus", build_tag=False),
    params=(
        Param(b"SPD", 64, 128, active=True, formatter=Formatter.PLAIN,
              doc="Airwindows fourth-power speed: 0..7.019 Hz at 44.1 kHz; 64 is 0.439 Hz."),
        Param(b"RNG", 64, 128, active=True, formatter=Formatter.PLAIN,
              doc="Fourth-power delay centre: 0..92.513 ms; the sweep depth also follows MIX."),
        BLANK, BLANK, BLANK,
        Param(b"MIX", 0, 128, active=True, formatter=Formatter.PLAIN,
              doc="Dry/wet and modulation depth together, as in Airwindows; 0 is exact dry, 127 fully wet."),
        BLANK, BLANK, BLANK, BLANK, BLANK, BLANK,
    ),
    dsp=DspSection(asm="modules/airwindows-chorus/chorus.asm", priority=18,
                   bus_role=BusRole.NONE, ybase=YBase.NEVER,
                   split_ptable=True,
                   ptable=run_path(str(Path(__file__).with_name('packed_sine.py')))['packed_table']()),
    claims=Claims(stock_instance_buffer=True, buffer_words=16384),
    harness=Harness(layout_char="5", is_server=False, bus_client=False),
    gates=(Gate("modules/airwindows-chorus/verify.py", remix_arg=False),
           Gate("modules/airwindows-chorus/verify_controls.py", remix_arg=False),
           Gate("modules/airwindows-chorus/verify_instances.py", remix_arg=False),
           Gate("modules/airwindows-chorus/verify_shared_buffer.py", remix_arg=False),
           Gate("modules/airwindows-chorus/verify_bounds.py", remix_arg=False)),
    dear={"SPD":127,"RNG":127,"MIX":127},
)
