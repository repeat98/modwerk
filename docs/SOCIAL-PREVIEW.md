# Social sharing preview

## Other projects directory

`/projects/` has its own original Modwerk sharing artwork at
`public/projects-social-preview-v1.jpg`: a 1200 × 630 JPEG showing “Other
projects”, “Beyond the builder” and four conceptual drawings for mods, tools,
emulators and developer tools. It uses the existing Modwerk mark. These drawings are
only the directory's promotional artwork; project cards use the projects' own
GitHub repository previews and retain their authorship.

The editable source is [social-preview/projects.svg](social-preview/projects.svg).
Re-export under Node 24 with `node scripts/render-projects-preview.mjs`.
The renderer inserts the current mark and uses the existing Sharp dependency.
The static directory page sets both Open Graph and Twitter metadata to this
image, with its own canonical URL and alt text. Client navigation uses the same
image; other pages retain their existing cards. Change the versioned filename
and `PROJECT_PREVIEW_IMAGE` when replacing published artwork to avoid stale
sharing-service caches.

## Original Octamod artwork

The static page metadata in `index.html` references `public/social-preview.jpg` at
`https://modwerk.app/social-preview.jpg`. The production build copies this image
to `dist/social-preview.jpg`. Open Graph and Twitter cards can read the metadata
without running the app.

The image is a 1200 × 630 JPEG. It is original AI-generated artwork, created on 1 October 2026.
It uses Octamod's existing palette and eight-tile brand mark. The signal panels
are original generated illustrations; they are not hardware screenshots or
performance evidence. No firmware or third-party photograph was used.

If the public site moves, update the absolute URL and image URLs in
`index.html` along with the domain printed on the artwork. When replacing the
artwork, use a new image filename and update both metadata references so sharing
services can fetch the new asset.

## Modwerk launch artwork

`public/modwerk-social-preview-v2.jpg` is the prepared homepage link preview for the
Modwerk rebrand: 1200 × 630, progressive sRGB JPEG, quality 95, 4:4:4. The Modwerk
lockup and “Mods for Elektron instruments.” sit above four branches connecting the
Mod library, Firmware builder, Community forum and Developer SDK to the central
Modwerk mark. Large two-line feature labels and distinct vector drawings replace
the sequencer keys and machine silhouettes. The feature labels are 41 pixels tall
in the source and were visually checked at 600 × 315 and 400 × 210.

Module covers with signal drawings represent the library, selected tiles combining
into one package represent the builder, speech bubbles represent the forum, and
code brackets represent the SDK. These are original explanatory illustrations,
not interface captures, qualification evidence or a claim of mod availability for
every instrument. The artwork states that Modwerk is independent and not
affiliated with Elektron.

### Mark

`public/modwerk-mark.svg` (dark backgrounds) and `public/modwerk-mark-on-light.svg`
(light backgrounds) are the Modwerk mark: eight tiles centred in a frame that opens
at one corner, where an apricot ninth tile, the mod, slides in. The artwork embeds
`modwerk-mark.svg` as-is twice: to the left of the wordmark and at the branch
junction. The mark files are unchanged from the supplied redesign branch. A change
to the mark changes the preview on its next export. `public/favicon.svg` is still
the Octamod mark; switching it belongs to the rebrand.

### Source and export

The source is the vector drawing [`social-preview/modwerk-v2.html`](social-preview/modwerk-v2.html).
It uses Archivo and JetBrains Mono (SIL Open Font License 1.1), pinned
`@fontsource-variable` 5.3.0 builds, and the mark file; no photographs, firmware or
generated images go into it. To re-export:

```sh
npm install --no-save playwright@1.56.1 @fontsource-variable/archivo@5.3.0 @fontsource-variable/jetbrains-mono@5.3.0
npx playwright install chromium
node scripts/render-social-preview.mjs --previews /tmp/modwerk-previews
```

The script renders at 2× in Chromium, downsamples with Sharp, refuses a render whose
fonts or mark did not load, and prints the export's SHA-256. The committed export is
95,982 bytes, SHA-256 `b01a07077dd5d508b4b695961d3a657420998e2e322b70f50a0928fa0b58663e`
(Playwright 1.56.1 Chromium on macOS; other platforms may differ by antialiasing).

Activate it with the rebrand, not before: set `og:image` and `twitter:image` to
`https://modwerk.app/modwerk-social-preview-v2.jpg`, keep the 1200 × 630 dimensions
and `image/jpeg` type, and use this alt text for both cards:

> Modwerk. Mods for Elektron instruments. Four branches connect the mod library,
> firmware builder, community forum and developer SDK to the Modwerk mark.

### Earlier Three.js concept

`public/modwerk-social-preview-v1.jpg` is the prepared homepage link preview for
the coordinated Modwerk rebrand. It is a 1200 × 630 progressive sRGB JPEG, with
a new filename to avoid reusing the cached Octamod preview URL. The production
build copies it to `dist/modwerk-social-preview-v1.jpg`.

The copy is “Mods for Elektron machines.” Four physical feature branches show
the mod library, firmware builder, forum and developer SDK, connected to a
central eight-pad Modwerk hub. The image uses the existing eight-tile brand
mark, charcoal background and periwinkle accent, with mint and apricot details.
Large horizontal action labels say “Discover mods”, “Build firmware”, “Join
the forum” and “Developer SDK”; smaller labels identify the library, local
builder, community and tools/documentation. The typography stays horizontal independently of
the 3D camera, with enlarged signal, download and code symbols. The image was
visually checked at 1200 × 630, 600 × 315 and 400 × 210.

