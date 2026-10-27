"""FRACT 0.10.0: bounded local scatter and allocator-owned stereo SPACE.

Three fixed ColdFire heads read existing Flex PCM pages; stock source scratch
stays native. The five units are DRAM units: the card build carries them in
octabam's platform runtime (1,707 bottom arena pages), a runtime package in
the base's pool. The FX2 page uses stock dials; the package adds the overview
through module_tick/module_draw (runtime.json). SPACE uses the existing
per-track FX2 buffer.
"""
from remix.schema import (
    BusRole, Category, Claims, DspSection, Formatter, Harness, Kind,
    Detour, Linked, MenuEntry, Module, Param, Proof, YBase,
)
from remix.stock_guard import stock_guard
import os

# Test-only: scripts/verify_ui_probe.py builds with GRNYV1_UI_PROBE=1 to call
# og_ui/og_draw from the stock tick and LCD flush (tests/ui_probe.s) on octemu.
UI_PROBE = os.environ.get("GRNYV1_UI_PROBE") == "1"

VERSION = "0.10.0"
SIZES = tuple(round(441 * 200 ** (k / 63)) for k in range(64))
# DENS (SETUP D) -> the engine's density, reading upwards (the user,
# 2026-10-21): 127 at 127, halving every 32 steps down, 8 at 0 (births about
# 16 times further apart). The one place DENS's direction is set:
# scripts/native.py writes this table into sizes.h as og_densities, and
# source.c reads it at the stored value.
DENSITIES = tuple(int(127 * 2 ** (-(127 - v) / 32) + 0.5) for v in range(128))
BLANK = Param(b"", 0, 128, active=False, formatter=Formatter.PLAIN)

