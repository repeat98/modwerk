# Hosted base images

Modwerk serves prebuilt base images for the machines whose maker agreed to it, so a musician can install the base
without their own OS file. Everything else is unchanged: module sets on a machine whose modules link into the OS image
still build in the browser from the musician's own file, the own-file route stays open on every machine, and other
makers' devices (Zoom and the rest) build only from the owner's own file in the browser. The owner keeps the maker's
agreement privately; it is not recorded in the repository.

| What | Where |
| --- | --- |
| Machines | Every Elektron machine with a Modwerk base (`sdk/machines/*/base-binding.json`): Octatrack, Digitakt II, Analog Rytm MKII (each variant), Model:Cycles |
| Images | The base alone, one image per published base identity (the Octatrack's step bases included). No module sets |
| Built | Only on the owner's computer, from the owner's own OS file, with the same builder the site uses: `npm run base:publish` |
| Stored | The private R2 bucket `modwerk-base-images` (binding `BASES`), never in Git, GitHub Actions or the site's assets |
| Served | `GET /api/bases` (the manifest: machine, identity, SHA-256, size) and `GET /api/bases/<machine>/<identity>` (the image) |
| Checked | The site refuses an image whose identity is not the published one for its layout or whose SHA-256 differs from the manifest; the Octatrack's IDENTIFY then confirms the identity on the unit |

## Publish

```sh
npm run base:publish -- --stock /path/to/OCTATRACK_OS1.40C.bin
```

It builds every image the deployed revision publishes for that machine from the stock file, checks each identity
against the committed pins, and uploads image and manifest entry with the owner's `wrangler` login (`--dry-run` builds
and checks without uploading). Run it after a base release is live, from a checkout of the deployed revision. An image
already in the bucket with the same identity and SHA-256 is skipped. Contributors never run it and CI has no access to
the bucket.

## Rules this changes

The rule "firmware never enters Git or CI" holds as before. The one exception is these base images, built and uploaded
by the owner, for makers who agreed. `MODDING_GUIDELINES.md`, `AGENTS.md`, `sdk/machines/AGENTS.md` and the
[machine recipe](MACHINE_RECIPE.md) say so; the stock-free scanners and CI gates are unchanged, because nothing stock
enters the checkout.
