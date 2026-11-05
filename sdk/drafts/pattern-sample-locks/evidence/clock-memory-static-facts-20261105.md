# Pattern Sample Locks 0.1.8: clock, timer, SDRAM and arbitration facts

This is an offline, source/image-bound inventory of the clock and memory-controller facts available for the exact USB-only candidate. It does not establish live register state, hardware timing, a chip-cycle or latency bound, or release qualification. No hardware was accessed.

## Bound inputs

- Candidate package SHA-256: `3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79`.
- Candidate native-source fingerprint (62 files): `7ea0fbdf317bfdab6a82b22869c7029ba23901cd27a3337a4bdaf8f8beeb7e69`.
- Canonical base configuration identity (`baseIdentity`): `9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc`. The author-reported physical trial says device IDENTIFY returned this same configuration hash; it is not a firmware image hash.
- The hash-verified private reconstruction for that configuration has `MAIN.raw` SHA-256 `877a8d6884cb05508a59b312a0e95498c33ce4a1e2f1fe452423b0edc74fb69e`. No physical MAIN hash or readback was recorded, so byte-for-byte equality between the device image and private reconstruction is unproven.
- The private base proof binds upstream commit `3b31ef3c0e43c810e3acd0be6257e2484b20fc40` and 233 listed source inputs; it describes that reconstructed artifact as a prototype, `productionReady: false`, with hardware `not tested`. That metadata does not establish what image was running during the author-reported trial. The private audit helper checks the candidate package and reconstructed base/private-stock image hashes; the native-source fingerprint was independently recomputed with the repository helper under Node 24.22.1.
- Register semantics below are from the [NXP MCF54455 Reference Manual, Rev. 6.1](https://www.nxp.com/docs/en/reference-manual/MCF54455RM.pdf), principally §§8.2.1, 8.3.3–8.3.4, 9.2.4, 15.3 and 15.5.1.2, 21.4.2–21.4.3 and 21.5.1.7, and 30.2.1 and 30.2.6.

## What the exact image and manual establish

### PLL and CPU/bus clock relationship

The pinned startup image and private stock comparison agree on the PLL divider configuration. Applying the manual's field definitions gives programmed ratios `fSYS = 11 × fREF` and internal bus `fSYS/2 = 5.5 × fREF` while the PLL is in normal locked mode. Exact register literals and addresses are retained in the private cache and omitted here.

There is a material spec discrepancy: the pinned startup configuration sets a nonzero bit in a PCR field the manual marks “Reserved, must be cleared.” The exact setting is kept private; the available evidence does not establish that this reserved-field use is valid or stable. The startup sequence brackets PLL writes with the LIMP-mode bit and polls PLL status, but this does not prove later live reference frequency, lock, clock mode, or absence of transition. The manual says unlocked PLL frequency is not well-defined and may exceed the maximum system frequency, and documents low-power/limp clocking. The board's `fREF` and tolerance are not bound; no board frequency is inferred.

### DTCN3 source and peripheral gate

The pinned image configures DTIM3 to count from the internal bus clock divided by one, enables the timer, selects restart-on-reference behavior, and leaves capture/output/interrupt functions disabled. The manual says DTCN increments on rising edges of its selected source. Thus, if this mode remains active, the peripheral clock is enabled, and PLL normal mode remains locked, DTCN3 advances at the internal-bus rate (`5.5 × fREF`). This is a timer-source relationship, not a CPU instruction-cycle conversion; exact register fields remain private.

The manual says the reset state leaves the DTIM3 peripheral clock enabled. A literal-absolute-reference scan of the exact base and private stock image sweeps found no references to the peripheral clock-gate registers. This bounded observation does not exclude indirect register writes, code outside the scanned images, or a later runtime/companion change; the current gate state is not read by the candidate or supported read-only report. Continued timer clocking in the live system remains conditional.

### SDRAM startup timing and refresh

The pinned base startup and private stock comparison agree on the SDRAM timing and operating-mode fields. The configured refresh field corresponds to an *average periodic target* of 960 SD_CLK periods; the manual defines each count unit as 64 SD_CLK periods and gives the field formula in §21.4.2. The manual derives SD_CLK from the internal bus clock (`fSYS/2`). This establishes a configured average refresh target in controller clock periods, not a strict maximum interval or elapsed time.

The manual requires SDRAM timing fields to be chosen from the attached part's data sheet and expressed in controller clock units. It also says an auto-refresh due during an active memory access is scheduled after that transfer finishes while the interval timer continues. The verified inputs do not identify/bind the part timing sheet, prove live controller state, or bound access completion under cache misses, refresh, bus contention or state changes. Converting the average period or any candidate instruction envelope to time is unsupported without the physical reference frequency and full timing/state assumptions.

### SDRAM crossbar arbitration

The verified startup config selects round-robin arbitration for the SDRAM slave and parking on the last master. The manual's master-port table has one core port and six non-core ports. The helper enumerates the 64 subsets of active non-core ports across seven possible current/last ports (448 combinations) and finds no more than six active non-core port identifiers ahead of the core in the cyclic order, assuming a continuously pending core request. **This model does not account for transfer length, number of transfers per grant, when masters assert requests, or service time.** The manual explicitly allows a granted master to perform as many transfers as desired until another master requests that slave, then switches at a transfer boundary. Therefore 448 cases establish only an ordering-distance sanity check; they do not establish a maximum count of transfers, bus cycles or latency. The live arbitration registers and all runtime rewrites are not available through the existing read path.

## Why a chip-cycle or latency upper bound does not follow

The offline evidence proves programmed clock ratios, timer-source configuration, an average refresh target in controller clocks, and startup arbitration policy. It does not prove `fREF`, stable live PLL/low-power state, live timer gate, SDRAM part timing, live controller/cache state, or a maximum completion time for any SDRAM/crossbar transfer. The PCR reserved-field discrepancy prevents treating the PLL configuration as spec-validated. Existing candidate instruction counts are not core cycles; instruction timing, fetch/data misses, SDRAM wait/refresh, DMA arbitration, and interrupt/level-seven paths remain outside that count. Therefore no conservative end-to-end chip-cycle or elapsed-latency upper bound is justified from the available offline inputs.

Smallest inputs to close the static-to-time gap are: (1) authoritative board-specific oscillator/reference frequency and tolerance plus evidence for the operating PLL mode/lock behavior, (2) the exact fitted SDRAM part and guaranteed timing limits at voltage/temperature, and (3) a validated upper bound for maximum SDRAM service time under refresh and all active masters. A live measurement of current registers would bind one state but would not prove the worst-case service/timing bound or absence of later reconfiguration. Complete candidate/stock call and interrupt bounds, cache state assumptions, and the existing unresolved IPL-7/stack gate are additional requirements before claiming an end-to-end operation latency bound.

## Reproduction

The private helper checks exact package/base/private-stock identities, verifies the startup ranges agree, decodes detailed PLL/timer/SDRAM fields, checks PLL LIMP bracketing and lock polls, checks the timer reset gate and peripheral-gate reference scan, computes the average refresh target, and enumerates 448 round-robin port-order combinations. It explicitly marks that the arbitration model does not account for transfer length, request duration or service time. Detailed register literals, source/disassembly inputs and JSON output stay in private cache; the committed note contains no firmware bytes, instruction listing, extracted stock table or memory dump.

```sh
python3 /Users/weiyun.wang/.cache/psl-source-bound-profile-20261103/interrupt-audit-20261104/audit_interrupt_context.py \
  "$PWD" \
  /Users/weiyun.wang/.cache/psl-current-base-workspace/current \
  /Users/weiyun.wang/.cache/psl-source-bound-profile-20261103/stock-bound-20261104/public-integration-80f442d5-container/pattern-sample-locks-0.1.8-public-path.mwrm \
  /Users/weiyun.wang/.cache/modwerk-upstream/elekloader

python3 /Users/weiyun.wang/.cache/psl-source-bound-profile-20261103/clock-memory-20261105/audit_clock_memory.py \
  > /tmp/psl-clock-memory-result-v2.json

/Users/weiyun.wang/.nvm/versions/node/v24.22.1/bin/node --input-type=module -e 'import { moduleNativeSourceSha256 } from "./scripts/module-qualification.mjs"; import { readFile } from "node:fs/promises"; const d=JSON.parse(await readFile("sdk/drafts/pattern-sample-locks/octamod.module.json","utf8")); console.log(await moduleNativeSourceSha256("sdk/drafts/pattern-sample-locks", d));'
```

The helper SHA-256 for this run is `f5fc1390cd7cf34782943ac898e375c083dec864134c6b89db3d39d76a1163c7`; the private JSON output SHA-256 is `2b499664c34ec9fff7939032a15b5941631c6a4e1bb4cffaf74a442cd9abacba`. It passed with candidate/base/private-stock identities matched, four PLL lock-poll and LIMP-bracketing checks true, timer decode and reset gate checks passed, no literal peripheral-gate address references in either image sweep, average refresh target `960` clocks, and at most six active non-core master-port identifiers ahead of the core across `448` order combinations; transfer length is not modeled. The Node command printed native fingerprint `7ea0fbdf317bfdab6a82b22869c7029ba23901cd27a3337a4bdaf8f8beeb7e69`. No Docker, emulator, hardware or runtime measurement was used; no release qualification claim is made.

The base-source recheck matched 233/233 proof-listed files (228 repository files and five pinned Elekloader files), confirmed upstream commit `3b31ef3c0e43c810e3acd0be6257e2484b20fc40`, and printed no bytes or source excerpts.
