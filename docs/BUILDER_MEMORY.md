# Builder memory and patch contracts

The Octatrack builder accepts `DramRegion(symbol, size, align=16)` declarations from a module with DRAM linked units. Both native and browser builders allocate regions downward from the platform reserve ceiling in declaration order. The browser excludes the retained core logger area first. The linker memory-boundary names `_end`, `_edata` and `__bss_start` are reserved. Symbols are linker-owned: a runtime unit cannot also define a region symbol. Invalid sizes, alignments, duplicate symbols, insufficient reserve, and overlap with runtime code, packed stage or BSS are refused.

Nonempty ELF `.bss` contributes to occupied runtime memory but never to packed firmware bytes. Modules must initialize BSS and declared regions before reading them. The packed stage may temporarily occupy BSS until depacking finishes; preboot payloads must avoid BSS, regions and the runtime/stage. Native layout records include `bss_end` and `regions` when present; browser layouts expose `bssEnd` and `regions`.

The native ledger checks complete fixed patch spans, source cave reservations (`CavePatch.reserve`), declared conflicts and kept stock spans (`Keep`). Browser package metadata carries these contracts and DRAM declarations when used. Keep fingerprints are checked against the verified original OS before writes and against the final patched OS. Neither builder permits a conflicting write into kept bytes.

Legacy detours with guards shorter than their emitted instruction span are extended only from the globally fingerprinted, original local OS. No extracted bytes are committed or shipped in source packages. Whole emitted/guarded spans, rather than only hook start addresses, participate in conflict checks.

Stock-free GNU linker fixtures cover BSS bytes, boundary symbols, alignment and page-placement choices. Software parity does not constitute hardware or chip-cycle qualification.

The port follows [octabam 6f9e5bc9](https://github.com/sambanks/octabam/blob/6f9e5bc9db0ae9fa99fa2f2a0f4de1fdb8e9a136/tools/remix/platform_build.py), while retaining Modwerk’s existing source cache, stock-copy guards and runtime types. Run `scripts/verify-builder-memory.py` in the isolated SDK toolchain container for stock-free native memory integration checks.

The shared-builder validation reruns 38 legacy native profiles with identical complete-image hashes/refusals and checks all five current comparison records (490 selections), including USB Audio and Euclid 0.1.4. Mixed-build records affected by the USB Audio and Euclid updates are refreshed without changing those modules’ code or approvals. FM Synth’s original software/worker/audio reports remain frozen; publication checks the complete current native coverage and its recomputed counts rather than fixing the comparison pool to the historical report’s size.
