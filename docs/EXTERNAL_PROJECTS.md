# External project curation

The Other projects directory is Modwerk's own selection of ways to extend an
Elektron setup outside its module builder. It is not a synchronized copy of
another catalogue, a popularity ranking or a compatibility certification.

Choose entries with a distinct purpose and a public source explaining what
they do and how to use or build them. Favor useful workflows across sample
preparation, project management, performance, emulation and tool development.
Explain prerequisites and early-development status in the summary. Avoid
padding the list with duplicate platform wrappers or projects already offered
as individual Modwerk modules. Collections can be included when their wider
scope and existing Modwerk ports are explained.

Elektronmods provided initial discoveries. The list was independently expanded
from upstream documentation on 9 October 2026; descriptions, categories, workflow
starting points and artwork for the directory itself were written for Modwerk.
Project thumbnails are their own GitHub Open Graph previews, cached with source
URLs and hashes in `src/projects/thumbnails.json`.

## Independently discovered additions

| Project and primary source | Why it belongs | Scope to preserve |
| --- | --- | --- |
| [DigiChain](https://github.com/brian3kb/digichain) | Browser sample preparation and chain export | Format conversion and Octatrack slice information; also supports other samplers |
| [Elektroid](https://github.com/dagargo/elektroid) | Desktop and CLI device management | Transfer features differ by instrument; consult its device filesystem support |
| [Octatrack Manager](https://github.com/davidferlay/octatrack-manager) | Visual project inspection and editing | In active development; projects require OS 1.40 or later |
| [Octobus Additions](https://github.com/designerfuzzi/OctobusAdditions) | Touch control for performances | Requires TouchOSC; MIDI feedback and channel limitations are documented |
| [OctaChainer 2](https://github.com/KaiDrange/OctaChainer2) | Sample chains from an app or VST3 workflow | In development; the original OctaChainer repository points to this successor |
| [octapy](https://github.com/jhw/octapy) | Programmatic Octatrack project creation and editing | Some formats are outside its scope, including arrangements |
| [rytm-rs](https://github.com/alisomay/rytm-rs) | High-level Rust building blocks for custom Rytm tools | Reverse-engineered SysEx support, documented upstream |
| [libanalogrytm](https://github.com/bsp2/libanalogrytm) | Portable C protocol building blocks | No editor UI or MIDI transport; distinct from rytm-rs's higher-level API |

During review, the original OctaChainer repository was found to be superseded
and elk-herd's GitHub default branch was found to have migrated. Do not silently
link an abandoned or migrated repository as the current download destination.
Additional candidates can be added after checking their current primary source.

Keep current version numbers and installation details upstream. A GitHub preview
may be a custom cover or a generated repository card; neither is hardware-test
evidence. Refresh previews only with the maintenance command in
[app development](APP_DEVELOPMENT.md#external-project-directory). The email
submission button prepares a draft in the visitor's mail app; it sends nothing
from the site.
