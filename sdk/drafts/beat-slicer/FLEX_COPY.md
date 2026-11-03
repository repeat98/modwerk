# Native Flex copy component

`flex_copy.c` and `flex_lookup.S` are original target code for the proposed
base-owned reader. They are not a live binding, hook, public SDK ABI or source
admission decision. The implementation is disabled in practice because no
native caller/ownership/writer-coverage service is installed.

The base must first verify the exact image/lookup entry, control and descriptor
layouts, all metadata memory regions, pool geometry and allowed map regions.
The portable binding takes those trusted addresses/extents explicitly; it does
not discover them or assume that any supplied address is safe to dereference.

Each copy runs while the caller holds the same verified boundary as every
relevant writer. It checks Flex slots 0–127, 16/24-bit big-endian mono/stereo,
source extent, ready/busy state and exact format/length. Runtime descriptor
geometry must agree with page bytes and frame width. It fetches current map
pointers anew, checks alignment and complete readable ranges, validates the
owned allocation extent and bounds the requested physical page.

Only then does the ABI shim call the supplied stock entry with forward direction.
The original wrapper captures the stock D0 pointer and D1 run into a C record
while preserving callee-save state. The C component requires both to equal the
independently derived pointer/run, limits the copy by the request and page/end,
and copies bytes into owned staging. A refusal leaves output and byte count
unchanged. There is no pointer retention, allocation, IO wait or source write.

The native fixture supplies original synthetic maps, controls and descriptor
geometry to private 1.40C instructions. It does not establish runtime descriptor
initialization, all map-writer paths, source identity, cache coherency, scheduling
or live unit timing. A slot counter is still not a content generation. Calling
this component without complete writer exclusion remains unsafe, regardless of
its bound checks. Static/recorder/little-endian sources are refused.

A source provider must independently validate the preview token and metadata
before and after copying, and use nonblocking external prefetch for Static.
No native service or module is enabled by the component's passing tests.

The 0.1.14 fixture additionally runs the entire compiled decoder/preview/session/
candidate chain through this component, with actual stock gain invalidating
partial and completed previews. This proves composition of those target paths;
the fixture's sequential ownership and authored identities are still not a live
provider or native writer-tracking implementation. See TESTING.md.
