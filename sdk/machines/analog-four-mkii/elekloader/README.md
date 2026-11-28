# Modwerk base for Analog Four MKII

The base starts at Elekloader core-a4 0.5 from release v0.10.0. The source and its full GPL-2.0-or-later terms are here. Its [import record](../../../imports/core-a4-source-0f990f2.json) pins the revision and credits irpina and the upstream contributors.

The base recipe records stock sites by length and SHA-256. The build checks those signatures against the owner's OS 1.56 file. The interface reference retains the public upstream package's hook and patch contract and section sizes. Modwerk disables GCC's late-combine pass for the base, as it does on the Analog Rytm MKII.

Use `npm run machine:base -- analog-four-mkii --stock /path/to/Analog-Four_MKII_OS1.56.syx --out /path/to/new-output`. See the [machine guide](../README.md) for the toolchain and recovery procedure.
