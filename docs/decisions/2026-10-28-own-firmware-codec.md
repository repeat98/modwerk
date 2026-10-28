# Modwerk's own firmware codec — 28 October 2026

- **Modwerk owns the codec.** The owner chose to build Elektron firmware with Modwerk's own section packer and depacker, SysEx transport and ColdFire decoder, written in this repository from format specifications and checked against recorded outputs ([src/engine/elektron/codec](../../src/engine/elektron/codec/)). The browser builders, the Node tooling and the Octatrack base build all use it.
- **The kit stays vendored.** The elekloader kit is still taken as released, but for four files that re-export Modwerk's modules; the lock, `elekloader:check` and `elekloader:update` keep that so across kit updates ([replaced kit files](../../vendor/elekloader/README.md#replaced-kit-files)).
- **Same bytes.** Every build, base and package keeps its identity: the packer writes the same streams as before, and a change that would alter them is a codec change of its own, with its own proof.
