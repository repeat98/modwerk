"""PREVIEW VOL -- sample previews (FUNC+YES and CUE+YES) ignore the active
track's AMP VOL and play at its default (64).

Both stock preview starters queue AMP overrides for the previewing track
but leave VOL, so a track at VOL 0 previews silent and one at 127 about
12 dB hot (measured under the port, 16 Sep 2026). One detour in each adds
VOL. docs/firmware/PREVIEW.md has the ground.
"""

from remix.schema import Detour, Kind, Linked, Module

from remix.stock_guard import stock_guard

MODULE = Module(
    name="previewvol",
    key="PREVIEW VOL",
    kind=Kind.CF_PATCH,
    doc="Sample previews (FUNC+YES, CUE+YES) play at the default AMP VOL, "
        "not the active track's.",
    linked=(Linked("previewvol", "modules/previewvol/previewvol.s"),),
    detours=(
        Detour(0x40094296, stock_guard(0x40094296, 6, "32a2ab9a39220b58512d746ec9f16c2999a366598f69ad7fb627de42302e051f"), "previewvol", "vol_static",
               "STATIC preview: queue AMP VOL 64 beside REL"),
        Detour(0x40096EB2, stock_guard(0x40096eb2, 6, "9145514de4d11863ed2260549f385eb8c4b9016d0bf64f68dfbfe29de3c1bf21"), "previewvol", "vol_flex",
               "FLEX preview: queue AMP VOL 64 beside REL"),
    ),
)
