"""SCALE QUANTIZER -- PROJECT > CONTROL > SEQUENCER gains SCALE (OFF, then 24
scales), ROOT (C .. B), GLIDE (OFF, 1..127), TRACK (AUDIO 1..8, MIDI 1..8) and
FOLLOW (ON / OFF for the track TRACK shows). With a scale on, the PTCH knob,
parameter locks and CHROMATIC trig keys of an audio track snap to the scale
built on the root; so do a MIDI track's NOTE knob, NOTE locks, CHROMATIC keys
and what it plays (chords, TRAN, the arpeggiator); and what an audio track
plays follows the scale too, so recorded notes follow a scale change. A track
whose FOLLOW is OFF stays stock. The settings live in battery RAM and in the
project's '#' lines (TRACK itself is not a setting: it only picks the track
FOLLOW shows, starts at AUDIO 1 and is not saved).

Source: `upstream/` is Tim Hastie's timhastie/octatrick-modules at
990eff8bf88463af4d396793f1c60eb1dab34ea0 (2.21 + the TRACK / FOLLOW rows, not
yet published), byte for byte: `upstream/quantizer/` is his `quantizer/`
folder, and `upstream/LICENSE` / `upstream/README.md` are his repository's.
Nothing inside `upstream/` is edited here. His manifest declares the units,
detours, pokes and the SEQUENCER TableGrow; this file re-exports its MODULE.

Guards. His manifest names no stock bytes: it reads every hook site's guard,
`stock_guard(site, length)`, from the build's own MAIN OS section
(`upstream/quantizer/stock_guard.py`). This wrapper stands in for that reader
while his manifest loads: every detour and poke guard is declared below in
Modwerk's form, `stock_guard(address, length, sha256)`, the
SHA-256 of the original 1.40C bytes at that site (as the module's 0.1.3 and the
other catalogue modules write them), and is matched to his declaration by site
alone. A clean checkout needs no firmware to inspect or package the module;
reading a span still needs the developer's own verified 1.40C extraction.
No stock bytes are written in this file.
"""

import dataclasses
import importlib.machinery
import importlib.util
import pathlib
import runpy

from remix.schema import Category, Proof
from remix.stock_guard import stock_guard

_UPSTREAM = pathlib.Path(__file__).resolve().parent / "upstream" / "quantizer" / "manifest.py"

# Every guard of the module: 28 detours and the SEQUENCER row-count poke (OS 1.40C).
GUARDS = (
    stock_guard(0x4004fc84, 16, "567a08a47bfcfcbfa686446f812f7d8047929e38330c65d76598eb47e2c4c511"),  # qz_panel_stage (2.21)
    stock_guard(0x40005162,  8, "71fcb998fdf55a8ba0425d107c73e4e5b843fc1b8d75baba2a081207d1306e73"),  # qz_panel_commit (2.21)
    stock_guard(0x40055170,  6, "dc6543d672cdf223fc2ec7cc3c04b8a584dbd6e7bb1e3590b91cd3e469e0b324"),  # qz_knob
    stock_guard(0x40050e60, 10, "ccf689e403ebd88a651c829b4ae191d609c85baa2a99409bd0a2870d20aaa73e"),  # qz_plock
    stock_guard(0x40055382,  8, "03bcaf390b2fd396821abc005afa9853b59e2fcaf10ddc223c001b3a9d276e08"),  # qz_mknob
    stock_guard(0x40050b98, 10, "9cb4af08e685b7a46a08340cfec555868a0568533c1fb6fc2ec37159dfd980d9"),  # qz_mplock
    stock_guard(0x400436a8, 10, "2ab0a5529e7748a00dea86e66bc4fbb6105ec7f36e73e481bb840f6570da98cc"),  # qz_mkey
    stock_guard(0x4009fb80,  6, "f444ba9960a8167cb9947f3acfc4a0fd2520327d61c57726ec33c7704307d59c"),  # qz_mnote
    stock_guard(0x4000c614,  6, "e6abfb8463d2d93e458a247a07c80f477d3f2f616b85cf98f6cd828a433ae057"),  # qz_atrig
    stock_guard(0x400439d6,  8, "53d90093082490eb3a630e3e0afba99946d22a720a84bae7194f11e091224777"),  # qz_mprev
    stock_guard(0x4004fc58, 10, "ddfca03eed59b4f4fffffc9061b138ce3e2a33c30712b5e377d94d054fa7b0f0"),  # qz_chrom
    stock_guard(0x4004fbde,  6, "7daba4e508057c5320565e7ccc62d4e55d0fa501b0c2586445df51ff9503b3de"),  # qz_leg0
    stock_guard(0x4004fbfe,  8, "f974dcd132df96148fe8c38e662bf638aba29290a8ca4467402e8ac707eba123"),  # qz_leg1
    stock_guard(0x4004fc94,  8, "617ecbc4d5386f7ed57bfdc6e37dd7a1e1cc60850934d5c635ead626999e847e"),  # qz_leg2
    stock_guard(0x4004fce0,  8, "e31f7bb195174d49c320879317409c3d2187cc42f337ac0845f41acaebf509bf"),  # qz_leg3
    stock_guard(0x4004fd06,  6, "c8e4de3e3a3d28c808f812c9316fd22097f36ec2afb558ef6b81b2a8d66cebe7"),  # qz_leg4
    stock_guard(0x4004fd20,  6, "902ec18f60fbd1fe19c6a380f31a74290976edd45422b224a3905d550636c94f"),  # qz_leg5
    stock_guard(0x40050254,  8, "cee8c24bcad796ec96a96aad2d0073265ca9900179292d7c1c942604aeafd8c3"),  # qz_keyidx
    stock_guard(0x40045918,  8, "112b7d2434bae65950506429fa2e8d01b20316d7ab6d1848ba91f10c451e11ac"),  # qz_octkey
    stock_guard(0x40044968,  8, "d6d1c7b3caf3215f6590e479a282b5c09d27c1d52c221d596ba9c7fa293896e9"),  # qz_octdraw
    stock_guard(0x400449be,  8, "494435e3f72313a14453f642bdba5b064022c657c63c015752fe23092eabd19f"),  # qz_octnum
    stock_guard(0x40044abc,  8, "d789a426f2ed177607e8d6f5ecbf4618283211fa07df645bb7a2848ef7187ef0"),  # qz_heldmark
    stock_guard(0x40065bca,  6, "484a241b3cea4a13c5b18550e3ab44eaffc021673bd5677a424bb05cc6486a37"),  # qz_draw
    stock_guard(0x400866cc,  8, "de4845a149f0373201be2e55cd61ae41f52a03afd7c4cb717b70d9c6bd64c5ad"),  # qz_ld_entry
    stock_guard(0x400867a2,  8, "51d1dc3c3bf8d2441df47bad2355b22c942d333b44557d35171c891cb573f3fb"),  # qz_ld_line
    stock_guard(0x400888aa,  8, "ef2b6bc9ba56b8cd1d05117b22c2fafc71e1aa07952c0999da4d4eb54e0489e6"),  # qz_wr
    stock_guard(0x40010212,  6, "8728078b48ce7f9e9ac9b2d41c454e293ecc0dc4af302ea1885264064442c9e4"),  # qz_boot
    stock_guard(0x40025ac2,  6, "46484a409ff4c92ca7811222b2a050a935c53122a69184d8a18db71d69820ca9"),  # qz_defaults
    stock_guard(0x40065c7c,  4, "a3e547e08c1f288e512f2e52ac9becc3502ccd0dcfcf55e5ab9863859f34e2bc"),  # SEQUENCER row-count poke
)
_BY_SITE = {guard.address: guard for guard in GUARDS}


