# Port template: an Airwindows plugin as an Octatrack DSP effect

`npm run module:new -- <id> --kind dsp --port airwindows --upstream <plugin folder> --author <login>`
lays these files over the `dsp` template in the new draft (this README stays here). `<plugin folder>` is a
folder in your own clone of github.com/airwindows/airwindows, such as
`plugins/LinuxVST/src/Mackity`. The scaffold copies that folder's files and the repository's `LICENSE` from
the commit checked out (`HEAD`, not the working tree) into `upstream/`, records each with its SHA-256 and Git
blob in `import-record.json`, and fills in the manifest's `source`, credits and licence.

| File | What it is | Runs where |
|---|---|---|
| `upstream/` | upstream's files at the pinned commit, unchanged | read only |
| `reference.py` | `float_model` (upstream in double precision) and `Model` (the assembly, bit for bit) | imported |
| `test_reference.py` | `Model` against `float_model`, silence, the tail | host test: no tools, `sdk:check` and `module:doctor` |
| `verify.py` | `engine.asm` in dsp_host against `Model`: decode traps, automation, splits, LFO bits, garbage state, two instances, silence | needs the DSP tools |
| `perf.py` | meters for `evidence/performance.json`: three settings by sixteen splits, then the eight-instance stress run | needs the DSP tools |

`verify.py` and `perf.py` use the shared harness, `sdk/octatrack/tools/dsp_gate.py` (its docstring
lists what it offers; its tests are `sdk/tests/test_dsp_gate.py`): tool lookup, assembly, the synthetic
image, `run()` for one to eight instances, the assembler-trap check and the fx:audit renders. Both fail,
on purpose, until `reference.PORTED` is `True`. Any DSP effect's gate can import it the same way: the
`_library()` lookup at the top of `verify.py` finds it from the module folder, its mirror under
`sdk/octabam/modules` or `sdk/drafts`. It is not module source, so changing it moves no module's package
or native fingerprint; record its hash (`dsp_gate.provenance()`, which `verify.py` prints) in TESTING.md
beside your own files'. Modules written before it keep their own copies until a release moves them.

The loop: port upstream's `processReplacing` into `float_model`; write `engine.asm` and `Model` side by
side; `python3 -B test_reference.py` (seconds), then `python3 -B verify.py`; hear it with
`npm run module:dev -- <id>`. `sdk/octatrack/modules/mackity/` is the finished example.

When it is listed, move `import-record.json` to `sdk/imports/<id>-<short commit>.json`, add the module to
the `airwindows` entry of `sdk/octabam/licenses/manifest.json`, and run `npm run licenses:generate`
(docs/ADD_A_MODULE.md, Octatrack, step 1).
