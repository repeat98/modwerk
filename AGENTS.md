# Working in this repository

Modwerk builds custom firmware modules for Elektron instruments. This repository holds the module SDKs (`sdk/`), a React and Vite site (`src/`) and a Cloudflare Worker API (`server/`, `worker.ts`).

- Use Node 24 (`.nvmrc`), then `npm ci`.
- `npm run check` runs everything CI checks on the app, in about 15 seconds. Run it before every commit.
- To add, port or update a module, follow [docs/ADD_A_MODULE.md](docs/ADD_A_MODULE.md).
- Before you write a module, read [docs/module-guides/README.md](docs/module-guides/README.md) and the guide for its category (effects, machines, playback, scenes, midi-usb, system, standalone). Anything that acts in time follows [sequencing.md](docs/module-guides/sequencing.md): use the instrument's own tempo, track speed and swing, never a clock of your own. Run `npm run module:doctor -- <id>` until it is green.
- Before writing or changing Octatrack DSP or ColdFire code, read the traps in [sdk/octabam/AGENTS.md](sdk/octabam/AGENTS.md). That is octabam's own file, kept unchanged because its code cites it. Its `make` commands describe upstream octabam, not this repository; build and check with the commands in the guide.
- For app and backend work, see [docs/APP_DEVELOPMENT.md](docs/APP_DEVELOPMENT.md).
- Never commit firmware, extracted stock code or tables, memory dumps or built images. Firmware stays on the developer's computer and never enters CI.
- Do not edit generated files by hand: `src/catalog/module-documents.json`, the licence notices and the machine registry. `npm run modules:generate`, `licenses:generate` and `machines:generate` write them.
- Work on a branch off current `main` and open a pull request; the owner merges. Keep unrelated changes out of the diff.
