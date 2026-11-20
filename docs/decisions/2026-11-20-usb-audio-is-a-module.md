# Octatrack USB Audio installs like any other module — 20 November 2026

- **USB Audio leaves the base and becomes a module package.** The owner: "We should make USB audio install like any other module". It is added to a set, synced over USB, tried, kept, undone, updated and removed like every other module, without a base install. This replaces the 21 October arrangement (#756), where each output layout is its own published base; the base goes back to one identity.
- **One module; its output layout is chosen on the site.** Changing the layout replaces the package and the unit reconnects on USB, as it does when the module is added or removed.
- **The switch on the Octatrack belongs to the module.** ALL CHANNELS, MAIN + CUE ONLY and OFF (issue #1512, tried in #1517) change no descriptor; the module offers them as its setting under one base row, PROJ > MODWERK > SETTINGS, which every module with a setting shares, and the base keeps the choice through a power cycle.
- **Tracks Post takes a computed gain curve**: the quarter sine the stock table is checked against, since a package carries no stock data.
- **It counts toward the module limit** (`src/catalog/set-limit.ts`), like every other module.
- **Order of work:** the base's USB function slot and reconnect first, proved on a development twin and then on a unit; the module package next; the site's special cases last. The design and its open points are in [OCTATRACK_USB_AUDIO_MODULE.md](../OCTATRACK_USB_AUDIO_MODULE.md).
