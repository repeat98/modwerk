SDK tests: resident transport checks derive the unsupported feature probe,
per-core masks and exact reset boundaries from the declared DSP ledger.
Adding a supported feature no longer makes an unknown-feature test request
valid. Packet, refusal, ACK, timeout and generator-drift checks remain intact.
No instrument code or packages change.
Native fixtures link the real returning descriptor validator and model no active
returning processor; legacy volatile work remains blocked. Published-service
and selected-tool expectations follow their declared metadata, and malformed
registry coverage uses an actually invalid kind. Existing assertions remain enabled.
