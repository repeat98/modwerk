from remix.stock_guard import stock_guard
"""REPITCH -- tempo-following variable-speed playback as TSTR raw value 4."""

from remix.schema import Gate, Category, Proof, Detour, Kind, Linked, Module, Poke, SymbolRef

H = bytes.fromhex
KNOB, SELECT4, SELECT5 = 0x400479B4, 0x40046C28, 0x40046AB4

MODULE = Module(
    name="repitch",
    key="REPITCH",
    kind=Kind.CF_PATCH,
    category=Category.MACHINES, author="repeat98", author_url="https://github.com/repeat98",
    proof=Proof.HARDWARE, proof_note="an MKII, 16 Sep 2026 (OCTABAM81); `verify_repitch`",
    doc="Adds TSTR REPITCH (STATIC/FLEX and the sample's own TIMESTRETCH): "
        "project-tempo following by playback speed, without grains; PTCH off.",
    linked=(Linked("repitch", "modules/repitch/repitch.s"),),
    detours=(
        Detour(0x4000406A, stock_guard(0x4000406a, 8, "421c09bf6657197a8b4ebc95e327dcd230d4509c7a1a6703a918101c2a44d5ac"), "repitch", "rate_gate",
               "resolve REPITCH for the track the increment is built for", pad_to=8),
        Detour(0x4000409E, stock_guard(0x4000409e, 8, "9982b6d4cc8edcabba720802078541d3c677c7e1383544e53b88db927d816814"), "repitch", "pitch_gate",
               "REPITCH: PTCH not applied", pad_to=8),
        Detour(0x40004100, stock_guard(0x40004100, 8, "cfb51026afa59069c37a05dce3ec521567135c112d210e4a0f29129e3e353df7"), "repitch", "rate_hook",
               "scale the shared CPU/DSP playback increment", pad_to=8),
        Detour(0x40007D96, stock_guard(0x40007d96, 6, "ff2ae4a919e2e8850a9180cf2d7e53ce07e728ad9dac7e6c3f8eee3027951fbf"), "repitch", "tstr_resolve",
               "the voice renderer resolves REPITCH to OFF: dry, forwards and back"),
        Detour(0x4006E71C, stock_guard(0x4006e71c, 10, "45cf9363cc868dea350fb606f94041c365d08ba8a23a49ee707aabf1f7382f88"), "repitch", "attr_label",
               "audio editor ATTR: TIMESTRETCH prints REPITCH", pad_to=10),
        Detour(0x4006EE56, stock_guard(0x4006ee56, 8, "3579f297a903662f1577e307da394a680c0a847098bde766b10d0c4e77bc5b23"), "repitch", "attr_up",
               "audio editor ATTR: TIMESTRETCH up, BEAT -> REPITCH", pad_to=8),
        Detour(0x4006EF7C, stock_guard(0x4006ef7c, 8, "4695532f6a5b8ec36fcbff91f5b4bf24ac84e1def253b8b678c20c2e754b7b5f"), "repitch", "attr_down",
               "audio editor ATTR: TIMESTRETCH down, REPITCH -> BEAT", pad_to=8),
    ),
    symbol_refs=(
        SymbolRef(0x400D310E, 0x4003B6A4, "repitch", "tstr_fmt",
                  "STATIC TSTR formatter"),
        SymbolRef(0x400D32A0, 0x4003B6A4, "repitch", "tstr_fmt",
                  "FLEX TSTR formatter"),
        SymbolRef(0x400D3116, KNOB, "repitch", "ptch_widget",
                  "STATIC PTCH knob"),
        SymbolRef(0x400D32A8, KNOB, "repitch", "ptch_widget",
                  "FLEX PTCH knob"),
    ),
    pokes=(
        Poke(0x400D30DE, stock_guard(0x400d30de, 4, "1bc5d0e3df0ea12c4d0078668d14924f95106bbe173e196de50fe13a900b0937"), H("00000005"),
             "STATIC TSTR count 4 -> 5"),
        Poke(0x400D3270, stock_guard(0x400d3270, 4, "1bc5d0e3df0ea12c4d0078668d14924f95106bbe173e196de50fe13a900b0937"), H("00000005"),
             "FLEX TSTR count 4 -> 5"),
        # The select widget draws nothing past its own position count
        # (`cmp #3` at 0x40046c7c): stock's unused five-position twin.
        Poke(0x400D313E, SELECT4.to_bytes(4, "big"), SELECT5.to_bytes(4, "big"),
             "STATIC TSTR widget 4 -> 5 positions"),
        Poke(0x400D32D0, SELECT4.to_bytes(4, "big"), SELECT5.to_bytes(4, "big"),
             "FLEX TSTR widget 4 -> 5 positions"),
    ),
    gates=(Gate('tools/verify/verify_repitch.py'),),
)
