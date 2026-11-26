# Place `tests.qualification` (MOP-257 — mop256 recipe §G)

Jon-authorized **owner review (G)** after mop256 stop. Combined with
catalog pin auth on the same tip. **No** Accept invent. **No** Proven
invent beyond cited Keep mop253/254, measured **624** mop255, and
authored `.bss` **24**.

Cite recipe A–G in
[`qualification-fill-recipe-mop213-2026-11-25.md`](qualification-fill-recipe-mop213-2026-11-25.md)
and
[`qualification-gate-mop256-2026-11-25.md`](qualification-gate-mop256-2026-11-25.md).

## A–G (this place)

| Step | Result |
| --- | --- |
| A Preconditions | Ready — `TESTING.md` + evidence; static/measured **624** + load/stress; hardware PNGs in `media/` |
| B Identity | **Filled** — `sourceSha256` `a7b2f589…`; `imageSha256` = Keep tip package `643b46c3…` (mop205/253 Proven; QLR/USB-package binding); `evidenceRevision` = tip git SHA `2423e32b3…` (post-mop256) |
| C ColdFire cycles | **Filled** — worstCase/maxConfiguration **624**; method emulator → [`performance.json`](performance.json) |
| Budget | **Owner-reviewed** — **4790** = 10% of 362.8 µs frame @ 132 MHz (peer cite). Measured **624** < **4790** |
| D Memory | **Filled from Proven named sizes** — authored `.bss` **24** B sharedBytes. Package file **724** B cited as Keep digest size only — **not** tip-wired as linked-image flash |
| E Hardware functional | **Filled** — `kind: "functional"` / `status: "reported"` citing mop205–254 USB digs + mop255 emulator stress/load |
| F Docs / screenshots | Paths in-repo (`media/ot-setup-pmtr-tempo.png`, `ot-pmtr-tempo.png`, `ot-lfo-page-tempo.png`) |
| G Place + owner review | **Placed** — Jon AUTHORIZES owner-review (G). Object in `octamod.module.json` |

## Cross links

- Gate (prior stop): [`qualification-gate-mop256-2026-11-25.md`](qualification-gate-mop256-2026-11-25.md)
- Pin: [`catalog-pin-mop257-2026-11-25.md`](catalog-pin-mop257-2026-11-25.md)
- Measured: [`otemu-cycles-mop255-2026-11-25.md`](otemu-cycles-mop255-2026-11-25.md)
- Keep: [`usb-hw-mop253-keep-2026-11-25.md`](usb-hw-mop253-keep-2026-11-25.md)
