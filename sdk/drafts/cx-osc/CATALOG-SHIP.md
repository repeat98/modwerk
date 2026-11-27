# Catalog ship checklist (CX OSC)

Draft PR [#2293](https://github.com/repeat98/modwerk/pull/2293) is CI-clean as an **experimental draft**. Listing in `sdk/catalog.json` is a separate release. `npm run module:doctor -- --draft cx-osc --release` is the gate.

## Blocker you cannot fold into the module PR

**`sdk/machines/octatrack/compatibility.json`** is a judge file. A contributor module PR must not edit it (module scope). While **synth** and **cx-osc** are both active, `modules:compat` needs the reviewed **group-owned** relation. A ready-made entry is in `owner-compat-relation.json` in this folder (same content as commit `807ec33`).

**Order with the owner**

1. Land **catalog + module folder + packages** (your module PR) and **compat relation** (owner **Fix:** PR, or one owner merge of both) in the same window so `cx-osc` is never active without the relation row.
2. Until then, keep the module in `sdk/drafts/cx-osc/` only.

Configurator `conflicts: ["synth"]` is not enough for the compat matrix.

## Doctor release lines still open (27 Nov 2026)

| Line | What is missing | How to close |
| --- | --- | --- |
| cross-compatibility | 23 hook sites vs synth | Owner relation in `compatibility.json` (above) |
| performance cycles | `evidence/performance.json` static/measured null | ColdFire worst-case bounds (cfmeter / static analysis path machines use; see synth owner waiver pattern) |
| performance benchmark | `stockLongestUs`, idle percents | `npm run perf:audit` or device guard readings with stamp |
| performance stress | MIDI flood, 240 BPM, 10 s | `npm run test:procedure` stress step on unit or documented waiver request |
| performance stamp | No source bind | `npm run perf:audit -- check ... --stamp` after measure |
| tests.qualification | Not in `octamod.module.json` yet | `npm run module:qualify -- cx-osc --procedure DIR --write` after measures |
| catalog / packages | Still draft | Steps below |
| usb package | No `public/octatrack-modules/cx-osc/0.1.0-experimental.mwrm` | Docker build + import |

Already green: host tests, cpu price, at-rest, frame cost (evidence JSON), thumbnail, board claim.

## Listing steps (machines: manual, not `module:list`)

Machines are not DSP effects. Follow [ADD_A_MODULE.md Octatrack step 4](https://github.com/repeat98/modwerk/blob/main/docs/ADD_A_MODULE.md#octatrack) manual path:

1. **Qualification record** in `octamod.module.json` `tests.qualification` (cycles coldfire, memory regions, hardware report, tutorial, screenshot paths). Bind `sourceSha256` and twin `imageSha256` from `npm run module:qualify -- cx-osc --rehash`.
2. **UI captures** under `media/` via `scripts/capture-module-ui.py` (PLAYBACK + SRC SETUP + LFO for PMTR 30–34). Register paths in `tests.documentation.screenshots` and `media[]`.
3. **Move** `sdk/drafts/cx-osc/` → `sdk/octatrack/modules/cx-osc/` and move `CHANGELOG.json` → `src/community/module-changelogs/cx-osc.json`.
4. **`sdk/catalog.json`**: add `{ "id": "cx-osc", "version": "0.1.0-experimental", "addedAt": "<UTC>" }` after the machine block (near `synth`).
5. **`scripts/build-module-packages.py`**: add `cx-osc` to `REQUESTED`.
6. **`src/engine/assets/octatrack-module-packages.json`**: row with path `octatrack-modules/cx-osc/0.1.0-experimental.mwrm` (no DSP cycles fields; ColdFire USB package like `synth`).
7. **Owner build approval** file `sdk/approvals/cx-osc-build-approval.json` (see `synth-build-approval.json`). First release normally needs owner sign-off; waivers only by owner.
8. **Build and commit packages** (Colima/Docker up, stock OS local):

   ```sh
   docker build --file sdk/build/Dockerfile --tag modwerk-source-tools .
   bash scripts/build-modules-isolated.sh . ../module-packages "$(docker image inspect modwerk-source-tools --format '{{.Id}}')"
   npm run modules:import -- ../module-packages/packages --development
   ```

9. **`npm run modules:generate`** then **`npm run device:price -- --write-costs --curve T1,T3,T6,T7`** (or hand-copy evidence into `frame-costs-base.json` and regenerate) so admission uses the measured curve.
10. **`TESTING.md`**: `npm run test:procedure -- cx-osc` record + package SHA-256 prefix (ready PR, not draft).
11. **`npm run module:doctor -- cx-osc`** (no `--draft`) all green.
12. **`npm run modules:compat`** with both **synth** and **cx-osc** catalogued and relation merged.

## Hardware still worth doing before you call it shipped

From TESTING.md and limitations: listening pass, MIDI/chromatic, Part/project save with CX selected, power-cycle after Keep, GLIDE/legato N/A for CX, second instance on another track (allowed: one CX per Part).

## octabam backport

See `BACKPORT-OCTABAM.md`. Independent of Modwerk catalog.