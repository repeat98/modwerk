# DT-FM hardware performance observation — 22 October 2026

- **Tester:** module maintainer (owner-reported)
- **Device:** Digitakt 1
- **OS:** 1.54
- **Duration:** approximately 5 minutes
- **Firmware:** Modwerk-built with DT-FM, Digi Health, Digi Utils and Machine Pages
- **Mode:** FAST audio enabled
- **Result:** six simultaneous DT-FM tracks played before Digi Health's System Info showed CPU usage at 100%.

The recorded source identity is `75405900cf7eaa8fda4ad731783bb4731b5185b4e76b0e2f8bc22351470a5363`, the SHA-256 of a sorted JSON mapping of the DT-FM `src/` and `build.json` paths to their individual SHA-256 hashes.

This is a limited performance observation for this device, OS, firmware composition and test session. No test-project details, repeated runs, exact firmware hash or System Info capture were retained. The CPU threshold is not a per-module DSP-cycle or worst-case load measurement. OS 1.53, other module combinations, persistence, reboot, sampling and broader hardware behavior were not tested. This report does not establish worst-case DSP timing, exact memory use or a general maximum track count.