The artwork is a custom Three.js scene rendered on 4 October 2026, with original
geometry, procedural display textures and exact HTML typography. The four bays
contain removable signal modules, a processor board, solid conversation forms
and an SDK socket. The fixed camera, geometry, lighting and colors are in
[`social-preview/modwerk-v1.html`](social-preview/modwerk-v1.html); the version
pin, source/export hashes, encoding settings and review notes are in
[`social-preview/modwerk-v1.json`](social-preview/modwerk-v1.json). The final
asset contains no ImageGen artwork, external textures or photographs. These
conceptual illustrations are not hardware captures, qualification evidence or
a promise that every machine has working downloads. No firmware or user files
are read.

The source imports Three.js 0.180.0 from its pinned CDN URL. To inspect or
re-export it, serve the repository root with a local static server and open
`/docs/social-preview/modwerk-v1.html`. Wait for the scene to appear, then
capture the fixed canvas at `(0, 0, 1200, 630)`. It renders at pixel ratio 2;
the captured JPEG was exported with Sharp at quality 95, progressive sRGB,
4:4:4 chroma sampling. Three.js is used only in the artwork source and is not
added to the application bundle or npm dependencies. Its full MIT licence is
preserved in [`social-preview/THREE-LICENSE.txt`](social-preview/THREE-LICENSE.txt).

For an offline source preview, install the pinned Three.js package in a
temporary directory, link its `build/` folder as `docs/social-preview/.three`,
and open the source with `?local`. The local library link is temporary and must
not be committed.

Homepage metadata activation belongs to the combined rebrand. At that launch,
set both `og:image` and `twitter:image` to
`https://modwerk.app/modwerk-social-preview-v1.jpg`, retain the 1200 × 630 image
dimensions and `image/jpeg` MIME type, and synchronize the site name, title,
description and canonical URL with Modwerk. Use this alt text for both cards:

> Modwerk — Mods for Elektron machines. Four branches connect the mod library,
> firmware builder, community forum and developer SDK to a central Modwerk hub.

The current Octamod metadata remains tied to its current launch. Module links
continue using their individual module thumbnails.

## Module links

Share module URLs such as `https://modwerk.app/module/analog-bassdrum/`. Each
production build generates `dist/module/<id>/index.html` with the module's name,
description, canonical URL, and Open Graph/Twitter image metadata. These are
ordinary static pages served by GitHub Pages and the Cloudflare Pages fallback;
sharing services do not need to execute JavaScript or contact the community API.

`scripts/module-pages.ts` rasterizes the existing `ModulePreview` artwork with
its palette and signal styles from `src/styles.css` into 1200 × 630 JPEGs under
`dist/module-thumbnails/`. Image filenames include a content hash so a changed
thumbnail gets a new URL. These original illustrations are not OT UI captures
or qualification evidence. No module sources, firmware or user files are read
by the thumbnail generator.

Library, configuration, comparison and module-set links use the shareable paths.
The app supports these paths, preserves navigation without reloading the running
workspace, and rewrites legacy `/#module/<id>` links to the corresponding path
when opened in a browser. Old hash links still open the correct module, but
sharing services cannot receive the part after `#`, so existing posts using
those links retain the generic homepage preview. Use the new URL when sharing.

Nested module pages set their document base to the app root so bundles, licensed
media and other public assets also work after direct navigation or reload. The
router resolves that base once before client-side navigation, including when
the build is hosted under a Pages project path.

## Modwerk integration

The app logo and favicon use `public/modwerk-mark.svg`. The homepage Open Graph
and Twitter cards use `https://modwerk.app/modwerk-social-preview-v2.jpg`, a
1200 × 630 JPEG showing the mod library, firmware builder, community forum and
developer SDK. Both assets are the unchanged redesign from
[PR #76](https://github.com/repeat98/octamod/pull/76), commit
`0dad6c08a09e1c763418352ded7734609a2d265a`. Its source artwork and rendering
workflow remain in that PR. The older Octamod image is retained as a legacy asset.

Module links keep their own module thumbnail and inherit the Modwerk site name
and public origin from `index.html`. The versioned homepage image URL avoids
reusing the old sharing cache key. Local previews verify the metadata and image;
the public card changes after these files are deployed.

## Per-page cards

Module pages, forum thread pages and the Start developing page carry their own
`og:image`. Modules use their artwork (`module-thumbnails/`). A forum thread uses
its first picture when it has one; otherwise the build draws a 1200 × 630 card
(`forum-thumbnails/`) with the topic, the title (up to three lines), the author and
the reply count over the Modwerk mark. The Start developing page is served at
`submit/` with its own card (`page-thumbnails/`). Cards are rendered with Sharp at
build time by `scripts/social-cards.ts`, so a thread's card updates on the next
deploy.

To give another page a card, add it to `SITE_PAGES` in `scripts/site-pages.ts` and
make its path a route in `src/routing.ts`. Pages that are only hash routes (builder,
forum index, SDK) cannot have their own card, because crawlers ignore the part of
the URL after `#`; they show the site card.