MODULE = Module(
    name="grnyv1", key="FRACT", kind=Kind.HYBRID,
    category=Category.TRACK, author="ex1010", author_url="https://github.com/ex1010",
    proof=Proof.CHECK, proof_note="Local FRACT staging prototype; see TESTING.md for actual evidence.",
    doc="Three bounded stereo grains with position variation, panorama and a diffused stereo SPACE tail.",
    # FX2 id 0x07 (since 2026-10-22). A manifest may name 0x04-0x1f; the
    # ids there that are not stock's (schema.STOCK_FX2_IDS, 0x19 MULTIBCOMP
    # among them) are exactly the base's 13 module ids (customIds), and
    # 0x07 is the one no other module claims. 0x09, FRACT's until then, went
    # to LOFI2 (Modwerk #749). The ColdFire code names the id through
    # OG_FX_ID (fxid.h) and sourcehook.s's literal (tests/verify_detour.py).
    menu=MenuEntry(fx2_id=0x07, donor_desc=0x400d58b8,
                   abbr=b"FRCT", fullname=b"FRACT", build_tag=False),
    params=(
        Param(b"POS", 18, 128, active=True, formatter=Formatter.PLAIN,
              doc="Start position across the loaded Flex sample. Latched at each grain birth."),
        Param(b"SIZE", 86, 128, active=True, formatter=Formatter.PLAIN,
              doc="Grain duration, 10 ms..2 s. Edits preserve current Hann phases and source clocks; envelope rates and launch spacing follow the new duration."),
        # Slot 2 held SCAN until the user's decision of 2026-10-21 put REV
        # on the main page and SCAN on SETUP B. The same day the user renamed
        # it REVS and made it read as a direction: 127, the default choosing
        # FRACT writes, plays every grain forwards (today's sound), 0
        # reverses every grain, and a value between reverses a grain with
        # probability (127 - REVS)/127. source.c's read is the one place
        # that direction is set. A project saved before holds SCAN's value
        # here (64 if it was never turned) or REV's 0, and loads it as REVS
        # (64: about half the grains reversed; 0: all); accepted by the user
        # ("old projects do not matter").
        Param(b"REVS", 127, 128, active=True, formatter=Formatter.PLAIN,
              doc="Grain direction, latched at each grain's birth: 127 plays every grain forwards, 0 plays every grain backwards from its span's last frame, and between a grain reverses with probability (127 - REVS)/127, about half at 64. Each reader draws from its own sequence, so REVS leaves SPRD and PAN positions alone."),
        Param(b"SPRD", 0, 128, active=True, formatter=Formatter.PLAIN,
              doc="Position variation at grain birth: quadratic circular width around POS plus SCAN; zero preserves exact position. At 127, SRNG selects the whole source or a local two-second interval."),
        Param(b"SPCE", 0, 128, active=True, formatter=Formatter.PLAIN,
              doc="Ambient stereo reverb: diffusion and decay in one macro. Maximum dissolves direct grain attacks; zero becomes exact dry after the control glide."),
        # Slot 5 held PTCH until 0.10.0; pitch comes from the track's own
        # Flex PTCH (the user, 2026-10-18). SHPE took the slot (the user,
        # 2026-10-20): the 64 that 0.9.6 projects store there, PTCH's unity,
        # is Hann, so they keep their sound.
        Param(b"SHPE", 64, 128, active=True, formatter=Formatter.PLAIN,
              doc="Grain window shape, latched at each grain birth. 64 is Hann; lower widens it to a flat top with shorter tapers (level kept within 1 dB); higher sharpens it to a fast attack and a steep decay (up to 4.3 dB quieter). Short SIZEs cap the steepest shapes so no grain clicks."),
        Param(b"PAN", 0, 128, active=True, formatter=Formatter.PLAIN,
              doc="Random equal-power stereo balance latched per grain. Zero preserves original stereo; 127 uses the full field. Peak-bounded channel gains."),
        # SETUP B (slot 7) is SCAN since the user's decision of 2026-10-21;
        # it held REV (now REVS, main slot 2) before, and was blank (default
        # 0) in 0.9.x. A project saved before holds 0 here (or a REV value)
        # and loads it as SCAN 0, scanning backwards at four times speed,
        # until SCAN is set to 64.
        Param(b"SCAN", 64, 128, active=True, formatter=Formatter.PLAIN,
              doc="Bipolar scan: 64 holds the current offset, 96 is +1x, 32 is -1x."),
        Param(b"SRNG", 0, 2, active=True, formatter=Formatter.STEPPED,
              labels=("FULL", "LOCAL"),
              doc="SPRD range: FULL preserves whole-source scaling; LOCAL caps total width at 2 seconds. Default is FULL; only stored value 1 selects LOCAL."),
        # DENS reads upwards by the user's decision of 2026-10-21: 127, the
        # default choosing FRACT writes, is today's three-way overlap, 0 the
        # sparsest. SETUP D was blank (default 0) in every earlier FRACT, so
        # projects saved before hold 0 there and load the sparsest density
        # until DENS is set to 127 (accepted by the user).
        Param(b"DENS", 127, 128, active=True, formatter=Formatter.PLAIN,
              doc="Grain density: 127 keeps three grains overlapping a third of a grain apart; each 32 steps down double the spacing, to about 16 times at 0. Sparser grains are fewer and quieter on average, each at its own level, and cost less CPU."),
        BLANK, BLANK,
    ),
    dsp=DspSection(asm="modules/grnyv1/engine.asm", priority=19,
                   bus_role=BusRole.NONE, ybase=YBase.NEVER,
                   r7_latch_slot=None, gate_label=None),
    linked=(
        # One platform-runtime image (card) or package (USB); no stock cave.
        Linked("ogpitch", "modules/grnyv1/pitch.s", dram=True),
        Linked("ogcontrol", "modules/grnyv1/control.s", dram=True),
        Linked("oggrain", "modules/grnyv1/grain.s", dram=True),
        Linked("ogsource", "modules/grnyv1/source.s", dram=True),
        Linked("ogview", "modules/grnyv1/view.s", dram=True),
    ),
    detours=(
        # Just after the stock fetch call (0x400041c4, which POLY8 patches):
        # the six bytes there, which og_fetch replays (sourcehook.s).
        Detour(0x400041cc, stock_guard(0x400041cc, 6,
               "9d17443ba64725f420e698899284ac29015a9a8dc1162a79c3d4c0f392027b59"),
               "ogsource", "og_fetch", "Read three grains from existing Flex sample pages"),
    ) + ((
        Detour(0x40052228, stock_guard(0x40052228, 6,
               "f766b966a6e5fcd78a3e0cf2ad70875eea80460af836798ab5106dc0d0af380d"),
               "ogview", "og_probe_tick", "UI probe: og_ui from the stock UI tick"),
        Detour(0x40013cae, stock_guard(0x40013cae, 6,
               "7bab736d872b498c877bc8fff13026ea365d5ed1f2b355ffb839d5465dd96457"),
               "ogview", "og_probe_flush", "UI probe: og_draw on the composed frame"),
    ) if UI_PROBE else ()),
    # SPACE's ring and clear stay in +0..+$3DA2 of the FX2 slot (modulus
    # $3da2, engine.asm), the most any stock effect writes: clear of
    # Sidechain Compressor's key window at +$3DFE..+$3FFF on T3/T7.
    claims=Claims(stock_instance_buffer=True, buffer_words=15779),
    harness=Harness(layout_char="G", is_server=False, bus_client=False),
    dear={"POS": 18, "SIZE": 86, "SCAN": 64, "SPRD": 0, "PAN": 0, "SPCE": 0, "SHPE": 64, "REVS": 127, "DENS": 127},
)
