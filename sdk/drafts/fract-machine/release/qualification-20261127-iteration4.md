# FRACT performance iteration4 — 27 November2026

Unpublished experimental source; no release approval. Source baseline7c088d40 plus local module changes; previous submitted source revision4ed908fa76a5fa93cc2f053242af4e39d80c0ccf remains provenance, not a new commit.

Released-base package `c4e1e0d20eda9d14e226e0a87ff0de7cd04453591b0f4ecf7f3a0e6dd9a7f3a4` (base24e480…); private development twin `55205d9cba4ab016fd141d218705b8cf11bd571b4b9c0dae7b980e199e594b11` (base46c308…). Fresh stock reconstruction and strict verification pass for both. Native resource audit56192resident bytes and696 own callback stack bytes; excludes stock/base frames and interrupt overhead.

The shortest Hann loop caches exactly the same interpolated coefficient until the phase crosses its segment. It covers Hann windows up to819frames; larger windows and other shapes retain the existing path. The shifted fractional accumulator uses ADD.L carry/borrow; the end check precedes coefficient reload. 23232 QEMU comparisons, including6848 endpoint cases, preserve audio, untouched accumulator words and callee-saved registers in all four formats and both sample directions. These are semantics and comparative instruction checks, not device timing.

No physical USB device was opened by offline build/parity checks. The separately labelled hardware retest is running on the developer's Octatrack; no previous hardware result qualifies this package. USB Audio4ch stream and moving controls must pass without new guard skips; full qualification, companion/format matrix, listening and persistence remain pending.
