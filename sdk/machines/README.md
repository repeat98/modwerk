# Machine profiles

One folder per machine (Elektron instruments and Zoom MultiStomp pedals), each with a `machine.json` validated by [`src/devices/machine-contract.ts`](../../src/devices/machine-contract.ts). The website's machine list, machine pages and forum sections are generated from these files (`npm run machines:generate`).

Machines with an SDK also have a guide here: [Octatrack](octatrack/README.md), [Digitakt](digitakt/README.md) and [Digitone](digitone/README.md). To move a machine forward, follow [Add a machine](../../docs/ADD_A_MACHINE.md). The full standard is in [the SDK guide](../../docs/SDK.md).
