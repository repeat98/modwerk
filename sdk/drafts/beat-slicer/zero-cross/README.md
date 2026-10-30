# Beat Slicer 0.1.68 — private SNAP candidate

twwwy's next update adds **C: SNAP OFF/ON** to the approved three-by-two
encoder layout. A remains BPM source and B remains beat spacing. D–F are
inert. Native font/frame, Mixer height, live eight-track backdrop and cached
drawing are retained from 0.1.67, together with its base-owned FUNC + AED cycle.
The first chord opens stock CREATE SLICE GRID; repeated chords switch between
that chooser and CREATE BEAT GRID. Switching cancels the preview without
creating slices. Both the early observer and late key consumer are included in
this cumulative private base proposal; the module alone cannot add the cycle.

OFF keeps mathematical beat positions and uses the existing replacement API.
ON requests boundary alignment through the private base extension below.
SNAP starts OFF after loading the package, survives reopening while that
instance remains loaded, and is not saved to a project or sample.

Turning C, opening, drawing and idling do not read PCM. The same native
CREATE/REPLACE question remains. Only YES starts analysis. NO, other key presses,
encoder input, source/owner changes and failed reads cancel without publishing
a partial table. Successful analysis publishes once, preserving inactive rows.
No save or musician-facing slice Undo is implicit.

The opening's stock waveform channel selection is captured: left, right or
both. BOTH admits a crossing in either channel. Each search starts from its
original beat anchor; offsets do not accumulate tempo drift. The initial
boundary is retained, nearer valid candidates win, and ties choose backward.
A final end may move beyond trim while staying within actual audio.

The original search uses native PCM pair readers, with at most 32 pairs per
engine request and 65,536 pairs per edit. Neighbouring boundaries bound searches.
Read failures, exhausted work limits and invalid/minimum-length results leave
the old markers intact. A direction without an admissible pair retains its
anchor; this includes the final full-sample edge. These defensive cases differ
from the invalid stock results observed in a synthetic DC fixture.

Zero-crossing alignment alone does not guarantee click-free playback,
particularly when only one stereo channel crosses.

## Private base proposal

The released base sources are unchanged. `base.patch` is a stock-free source
proposal with strict preimage hashes in `base-preimages.json`.
`prepare_base.py` applies it to a new source directory; the existing SDK
builders then build normally. No firmware, extracted instructions/tables,
sample pointers or package callback are included in the patch.

The proposal appends an optional `replace_options` interface behind the
unchanged ABI-1 prefix and its original sizeof. Old clients retain their
interface. This candidate checks the advertised size before using SNAP; an
older base keeps SNAP OFF and reports NO SNAP when ON is requested.
`sample_options.h` is the temporary client declaration pending shared-SDK
review, not a dependency on another module.

The base owns copied proposals, the question, source/owner revalidation, bounded
engine work and publication. A resident no-op queue record drives each chunk
through the existing engine observer; there is no new stock patch site. A BUSY
chunk pauses until a later UI tick, avoiding an engine retry loop. PCM reads
use the native Flex/Static readers in the engine, outside the full interrupt
mask. The number of reads is bounded; Static IO wall time is not established.

The base extension needs separate owner review and qualification before a
module release can use it. This cumulative 0.1.68 proposal includes the 0.1.67
UI, cached drawing and shortcut changes, and adds SNAP. It changes no published
package, base, catalogue or release entry. No automatic publication is requested.

## Build and checks

```sh
python3 -B sdk/drafts/beat-slicer/zero-cross/prepare_base.py \
  --source /path/to/checkout --output /private/new-source
python3 -B sdk/tests/test_beat_slicer_zero_cross.py
```

Run the existing `sdk/runtime/loader/build.py` on `device_module.c`,
`device_font.c` and `grid_preview.c`, subscribing
`ot_sample_editor_actions:bs_sample_action:50`, with output named
`beat-slicer.mwrm`. Use the immutable toolchain in `build.json`, read-only
source, private output, networking disabled and executable temporary storage.

Package: `195d2b46e2620bd15118478aa02d626d6d803692e02c40db4f45a67f6927b643`,
5,332 bytes; 4,392 initialized + 3,488 BSS = 7,880 bytes; 179 relocations.
No heap, DSP, PCM reader or stock patch is in the module.

See [RESEARCH.md](RESEARCH.md), [TESTING.md](TESTING.md), `build.json` and
`base-build.json`. Private images, native probes and logs stay in the
developer's `zero-cross-20261030` cache. Hardware evidence is build-specific in
[TESTING.md](TESTING.md); earlier SNAP builds omitted the shortcut and cannot
qualify the cumulative build.

Private WAV generation, decoded-PCM verification, measurement-base preparation,
read-only snapshots and complete-record comparison are in
[hardware/README.md](hardware/README.md). The pack is shown to the owner before
any unit trial. Measurement images have separate identities; their results do
not qualify the uninstrumented base. Original WAVs, ZIPs, plots, card backups
and device captures stay outside Git.
