# Owner waiver draft (first catalog release)

CX OSC is a ColdFire track machine (no DSP effect). Publication rules still ask for `tests.qualification.cycles` (coldfire, cycles/event) and a stamped `evidence/performance.json`.

## Suggested `sdk/approvals/cx-osc-build-approval.json` waivers

- `chip-worst-case-cycles`: no static `cfmeter` bound yet; frame curve and machine-render price measured on unit (`evidence/frame-cost.json`, 6 % descriptor).
- Optionally `complete-memory-bounds`: USB package size known (29,968 bytes code/data); SDRAM hook footprint not fully audited.

## Owner statement (edit for PR)

First experimental listing of CX OSC (octabam port @ 256bcf4b). Hardware: `device:test` and load stress on MKII dev twin; FM Synth conflict enforced by configurator and a group-owned compat relation. Approve publication without a ColdFire static cycle bound until a measured or inferred worst case is filed, using the same pattern as early FM Synth experimental releases.