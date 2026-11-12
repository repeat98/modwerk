# Source attribution

- Sam Banks: original POLY95 ColdFire runtime and measured envelope tables,
  MIT. Exact snapshot identities are in `import.json`; full terms in `LICENSE`.
- repeat98: preservation snapshot and Modwerk VECTOR pool/Part registration
  reference, MIT. Analog BD/FM registration code was also reviewed.
- New shared-pool, independent pitch, extended input and UI integration work:
  MIT under this repository's terms.

The native builder and emulator are validation dependencies, not bundled
binaries. Firmware, extracted stock bytes and sample/project images are not
part of this draft. Four stock replay holes are resolved from guarded local
firmware only at build time.
