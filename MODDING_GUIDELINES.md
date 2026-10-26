# Modding guidelines

Modwerk is here because people want more from instruments they love. Modding should be good for them and for the companies that make those instruments: instruments stay useful for longer, and there are more reasons to buy them. These guidelines apply to every module, machine port and piece of research on Modwerk, and to what is shared about them on the site, on Discord and on GitHub.

Where a maker publishes its own terms for modding its instruments, those come first.

## Never share firmware

- Never upload, post, send or link a maker's firmware. That means OS, update and SysEx files, code or tables taken from them, memory dumps, disassembly listings and built images that contain any of these. It includes leaked or decrypted firmware that someone else has published.
- Everyone works from their own official download. Modwerk builds firmware on the user's own computer from the OS file they supply, and refers to stock code only by address, length and checksum.
- Share hashes, file layouts, addresses, notes and your own code instead.

## Respect the makers

- **Don't break protection.** Where a maker encrypts or signs its firmware, Modwerk does not decrypt it, re-sign it or work around the check. Such an instrument gets mods here only with its maker's agreement.
- **Don't unlock what the maker sells.** No mod switches on a feature the maker sells separately or keeps for another model, or gets around a licence, activation or region check.
- **Don't cross-port.** Code, tables and sounds from one instrument's firmware never go into another instrument, even between models from the same maker. Your own take on a technique is fine; a recognisable clone of another of the maker's current products is not.
- **Don't pass as official.** A modified build shows that it is modified wherever the instrument allows, for example on its start-up screen. Makers' names appear only to say what something works with ("modules for the Elektron Octatrack"), never as the name of a module or a build. Modwerk is independent: it is not affiliated with, endorsed by or supported by any maker.

## Keep a way back

- An instrument gets public downloads only once its official OS restores it, with the steps written down.
- A mod never touches the maker's own recovery route: the bootloader, the start-up menu or the official updater.
- Modwerk and module authors support mods, not the maker. Go back to the official OS before contacting the maker's support, and tell them you ran modified firmware.

## Respect other people's work

- Share only original or properly licensed code, samples and artwork: no factory samples or recordings, and no code, artwork or trademarked names from other products.
- Port someone's module only with their permission or under a licence that allows it. Keep their credit and licence, and pin the exact source.
- Ask the author before changing a module someone else wrote.
- Other modding projects have their own rules and catalogues. Credit them, and follow their rules in their spaces.
- Ideas, techniques and published algorithms are free to use.

## Talking with makers

- Before an instrument from a new maker gets its first public download, Modwerk tells that maker.
- If a maker asks for something to be changed or taken down, it is paused while we talk it through.
- Makers and rights holders can write to [support@modwerk.app](mailto:support@modwerk.app).

Work that breaks these guidelines is refused or taken down. The [code of conduct](https://github.com/repeat98/modwerk/blob/main/CODE_OF_CONDUCT.md) and the [community rules](https://modwerk.app/#community-rules) apply too. The steps behind each rule are in the [developer workflow](https://github.com/repeat98/modwerk/blob/main/docs/DEVELOPER_WORKFLOW.md), [Add a module](https://github.com/repeat98/modwerk/blob/main/docs/ADD_A_MODULE.md) and [Add a machine](https://github.com/repeat98/modwerk/blob/main/docs/ADD_A_MACHINE.md).
