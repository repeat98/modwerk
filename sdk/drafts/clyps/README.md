# CLYPS — experimental Octatrack performance module (community draft)

**Build the eight-track engine.** From the repository root run:

```sh
python3.12 -B -m unittest discover -s sdk/drafts/clyps -p 'test_*.py' -v
```

Use host cc, Python 3.12 and m68k-elf GCC/binutils (tested with GCC 16.2). This compiles the actual SRC/ARR, sequencer and edit-lock callbacks, checks ColdFire instructions, and links the relocatable image in a temporary directory. The stock-memory inputs in host tests are synthetic. For the public candidate based on the cumulative Octatrack branch, follow [the MKII build and replay recipe](NATIVE_REPLAY.md). The shared contract is under maintainer review.

**Artist/product direction:** Endrew. Built on Zac Kyoti's existing CLYPS ideas and independent Modwerk research with attribution retained. The project is independent and unofficial.

## What CLYPS is

A Session View-inspired performance system for Octatrack's **native sequencer**, not an audio machine and not a new clock.

- Each of eight **ordinary** audio tracks selects **one source sequence at a time** (not multiple simultaneous clips / no within-track polyphony).
- Sixteen source-pattern references per track and sixteen rows of combinations.
- Quantized row launch; a musician can then override only the bass, kick or another track without restarting the others.
- **Track SRC:** a contextual list to select and launch a sequence for the currently selected track, while retaining the underlying machine's SRC controls.
- **ARR:** an 8×4 global Meta overview with optional 4×4 Zoom / Row Edit, retaining stock Arranger data when CLYPS is removed.
- Native source-aware trig / p-lock editing remains **interlocked** until its separate ownership and undo gates pass.

**Only pattern references are implemented:** these are not sixteen independently allocated clip objects, and the row data is currently volatile.

## Emulator qualification

The public candidate based on #1910 ran a T2-only change at stock wrap 90. The independent eight-lane replay matched 624 ordered events, 608 timestamp writes and 219 sampled states. A second test exercised 16 rows and every ordinary track/source combination. FUNC+LEVEL outside Meta moved the native MAIN setting from 64 to 56 and back to 64, with CUE steady. The late request was accepted at 187, published at 188 and restored musically at 282. [Qualification and limits](TESTING.md).

The cumulative branch still needs the proposed capability. External clock, physical hardware and T8 as a playable Master track remain outside qualification.

## Work requested from Modwerk community

See [HOOK_PROPOSAL.md](HOOK_PROPOSAL.md) for the shared-base ABI questions and [HANDOFF.md](HANDOFF.md) for implementation status, acceptance tests, and independent tasks. Focused help is welcome with sequencer hook ownership, key/UI coexistence, timing witnesses, negative controls, portability to the current upstream base and source review.

**Do not flash this development build.** No OS files, stock executable bytes, emulated project images, binaries, dumps, copyrighted samples or private project data belong in Git.

## Source and qualification

[File-by-file import and licences](PROVENANCE.md). The native module remains a draft outside the catalogue. No physical MKII runs are recorded.
