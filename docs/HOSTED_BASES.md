# Hosted base images

Modwerk serves prebuilt base images for the machines whose maker agreed to it, so a musician can install the base
without their own OS file. Everything else is unchanged: module sets on a machine whose modules link into the OS image
still build in the browser from the musician's own file, the own-file route stays open on every machine, and other
makers' devices (Zoom and the rest) build only from the musician's own file in the browser. The owner keeps the maker's
agreement privately; it is not recorded in the repository.

| What | Where |
| --- | --- |
| Machines | Every Elektron machine with a Modwerk base (`sdk/machines/*/base-binding.json`). Octatrack, Digitakt II, Analog Rytm MKII (the plain variant, which a set without modules builds on) and Model:Cycles. On the last three the hosted image is the page's build with no modules, in its default display version |
| Images | The base alone, one image per published base identity (the Octatrack's step bases included). No module sets |
| Built | Only on the owner's computer, from the owner's own OS file, with the same builder the site uses: `npm run base:publish` |
| Stored | The private R2 bucket `modwerk-base-images` (binding `BASES`), never in Git, GitHub Actions or the site's assets |
| Served | `GET /api/bases` (the manifest: machine, identity, layout, SHA-256, size; public) and `GET /api/bases/<machine>/<identity>` (the image; verified members), `server/base-images.ts` |
| Checked | The site (`src/config/hosted-bases.ts`) refuses an image whose identity is not the published one for its layout or whose bytes differ from the manifest; the Octatrack's IDENTIFY then confirms the identity on the unit |
| Site | The Octatrack install guide offers the hosted base while no OS file is chosen, and keeps "Use my own OS 1.40C file". The other machines' build panel (`DigiBuildPanel`) offers it for a selection with no modules while no OS file is chosen, where downloads are open for the machine; a selection with modules still builds from the musician's own file |

## Publish

```sh
npm run base:publish -- --stock /path/to/OCTATRACK_OS1.40C.bin
npm run base:publish -- --machine digitakt-ii --stock /path/to/Digitakt_II_OS1.17.syx   # also analog-rytm-mkii, model-cycles
```

It builds every image the site asks for (the base and its step base, both with USB Audio off while USB Audio is a module) with the browser's own path
(`published-base.ts`), checks each identity against the committed pins, and uploads image and manifest entry with the
owner's `wrangler` login (`--dry-run` builds and checks without uploading). Create the bucket once with
`npx wrangler r2 bucket create modwerk-base-images`. Run it after a base release is live, from a checkout of the deployed revision. An image
already in the bucket with the same identity and SHA-256 is skipped; the same identity with another SHA-256 stops it. Contributors never run it and CI has no access to
the bucket.

After every base release (the Octatrack's 0.8.4, repeat98/modwerk#2333, is the next), run it again: the guide offers
only the base this deploy publishes, so until the new images are up it falls back to the musician's own file. The
step is in [Ship a base](OWNER_OPERATIONS.md#ship-a-base).

## Rules this changes

The rule "firmware never enters Git or CI" holds as before. The one exception is these base images, built and uploaded
by the owner, for makers who agreed. `MODDING_GUIDELINES.md`, `AGENTS.md`, `sdk/machines/AGENTS.md` and the
[machine recipe](MACHINE_RECIPE.md) say so; the stock-free scanners and CI gates are unchanged, because nothing stock
enters the checkout.
