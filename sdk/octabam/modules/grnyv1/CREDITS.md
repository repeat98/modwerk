# FRACT credits

FRACT's granular engine, controls, native adapter, LCD rendering, tests and
documentation were created for this project by toli (`ex1010`). Authored code
is MIT licensed; see [LICENSE](LICENSE).

SPACE in `engine.asm` adapts Jannik Assfalg (repeat98)'s Mini Verb, MIT, from
Modwerk revision `c0c949a4c2b71bc8adb7ab5f718f44209071a71e`, originally at
`modules/miniverb/miniverb.asm`. The adaptation retains its delay and allpass
lengths (packed without the two gaps its deeper modulation kept) and its
eight loop allpasses, adds six input allpasses and stereo mid/side excitation,
and introduces the coupled SPACE control, mix slew, bypass and bounded clear.
Its upstream permission notice credits Sam Banks and is retained in full in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Native source-fetch and LCD integration were informed by Sam Banks's Octabam
and POLY8 references, MIT, at that same pinned revision. The local 3x5 font is
original. Dial sprites are referenced in the user's firmware at runtime; their
bitmap data is not included. Dependencies and research references are listed
in the [project credits](../../CREDITS.md).

The LCD captures in `media/` are actual octemu output of this source's UI
probe build (`media/README.md`). Elektron's interface and product marks
retain their respective ownership. Historical private listening
fixtures use the user's Snow Piano sample from Dillon Bastan's Grain Forest;
neither that recording nor any sample library is distributed. Reproducible
project demos use original synthesis.
