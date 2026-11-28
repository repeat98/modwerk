SDK tests: resident transport checks derive the unsupported feature probe,
per-core masks and exact reset boundaries from the declared DSP ledger.
Adding a supported feature no longer makes an unknown-feature test request
valid. Packet, refusal, ACK, timeout and generator-drift checks remain intact.
No instrument code or packages change.
