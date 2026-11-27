# Listing status (27 Nov 2026)

Prepared on branch `module/cx-osc` for catalog PR **#2293**.

## Done in tree

- `sdk/drafts/cx-osc/` moved to `sdk/octatrack/modules/cx-osc/`
- `src/community/module-changelogs/cx-osc.json`
- `sdk/catalog.json` entry `0.1.0-experimental`
- `scripts/build-module-packages.py` `REQUESTED` includes `cx-osc`
- `octamod.module.json`: qualification, functional hardware, PNG `media/`, tutorial
- `evidence/performance.json` partial fill
- Import pin paths updated

## Owner same window (not on module PR alone)

1. **`sdk/machines/octatrack/compatibility.json`**: paste `owner-compat-relation.json` when this catalog lands (or land base hooks #2352 and migrate detours first).
2. **`sdk/approvals/cx-osc-build-approval.json`**: first-release owner sign-off (see `evidence/waiver-request.md`).

## You run on the unit (blocking doctor)

```bash
npm run device:price -- --write --curve T1,T3,T6,T7 \
  --measure-pattern medium --base 0.8.2 --scene "MKII medium pattern" cx-osc
npm run modules:generate
```

Re-read frame cost on the **medium** pattern (generator refused rest at 72 % stock on the empty pattern).

Then Docker packages:

```bash
docker build --file sdk/build/Dockerfile --tag modwerk-source-tools .
bash scripts/build-modules-isolated.sh . ../module-packages "$(docker image inspect modwerk-source-tools --format '{{.Id}}')"
npm run modules:import -- ../module-packages/packages --development
```

Then:

```bash
npm run perf:audit -- check sdk/octatrack/modules/cx-osc/evidence/performance.json --stamp
npm run module:doctor -- cx-osc
npm run modules:compat -- synth cx-osc   # after compat relation merged
```