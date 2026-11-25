"""Private POLY profile: ColdFire machine, original resident stock DSP effects."""
from remix.schema import Remix
REMIX=Remix(
    name="poly8",
    doc="Private eight-voice POLY test with original resident stock DSP effects.",
    modules=("POLY8","FILTER","EQUALIZER","DJ EQ","PHASER",
             "FLANGER","CHORUS","SPATIALIZER","COMB FILTER","COMPRESSOR",
             "LO-FI","DELAY","PLATE REV","SPRING REV","DARK REV"),
    fallback="NONE",
    static_stock=True,
)
