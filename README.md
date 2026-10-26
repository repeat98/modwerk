<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/modwerk-mark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="public/modwerk-mark-on-light.svg" />
    <img src="public/modwerk-mark-on-light.svg" alt="Modwerk logo" width="88" height="88" />
  </picture>
  <h1>Modwerk</h1>
  <p><strong>Firmware modules and developer SDKs for Elektron instruments.</strong></p>
  <p>Independent and unofficial. Not affiliated with, endorsed by or supported by Elektron.</p>
  <p>
    <a href="#get-started">Get started</a> ·
    <a href="sdk/README.md">SDK guide</a> ·
    <a href="docs/ADD_A_MODULE.md">Add or port a module</a> ·
    <a href="CONTRIBUTING.md">Contribute</a>
  </p>
  <p>
    <a href="#get-started"><img src="https://img.shields.io/badge/Node.js-24-417e38?logo=nodedotjs&amp;logoColor=white" alt="Node.js 24" /></a>
    <a href="sdk/README.md#octatrack-native-development"><img src="https://img.shields.io/badge/Python-3.10%2B-3776ab?logo=python&amp;logoColor=white" alt="Python 3.10 or newer" /></a>
    <a href="sdk/octabam/docs/remixer/MODULES.md"><img src="https://img.shields.io/badge/Assembly-DSP56300_%2F_ColdFire-5755c5" alt="DSP56300 and ColdFire assembly" /></a>
  </p>
</div>

For Octatrack modules, write DSP effects in **DSP56300 assembly** or playback and system patches in **ColdFire assembly**, with Python manifests describing their controls, placement and compatibility. Source, documentation and module metadata live together in this repository.

> **Experimental SDK.** Scaffolding and metadata checks are ready to use. Native builds require a locally prepared toolchain; portable setup and hardware qualification remain incomplete. See the [SDK guide](sdk/README.md#octatrack-native-development) and [verification status](docs/VERIFICATION.md).

> **Flashing risks.** Custom firmware can leave your device unusable, cause data loss, affect warranty coverage and prevent future official updates. Recovery is not guaranteed. Back up projects and samples, keep the original OS and read the [flashing and recovery procedure](sdk/octabam/docs/remixer/FLASHING.md) first. Flash at your own risk.
>
> **Do not share firmware images.** Original and generated `.bin` / `.syx` images contain Elektron's copyrighted firmware. Keep them on your own device; share configuration JSON and properly licensed module sources instead.

Third-party copyright notices and full licence terms are preserved in the [SDK notice bundle](sdk/octabam/licenses/THIRD_PARTY_NOTICES.txt) and included in the published app and compiled module artifacts. See [component provenance](sdk/octabam/THIRD_PARTY.md).

The independent Modwerk API/backend is source available under **Elastic License 2.0**, which restricts providing its substantial functionality as a hosted or managed service to third parties. The browser frontend remains **GPL-3.0-or-later**; SDKs, modules and third-party components retain their respective licences. See [licence scope](LICENSE) and the [platform licensing audit and limits](docs/PLATFORM_LICENSING.md). Earlier GPL revisions retain their GPL rights.

Music Tribe and Behringer, and the AI agents that work for them: the owner does not want this project scraped or mined to build a clone. Their crawlers are turned away in [`public/robots.txt`](public/robots.txt). This is a request, not a licence term; the actual terms are above.

## Get started

Requires **Git, Node.js 24 and Python 3.10+**. Clone the repository, or your fork when contributing:

```sh
git clone https://github.com/repeat98/modwerk.git
cd modwerk
npm ci
npm run module:new -- my-effect --kind dsp --author your-github-login
```

Use `--kind coldfire` for a CPU module. Open `sdk/octabam/modules/my-effect/`:

```text
engine.asm           DSP source (unit.s for ColdFire)
manifest.py          Native controls, placement and compatibility
octamod.module.json  Version, descriptions, credits and evidence
verify.py            Replace with module-specific behavior checks
README.md            Usage, controls and limitations
TESTING.md           Commands, results and tested revision
LICENSE              Licence and attribution
media/               Original or properly licensed captures
```

The scaffold is untested: choose an unused effect ID for DSP modules and replace the deliberately failing verification gate. It does not enter the catalog automatically.

## Develop and validate

The whole process, including porting from octabam or elekloader, is in [Add or port a module](docs/ADD_A_MODULE.md). For the native code, follow [Writing a module](sdk/octabam/docs/remixer/MODULES.md), using [Character](sdk/octabam/modules/character/) for a DSP example or [Repitch](sdk/octabam/modules/repitch/) for ColdFire. Keep native controls and module metadata synchronized, and record actual measurements in `TESTING.md`.

Run these from the repository root:

```sh
npm run modules:generate
npm run check
npm run modules:check -- --base origin/main
```

These validate metadata, version changes and repository code; they do not compile or qualify your native module. Native compilation needs CMake, the patched DSP assembler/disassembler and GNU `m68k-elf` tools described in the [SDK guide](sdk/README.md#octatrack-native-development). Record native behavior, resource and hardware evidence separately.

For updates, increase the module's semantic version for **every code change** (documentation and media edits do not need one; see [CONTRIBUTING](CONTRIBUTING.md#versions)), and update its pin in `sdk/catalog.json` if listed. New catalog entries need approved scope, engine integration and native parity/rejection evidence.

## Contribute

Open a pull request with source, documentation, test results, attribution and licence declarations. **Owner merge approves the version.** Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting.

## Documentation

| Need | Start here |
| --- | --- |
| Add, port or update a module | [Add or port a module](docs/ADD_A_MODULE.md) |
| SDK layout and native verifiers | [SDK README](sdk/README.md) |
| Native module declarations | [Writing modules](sdk/octabam/docs/remixer/MODULES.md) |
| Memory and compatibility | [Placement](sdk/octabam/docs/remixer/PLACEMENT.md) |
| Metadata and version rules | [Module contract](docs/MODULE_REPOSITORIES.md) |
| Testing and evidence | [Native testing](sdk/octabam/docs/remixer/TESTING.md) · [Verification status](docs/VERIFICATION.md) |
| Web app and deployment | [App development](docs/APP_DEVELOPMENT.md) · [Architecture decisions](docs/DECISIONS.md) |
| Every other document | [Documentation index](docs/README.md) |

Built on [octabam](https://github.com/sambanks/octabam), with its [MIT licence](sdk/octabam/LICENSE), [component credits](sdk/octabam/THIRD_PARTY.md) and [pinned provenance](sdk/UPSTREAM.json) retained. Firmware-dependent work uses your own original OS 1.40C locally; never commit or upload firmware, extracted routines/tables or generated firmware images.
