# DT-FM testing

This Modwerk import carries over the upstream DT-FM source and Modwerk build metadata. A limited owner-reported hardware performance observation is recorded below; it is not full DSP or hardware qualification.

## Imported source

- upstream repository: https://github.com/mtalikka/DT-FM
- upstream revision: 2255df788470638c867e24e83290f9e95e91e5ec
- imported files: `src/`, `LICENSE`, and the upstream README under `upstream/`

## Modwerk checks

- `module` metadata is in `modwerk.module.json` and `build.json`.
- `machine-pages` is declared as the required dependency for the Digitakt build.
- The original build patch sites are reflected in the release table for OS 1.53 and 1.54.

## Modwerk hardware performance observation

On 22 October 2026, the module maintainer reports testing a Modwerk-built Digitakt 1 OS 1.54 firmware with DT-FM, Digi Health, Digi Utils and Machine Pages installed. With FAST audio enabled, six simultaneous DT-FM tracks played before Digi Health's System Info showed CPU usage at 100%. The reported test lasted about five minutes. The source identity is recorded in [the hardware performance report](evidence/hardware-performance-2026-10-22.md), bound to the DT-FM `src/` files and `build.json`.

This is evidence of a limited performance run on that device and module combination. No test-project details, repeated runs, or exact firmware hash were retained. The System Info CPU threshold is not a per-module DSP-cycle or worst-case load measurement. OS 1.53, other module combinations, persistence, reboot, sampling and broader hardware behavior remain untested. See [the hardware performance report](evidence/hardware-performance-2026-10-22.md).

## Residual qualification gap

The original author’s hardware and DSP validation remains the authoritative evidence for the FM engine itself. Modwerk has not measured worst-case DSP cycles, module memory, or maximum stable load.
