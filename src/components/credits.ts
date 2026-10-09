export type Credit = {
  name: string
  author: string
  description: string
  links: readonly { label: string; href: string }[]
}

type CreditSection = {
  id: string
  title: string
  description: string
  projects: readonly Credit[]
}

const repo = (path: string) => ({ label: path, href: 'https://github.com/' + path })

// Contributions in the pinned Octabam source for USB Audio 0.2.
const usbSource = (path: string) => ({ label: 'Octabam source & credits', href: 'https://github.com/sambanks/octabam/blob/7b2984c859732ae6c797ae49c7d61d250b1b6519/' + path })
export const USB_AUDIO_MIDI_CREDITS: readonly Credit[] = [
  {
    name: 'USB Audio & MIDI · octemu', author: 'Mark Roberts (@markandrus)',
    description: 'The original USB MIDI and USB audio implementation, including descriptors, audio production, packet building and rate control, on which Octabam’s shared USB stack is based.',
    links: [repo('markandrus/octemu'), usbSource('modules/usb-audio-out-tracks-main-cue/README.md')],
  },
  {
    name: 'USB Audio · MAIN / CUE', author: 'Bryan Tysinger (@bryantysinger)',
    description: 'MAIN/CUE channel layouts, stream latency and alignment work, including CUE alignment with a master track, plus hardware measurements of the shared USB audio stack.',
    links: [repo('bryantysinger'), usbSource('modules/usb-audio-out-tracks-main-cue/README.md')],
  },
  {
    name: 'USB Audio & MIDI · Octabam integration', author: 'Sam Banks (@sambanks)',
    description: 'The Octabam port and output layouts, USB MIDI receive FIFO and clock timestamp fixes, and shared audio/MIDI interrupt, bus reset and session-end handling.',
    links: [repo('sambanks/octabam'), usbSource('modules/usb-midi/README.md')],
  },
  {
    name: 'USB Audio · Outbox 8 & post-fader stems', author: 'allmyfriendsaresynths (@clickysteve)',
    description: 'The fixed 44.1 kHz clock SET_CUR handshake that enables Outbox 8 compatibility, and the post-fader track layout that follows LEVEL, mute, solo and the crossfader, with upstream hardware measurements.',
    links: [repo('clickysteve'), usbSource('modules/usb-audio-out-tracks-post/README.md'), { label: 'Outbox 8 fix', href: 'https://github.com/sambanks/octabam/pull/597' }],
  },
]

// Attribution follows sdk/octabam/THIRD_PARTY.md, the retained licence manifest,
// sdk/imports/, vendor/elekloader/kit/NOTICE and each module's author/source record.
// Describe the retained contribution, rather than implying every linked project
// is bundled with the website. Source revisions remain in those provenance files.
export const DSP56300_CREDIT: Credit = {
  name: 'The Usual Suspects · DSP56300',
  author: 'The Usual Suspects (TUS) and the DSP56300 contributors',
  description: 'The DSP56300 emulator makes it possible to run the Octatrack’s DSP code in software. It underpins the native DSP development and verification tools used by the Octatrack SDK, and the DSP emulation in octemu. This work is where our thanks begin.',
  links: [repo('dsp56300/dsp56300'), { label: 'The Usual Suspects', href: 'https://theusualsuspects.io/' }],
}

