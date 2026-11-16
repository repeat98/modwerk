"""Tuner: retain the author's source, with local credits and stock guards.

The upstream directory is an unchanged copy of Tim Hastie's Tuner: v2.21 plus
his DC-removal commit (evidence/source-revendor-2026-10-30.json).
Its manifest derives its linked source path from its own file location, so
the native card build resolves that same source. The local wrapper replaces
only detour expectations with Modwerk guards; USB loading is unsupported.

Guards. The author's manifest names no stock bytes: it reads each hook site's
displaced span, `stock_guard(site, length)`, from the build's own MAIN OS
section through his `upstream/stock_guard.py`. This wrapper stands in for that
reader while his manifest loads: the three spans are declared below in
Modwerk's form, `stock_guard(address, length, sha256)`, the SHA-256 of the
original 1.40C bytes at each site (evidence/guard-provenance.json), and each
read is answered with the declaration for that site and length. So a checkout
without firmware loads, inspects and packages the module and declares the same
digests; reading a span still needs the developer's own verified 1.40C
extraction and fails closed on any other bytes. No file under `upstream/` is
changed and no OS file is opened at import.
Qualification is recorded in TESTING.md.
"""
import dataclasses
import importlib.machinery
import importlib.util
import pathlib
import runpy

from remix.schema import Proof
from remix.stock_guard import stock_guard

_UPSTREAM = pathlib.Path(__file__).resolve().parent / "upstream" / "manifest.py"
# Derived from verified local OS 1.40C; provenance is in evidence/guard-provenance.json.
_GUARDS = {
    0x40059ef0: stock_guard(0x40059ef0, 6, "f6a3ca67f755cf77cada82cbb69793ccf442a7994c8ec87a9dff56f83ca048c5"),
    0x4000d99a: stock_guard(0x4000d99a, 6, "9a7d100114ea50c9317af4f9de9210dd0eeae82f9ce03b255ac0d7bb5f707b91"),
    0x40056c72: stock_guard(0x40056c72, 6, "9c0a1089c078d792bc2cdac2cf3b905c17ad1f4466addf54f4b84f2fa2f9cdd0"),
}


def _declared(site, length):
    """His stock_guard(site, length), answered with the guard declared above."""
    guard = _GUARDS.get(site)
    if guard is None or guard.length != length:
        raise ValueError("Tuner guard not declared: %#x+%d" % (site, length))
    return guard


class _GuardLoader(importlib.machinery.SourceFileLoader):
    """Stands in for upstream/stock_guard.py while his manifest runs, so the manifest
    loads without firmware and no OS file is opened at import."""

    def exec_module(self, module):
        module.stock_guard = _declared


def _upstream_module():
    real = importlib.util.spec_from_file_location

    def spec(name, location, *args, **kwargs):
        if name == "tu_stock_guard" and pathlib.Path(location).resolve() == _UPSTREAM.parent / "stock_guard.py":
            return importlib.util.spec_from_loader(name, _GuardLoader(name, str(location)))
        return real(name, location, *args, **kwargs)

    importlib.util.spec_from_file_location = spec
    try:
        return runpy.run_path(str(_UPSTREAM), run_name="tuner_upstream_manifest")["MODULE"]
    finally:
        importlib.util.spec_from_file_location = real


_MODULE = _upstream_module()
if {detour.site for detour in _MODULE.detours} != _GUARDS.keys():
    raise ValueError("Tuner upstream detour inventory differs from its guard declarations")

MODULE = dataclasses.replace(
    _MODULE,
    detours=tuple(
        dataclasses.replace(detour, expect=_GUARDS[detour.site])
        for detour in _MODULE.detours
    ),
    author="timhastie",
    author_url="https://github.com/timhastie/octatrick-modules",
    proof=Proof.UNTESTED,
    proof_note="Modwerk 0.1.0 card integration is unqualified; hardware and timing checks pending; USB loading unsupported.",
)
