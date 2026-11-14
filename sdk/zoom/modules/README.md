# Zoom MultiStomp effects

One folder per effect (`<id>/`), on module contract v3 with the `zdl` platform: [docs/ZDL_MODULE_CONTRACT.md](../../../docs/ZDL_MODULE_CONTRACT.md). The folder holds no `.ZDL`: `platform.binary` pins the author's release file by SHA-256, and `npm run zdl:vendor` downloads it into `public/zoom-effects/` only when it carries no code from Zoom's effects.