export const CREDIT_SECTIONS: readonly CreditSection[] = [
  {
    id: 'foundations',
    title: 'Firmware foundations',
    description: 'The research, formats and infrastructure that opened the way to custom firmware.',
    projects: [
      {
        name: 'octamax', author: 'Maxolydian (@mxldyn)',
        description: 'Early Octatrack firmware research and analysis tooling, portions of which are retained in octabam’s tools.',
        links: [repo('mxldyn/octamax')],
      },
      {
        name: 'octabam', author: 'Sam Banks (@sambanks) and contributors',
        description: 'The Octatrack SDK, firmware composition, module infrastructure and native harness on which Modwerk’s Octatrack work is built. Sam also authored Spectrum, Modulation, Character, CC Map and Recorder Loop Fix.',
        links: [repo('sambanks/octabam')],
      },
      {
        name: 'elektron-firmware-tool', author: 'Marcel Bierling (@mischa85)',
        description: 'Elektron firmware container, compression and SysEx tooling. Its format research and implementation inform the local firmware packaging tools.',
        links: [repo('mischa85/elektron-firmware-tool')],
      },
      {
        name: 'octemu', author: 'Mark Roberts (@markandrus)',
        description: 'Octatrack emulation, USB MIDI and USB audio implementations, and front-panel artwork used by the SDK and its upstream tools.',
        links: [repo('markandrus/octemu')],
      },
      {
        name: 'octa-panel', author: 'Tim Hastie (@timhastie)',
        description: 'The virtual Octatrack panel and emulator improvements, including interactive execution, timing, card write-back and audio taps, retained through octabam.',
        links: [repo('timhastie/octa-panel')],
      },
      {
        name: 'elekloader', author: 'irpina and contributors',
        description: 'The vendored TypeScript kit for local Digitakt and Digitone firmware builds, shared cores and elemod format. Its public ABI and adaptation guides also inform Modwerk’s core research.',
        links: [repo('irpina/elekloader')],
      },
      {
        name: 'digikit', author: 'Em D (@m-dwyer) and contributors',
        description: 'Elektron firmware research, memory maps and tools. Its codecs and transport encoders are credited in the elekloader builder used here.',
        links: [repo('m-dwyer/digikit')],
      },
    ],
  },
  {
    id: 'modules',
    title: 'Module authors & contributors',
    description: 'The people who turn that foundation into new ways to make music.',
    projects: [
      {
        name: 'MIDI Scenes', author: 'bkkbrls-del',
        description: 'The original MIDISC firmware work and MIDISC2.0 release behind MIDI Scenes. Sam Banks contributed the earlier relocatable octabam port.',
        links: [repo('bkkbrls-del/midisc')],
      },
      {
        name: 'Em’s Octakit', author: 'June Kiff (@emuyia)',
        description: 'Octakit and its DRAM loader. The loader in the Octatrack composition tools is derived from June’s implementation.',
        links: [repo('emuyia/ems-octakit')],
      },
      {
        name: 'Scale Quantizer & FM Synth', author: 'Tim Hastie (@timhastie)',
        description: 'The original Scale Quantizer and two-operator FM engine in octatrick-modules, integrated into the SDK through Sam Banks’s octabam wrappers.',
        links: [repo('timhastie/octatrick-modules')],
      },
      {
        name: 'TapeHead', author: 'devilfish707 and JClones',
        description: 'devilfish707’s DSP56300 port, module, reference tests and documentation, based on JClones’ TapeHead JSFX algorithm.',
        links: [repo('devilfish707/octamod'), repo('JClones/JSFXClones')],
      },
      {
        name: 'Sidechain Compressor & Mute Modes', author: 'Zac Kyoti (@Zac-Kyoti) and contributors',
        description: 'The original Sidechain Compressor ColdFire/DSP source and coefficient generator, plus the Mute Modes runtime and PERSONALIZE menu from OT Kyoti FW, with octabam integration by Sam Banks.',
        links: [repo('Zac-Kyoti/octatrack-kyoti-fw')],
      },
      {
        name: 'Recorder Loop Fix', author: 'Sam Banks (@sambanks) and Bryan Tysinger (@bryantysinger)',
        description: 'Sam authored the recorder patches and source oracles. Bryan identified the issue early, documented it extensively, developed test cases and tested recorder looping over more than a year.',
        links: [repo('sambanks/octabam'), repo('bryantysinger')],
      },
      ...USB_AUDIO_MIDI_CREDITS,
      {
        name: 'Play Modes', author: 'devilfish707',
        description: 'The Octaplay engine, firmware integration, investigation and documentation behind the Octatrack Play Modes module.',
        links: [repo('devilfish707/Octaplay')],
      },
      {
        name: 'digi1_mods', author: 'gdeo607 and contributors',
        description: 'Digi EQ, Digi Mono, Digi Poly, Digi Matrix, Digi utilities and digichain: the original Digitakt engines, tools and module implementations.',
        links: [repo('gdeo607/digi1_mods')],
      },
      {
        name: 'Digislicer', author: 'irpina',
        description: 'The Digitakt slicing module, with its original source and documentation preserved in the machine SDK.',
        links: [repo('irpina/digislicer')],
      },
      {
        name: 'Digineighbor', author: 'irpina',
        description: 'The Digitakt neighbor-processing module, with its original source and documentation preserved in the machine SDK.',
        links: [repo('irpina/digineighbor')],
      },
      {
        name: 'Digihealth', author: 'irpina',
        description: 'System information and diagnostic modules for Digitakt and Digitone, including the Digitakt FAST AUDIO work.',
        links: [repo('irpina/digihealth')],
      },
      {
        name: 'digitables', author: 'irpina',
        description: 'The Digitone module for custom pitch tables, with its original implementation and attribution retained in the machine SDK.',
        links: [repo('irpina/digitables')],
      },
      {
        name: 'Digisophie', author: 'Sjoerd (@soejrd)',
        description: 'The Sophie metallic-percussion algorithm adapted for the Digitakt, with its original source, documentation and component credits retained.',
        links: [repo('soejrd/digisophie')],
      },
      {
        name: 'Sophie for Schwung', author: 'Matt Estela (@mestela)',
        description: 'The original metallic-percussion algorithm behind Digisophie’s fixed-point port.',
        links: [repo('mestela/schwung-sophie')],
      },
      {
        name: 'Modwerk & Octatrack modules', author: 'Jannik Aßfalg (@repeat98) and Modwerk contributors',
        description: 'The browser configurator, local build integration and community, plus Mini Verb, Tape Echo, Euclid, Repitch, VECTOR and the original Analog BD engines. The octamad fork records earlier Octatrack integration work.',
        links: [repo('repeat98/modwerk'), repo('repeat98/octamad')],
      },
    ],
  },
  {
    id: 'dsp',
    title: 'DSP algorithms & research',
    description: 'Open audio code and published research behind the effects, with their original attribution retained.',
    projects: [
      {
        name: 'Hera Chorus', author: 'J.P. Cimalando (@jpcima)',
        description: 'The Hera chorus implementation in rc-effect-playground, transcribed into Modulation’s JUNO mode.',
        links: [repo('jpcima/rc-effect-playground')],
      },
      {
        name: 'ChowPhaser', author: 'Jatin Chowdhury (@jatinchowdhury18)',
        description: 'The Schulte Compact Phasing A model behind Modulation’s PHSR mode.',
        links: [repo('jatinchowdhury18/ChowPhaser')],
      },
      {
        name: 'Mutable Instruments Rings', author: 'Emilie Gillet (@pichenettes)',
        description: 'Rings’ string model, used in Modulation’s COMB mode.',
        links: [repo('pichenettes/eurorack')],
      },
      {
        name: 'JSFXClones', author: 'JClones',
        description: 'TapeHead, DaTube, OInflator and AC1 algorithms behind Character’s saturation, compression and glue modes, and the TapeHead port.',
        links: [repo('JClones/JSFXClones')],
      },
      {
        name: 'audiojs/filter', author: 'Dmitry Iv',
        description: 'The Moog ladder and Oberheim filter implementations behind Spectrum’s filters, using Vadim Zavalishin’s zero-delay forms.',
        links: [repo('audiojs/filter')],
      },
      {
        name: 'Airwindows', author: 'Chris Johnson',
        description: 'Capacitor2 informs Spectrum’s ISO mode. The SDK also retains attribution for the historical Pockey transcription, which was removed from Character.',
        links: [repo('airwindows/airwindows')],
      },
    ],
  },
  {
    id: 'tools',
    title: 'Emulation & development tools',
    description: 'The tools behind native development, analysis and verification.',
    projects: [
      {
        name: 'mc68k / Musashi', author: 'Joel Anders and the Musashi contributors',
        description: 'The Musashi-derived ColdFire core used by the native Octatrack emulator tooling.',
        links: [repo('joelanders/mc68k-md-mm')],
      },
      {
        name: 'Unicorn & QEMU', author: 'Unicorn and QEMU contributors',
        description: 'CPU emulation used by the native verification harness and core probes. QEMU also supplies the ColdFire emulation behind octemu.',
        links: [repo('unicorn-engine/unicorn'), { label: 'QEMU', href: 'https://www.qemu.org/' }],
      },
      {
        name: 'Ghidra & processor support', author: 'Ghidra contributors and Robert Gay (@roblg)',
        description: 'Firmware analysis, with Robert’s DSP56300 processor module and ColdFire ISA-C/EMAC patch retained in octabam’s tools.',
        links: [repo('NationalSecurityAgency/ghidra'), repo('roblg/ghidra')],
      },
      {
        name: 'GNU toolchain & CMake', author: 'GNU and CMake contributors',
        description: 'The assemblers, compiler, linker and build system used to build the SDK’s authored native code and development tools.',
        links: [{ label: 'GNU Binutils', href: 'https://www.gnu.org/software/binutils/' }, { label: 'GCC', href: 'https://gcc.gnu.org/' }, { label: 'CMake', href: 'https://cmake.org/' }],
      },
    ],
  },
  {
    id: 'web',
    title: 'The website & local builds',
    description: 'The open-source projects behind the app and the evolution of its local firmware builder.',
    projects: [
      {
        name: 'React', author: 'Meta and React contributors',
        description: 'React, React DOM and Scheduler power the interface and its interactive workspace.',
        links: [repo('facebook/react')],
      },
      {
        name: 'Pyodide', author: 'The Pyodide and CPython contributors',
        description: 'Python in WebAssembly powered the earlier Digitakt and Digitone browser builder. Current builds use elekloader’s TypeScript kit; Pyodide remains part of the project’s history.',
        links: [repo('pyodide/pyodide')],
      },
      {
        name: 'Better Auth', author: 'Better Auth contributors',
        description: 'The account and sign-in system used by the Modwerk community.',
        links: [repo('better-auth/better-auth')],
      },
      {
        name: 'Tiptap & ProseMirror', author: 'Tiptap and ProseMirror contributors',
        description: 'The editor and document model used to write community posts.',
        links: [repo('ueberdosis/tiptap'), repo('ProseMirror/prosemirror')],
      },
      {
        name: 'react-markdown & remark-gfm', author: 'The unified, remark and micromark contributors',
        description: 'Markdown rendering and GitHub-flavored Markdown support for community content.',
        links: [repo('remarkjs/react-markdown'), repo('remarkjs/remark-gfm')],
      },
      {
        name: 'webcrypto-web-push', author: 'block65 and contributors',
        description: 'Web Crypto-based Web Push delivery used by the community notification system.',
        links: [repo('block65/webcrypto-web-push')],
      },
      {
        name: 'Vite & TypeScript', author: 'Vite and TypeScript contributors',
        description: 'The development server, production build tools and type checking used to build the website.',
        links: [repo('vitejs/vite'), repo('microsoft/TypeScript')],
      },
    ],
  },
]
