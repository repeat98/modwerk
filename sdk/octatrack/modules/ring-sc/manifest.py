"""RINGMOD SC -- an insert whose gain follows another track's waveform.

    DUCK   out = in * (1 - DPTH * follow(peak(|key|)))     ring mod sidechain
    RING   out = in * (1 - DPTH) + in * DPTH * m(key)        ring modulator, another track as carrier

In RING the three DUCK-only knobs shape the carrier m(key), each a plain copy
at 0, so RING with all three at 0 is the plain ring modulator:
    S&H   (HOLD) a new key every 16v samples, held between: stepped modulation
    SLEW  (ATK)  above 0 the key's level, |key| smoothed (0.7 ms at 1 to 1.3 s at
                 127), drives the gain instead: a tremolo that follows the key;
                 crossfaded in and out over 16 samples, so crossing 0 does not click
    RECT  (REL)  m + r * (|m| - m), r = v/128: toward the rectified key, its
                 frequency doubled and never negative at 127, ramped like the depth

Put it on the track to be ducked (a bass) and set KEY to the track that
carries the kick. The key is the kick track's audio, low-passed by KLPF and
boosted four times. In DUCK the gain follows the key's peak over the last one
to two HOLD windows (13-26 ms by default), so it holds through the kick's zero
crossings and steps down as the kick decays; ATK softens the fall and REL
smooths the recovery.

The key comes from the Modwerk base's key bus (KEYBUS, sdk/machines/octatrack/
dsp-sites.json): over USB the package requires it (loader ABI 9), and while it
is installed the base's tap copies every track's audio, as it enters FX1, to a
bus on each core and to a window both cores see, so any of T1-T8 can key any
track. The tap is Sidechain Compressor's (Zac-Kyoti), made a base feature; this
module only reads the bus and writes nothing outside its own state, so it runs
beside Sidechain Compressor. Until the bus is live on its core (the tap's seed
mark) the depth stays at 0 and the audio passes bit for bit: a card image has
no key bus, so there it does nothing.
KEY is a plain labelled select, on page 1 so it can be reached, locked and
modulated like any main knob. MODE is alone on page 2 and three page-1 names
follow it (a NameSelect: MODE keeps its own name, as a stock select does). The earlier build's ColdFire KEY-step routine
(keystep.s) is gone: it named its card descriptor, which a USB package cannot,
so on the first visit after choosing the effect KEY may move a track a detent
(seen on card images under the emulator; not checked on the USB base).

A buffer-free insert on its own id 0x06 (not a stock id, free on main), on
FX1 or FX2 of any track. One source serves both DSP cores: it reads the track
being dispatched (X:$420) to tell which half of the tracks is local and where
the other core publishes, so it takes no per-payload values.

Measured so far (TESTING.md): the render gate and stress render on this source;
DUCK, and RING with S&H, RECT and SLEW at 0, equal 0.1.0 sample for sample.
0.1.0's key bus reader passed its first MKII steps (21 Oct 2026), and 0.2.0's
build before RECT its by-ear checks; this source has not run on a unit.
"""

from remix.schema import (Category, Proof, BusRole, DspSection, Formatter, Gate,
                          Harness, Kind, MenuEntry, ModeView, Module, NameSelect, Param, YBase)

# KEY's labels. The track names carry a space each side: drawn centred, " T1 " lands where "T1" would, and the
# formatter's string table then differs from stock's own "OFF/T1-T7" list, which a USB package must not repeat
# (module_packages.py's stock-free scans refused the plain names, 20 Oct 2026).
_TRACKS = ("OFF",) + tuple(" T%d " % n for n in range(1, 9))