def _declared(site, length):
    """His stock_guard(site, length), answered with the guard declared above."""
    guard = _BY_SITE.get(site)
    if guard is None or guard.length != length:
        raise ValueError("Scale Quantizer guard not declared: %#x+%d" % (site, length))
    return guard


class _GuardLoader(importlib.machinery.SourceFileLoader):
    """Stands in for upstream/quantizer/stock_guard.py while his manifest runs, so the
    manifest loads without firmware and no OS file is opened at import."""

    def exec_module(self, module):
        module.stock_guard = _declared


def _upstream_module():
    real = importlib.util.spec_from_file_location

    def spec(name, location, *args, **kwargs):
        if name == "qz_stock_guard" and pathlib.Path(location).resolve() == _UPSTREAM.parent / "stock_guard.py":
            return importlib.util.spec_from_loader(name, _GuardLoader(name, str(location)))
        return real(name, location, *args, **kwargs)

    importlib.util.spec_from_file_location = spec
    try:
        return runpy.run_path(str(_UPSTREAM), run_name="remix_manifest_quantizer")["MODULE"]
    finally:
        importlib.util.spec_from_file_location = real


def _guarded(module):
    """Each detour and poke gets the guard declared for its site; the sites must be exactly
    those above, and each guard covers what the hook overwrites."""
    sites = [d.site for d in module.detours] + [p.addr for p in module.pokes]
    if sorted(sites) != sorted(_BY_SITE):
        raise ValueError("Scale Quantizer hook sites differ from the declared guards")
    for d in module.detours:
        if _BY_SITE[d.site].length != (d.pad_to or 6):
            raise ValueError("Scale Quantizer guard length differs at %#x" % d.site)
    for p in module.pokes:
        if _BY_SITE[p.addr].length != len(p.write):
            raise ValueError("Scale Quantizer poke guard length differs at %#x" % p.addr)
    return dataclasses.replace(
        module,
        detours=tuple(dataclasses.replace(d, expect=_BY_SITE[d.site]) for d in module.detours),
        pokes=tuple(dataclasses.replace(p, expect=_BY_SITE[p.addr]) for p in module.pokes))


def _without_fm(module):
    """quantizer.s's remix.inc as a selection without FM Synth gives it. The author enables his panel
    publication transaction (2.21) only beside the SYNTH MACHINE module, whose engine state it writes;
    FM Synth bundles its own copy of this quantizer and declares a conflict with this module, so this
    module never runs beside it and its adapters always assemble to their replays (no reference to
    FM's state, wherever the unit is assembled)."""
    def without(include):
        return lambda modules: include({key: value for key, value in modules.items() if key != "SYNTH MACHINE"})
    return dataclasses.replace(module, linked=tuple(
        dataclasses.replace(unit, include=without(unit.include)) if unit.include else unit for unit in module.linked))


MODULE = _without_fm(_guarded(_upstream_module()))
MODULE = dataclasses.replace(
    MODULE,
    # The module table's fields are octabam's (README.md, `make docs`), so they
    # are added here rather than in his manifest.
    category=Category.MACHINES, author="timhastie/octatrick-modules", author_url="https://github.com/timhastie/octatrick-modules",
    proof=Proof.PORT, proof_note="Tim's 2.21 line + TRACK / FOLLOW: emulator gates (ot_emu); this Modwerk build is untested on hardware")