MODULE = Module(
    name="ring-sc",
    key="RING_SC",
    kind=Kind.DSP_EFFECT,
    doc="Ring mod sidechain: duck or ring-modulate a track with another track's waveform.",
    category=Category.TRACK, author="npp1993", author_url="https://github.com/npp1993",
    proof=Proof.RENDER,
    proof_note="verify.py and tools/stress.py under dsp_host (TESTING.md). This source has not run on a unit; 0.2.0's build before RECT passed by-ear MKII checks.",

    menu=MenuEntry(
        fx2_id=0x06,                  # free on main (0x0e is BBD Delay's)
        donor_desc=0x400d58b8,        # DARK REV: every drawn slot is written below
        abbr=b"RMSC",
        fullname=b"RINGMOD SC",
        build_tag=False,
    ),

    params=(
        # ---- page 1 ----------------------------------------------------------
        Param(b"KEY", 0, 9, active=True, formatter=Formatter.WIDE_STEPPED,
              labels=_TRACKS,
              doc="the track whose audio drives the gain; OFF = untouched"),
        Param(b"DPTH", 127, 128, active=True, formatter=Formatter.PLAIN,
              doc="how far the key moves the gain; 0 = untouched, 127 = full"),
        Param(b"KLPF", 127, 128, active=True, formatter=Formatter.PLAIN,
              doc="low-pass on the key: 14 Hz at 0, an octave every 14 steps (100 Hz near 40), open at 127"),
        # ---- page 1, bottom row -------------------------------------------
        Param(b"ATK", 0, 128, active=True, formatter=Formatter.PLAIN,
              doc="DUCK: how slowly the gain falls; 0 = at once, then 0.7 ms at 1 to 1.3 s at 127. RING (SLEW): 0 = the key itself; above 0 the key's level, smoothed over the same times, drives the gain (tremolo)"),
        Param(b"HOLD", 34, 128, active=True, formatter=Formatter.PLAIN,
              doc="DUCK: how long the duck holds after a peak, one to two windows of 32 + 16v samples: 13 ms at 34, 0.7 ms at 0, 47 ms at 127. RING (S&H): a new key every 16v samples (0 = every sample, 0.36 ms at 1, 46 ms at 127)"),
        Param(b"REL", 45, 128, active=True, formatter=Formatter.PLAIN,
              doc="DUCK: how slowly the gain recovers, on ATK's scale: 45 = about 9 ms after the key's peak drops. RING (RECT): blends the key toward its rectified |key|; 0 = the key, 127 = fully rectified (frequency doubled, never negative)"),
        # ---- page 2 ----------------------------------------------------------
        Param(b"MODE", 0, 2, active=True, formatter=Formatter.STEPPED,
              labels=("DUCK", "RING"),
              doc="DUCK: the key's level pulls the gain down. RING: the key multiplies the audio"),
        Param(), Param(), Param(), Param(), Param(),
    ),

    # RING renames ATK, HOLD and REL. MODE is a NameSelect, not the mode_slot:
    # it renames its neighbours but keeps its own name, so it reads like a
    # stock select (MODE over DUCK / RING); the mode_slot's select names itself.
    # The knobs keep their values on a MODE change, as other modules' do.
    name_selects=(NameSelect(6, (ModeView(mode=1, names={3: b"SLEW", 4: b"S&H", 5: b"RECT"}),)),),

    dsp=DspSection(
        asm="modules/ring-sc/ringsc.asm",
        priority=31,                  # after Sidechain Compressor (30): it keeps its place, this takes what is left
        bus_role=BusRole.NONE,
        ybase=YBase.NEVER,
        r7_latch_slot=None,
        gate_label=None,
        # No hooks and no claims: the key bus is the base's (USB, ABI 9 `requires keybus`; its read claims are
        # declared on the package, not here). A card image has no bus, and the module passes audio there.
    ),

    harness=Harness(layout_char="8", is_server=False),

    gates=(Gate("modules/ring-sc/verify.py", remix_arg=False),),
    # DUCK's loop is the dearer, and REL and ATK at 127 run the per-block shift
    # loop its full 16 turns.
    dear={"KEY": 1, "DPTH": 127, "ATK": 127, "REL": 127, "KLPF": 0, "HOLD": 0, "MODE": 0},
)
