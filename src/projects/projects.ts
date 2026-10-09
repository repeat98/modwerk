export const PROJECT_TITLE = 'Other projects'
export const PROJECT_PREVIEW_IMAGE = 'projects-social-preview-v1.jpg'
export const PROJECT_PREVIEW_ALT = 'Other projects — Modwerk. Beyond the builder: independent firmware mods, studio tools, emulators and developer tools, with original signal, sequencer, front-panel and code illustrations.'
export const PROJECT_DESCRIPTION = 'A curated selection of independent firmware mods, studio tools, emulators and developer tools for Elektron instruments, with their own workflows outside Modwerk.'
export const PROJECT_TYPES = { mod: 'Firmware mods', tool: 'Studio tools', emulator: 'Emulators', development: 'Developer tools' } as const
export type ProjectType = keyof typeof PROJECT_TYPES

// Family-level discovery tags, not a claim that every model or OS is supported.
export const PROJECT_MACHINES = {
  digitakt: 'Digitakt mk1', 'digitakt-ii': 'Digitakt II', digitone: 'Digitone / Keys', 'digitone-ii': 'Digitone II',
  syntakt: 'Syntakt', octatrack: 'Octatrack', 'analog-four': 'Analog Four / Keys', 'analog-rytm': 'Analog Rytm',
  machinedrum: 'Machinedrum', monomachine: 'Monomachine', 'model-cycles': 'Model:Cycles', 'model-samples': 'Model:Samples', 'analog-heat': 'Analog Heat',
} as const
export type ProjectMachine = keyof typeof PROJECT_MACHINES
export type ExternalProject = { name: string; repository: string; author: string; type: ProjectType; machines: readonly ProjectMachine[]; description: string }

function project(name: string, repository: string, type: ProjectType, machines: readonly ProjectMachine[], description: string): ExternalProject {
  return { name, repository: 'https://github.com/' + repository, author: repository.split('/')[0], type, machines, description }
}

// Curated links checked on 9 October 2026. Keep release/version claims in the upstream project.
// An editorial selection, chosen for distinct workflows and useful upstream documentation.
// Summaries are original and based on the projects' upstream documentation.
// See docs/EXTERNAL_PROJECTS.md for selection criteria and source links.
// DigiSophie, Digislicer, Digineighbor, Digitables, Digihealth and MIDI Scenes are already in our module library.
export const EXTERNAL_PROJECTS: readonly ExternalProject[] = [
  project('DigiChain', 'brian3kb/digichain', 'tool', ['digitakt', 'digitakt-ii', 'octatrack', 'machinedrum'], 'Prepare sample chains in your browser: convert formats, trim and normalize samples, and export Octatrack slice data.'),
  project('Elektroid', 'dagargo/elektroid', 'tool', ['digitakt', 'digitakt-ii', 'digitone', 'digitone-ii', 'syntakt', 'analog-four', 'analog-rytm', 'analog-heat', 'model-cycles', 'model-samples', 'monomachine'], 'Manage samples, sounds and projects from a desktop app or command line. Transfer features vary by instrument; includes SysEx and autosampling tools.'),
  project('rytm-rs', 'alisomay/rytm-rs', 'development', ['analog-rytm'], 'A documented Rust library for building Analog Rytm editors and generative tools around projects, kits, sounds and parameter locks.'),
  project('Octatrack Manager', 'davidferlay/octatrack-manager', 'tool', ['octatrack'], 'Browse and edit projects, visualize patterns and copy banks or Parts between projects on your computer. In active development; requires projects saved on OS 1.40 or later.'),
  project('octapy', 'jhw/octapy', 'development', ['octatrack'], 'Read, write and generate Octatrack projects with Python, including patterns, Parts, scenes and sample pools. Arrangements and some custom designs are outside its scope.'),
  project('Octobus Additions', 'designerfuzzi/OctobusAdditions', 'tool', ['octatrack'], 'An Octatrack control surface for TouchOSC, with bidirectional MIDI feedback and performance controls. Requires TouchOSC.'),
  project('OctaChainer 2', 'KaiDrange/OctaChainer2', 'tool', ['octatrack'], 'A new sample-chain app and VST3 plugin, rewritten from the original OctaChainer. In development; build and platform details are documented upstream.'),
  project('libanalogrytm', 'bsp2/libanalogrytm', 'development', ['analog-rytm'], 'A portable C library for decoding, modifying and encoding Analog Rytm SysEx. Provides protocol building blocks rather than an editor or MIDI transport.'),
  project('DigiCosm', 'irpina/digicosm', 'mod', ['digitone'], 'Microcosm-inspired effects and a looper for the Digitone’s audio inputs. A pre-release that takes over the audio engine while its page is open.'),
  project('Chord Keys', 'byNicoHeuser/Modded-Cycles', 'mod', ['model-cycles'], 'Play scale-based chords from the sixteen trig buttons on Model:Cycles.'),
  project('Analog Rytm Chop', 'bandersong/analog-rytm-chop', 'mod', ['analog-rytm'], 'Use the pads as sample-start markers and record slices as parameter locks. Model-specific builds and test status are documented upstream.'),
  project('Modded Cycles', '18nelli18/Modded-Cycles', 'mod', ['model-cycles'], 'A browser flasher and collection of Model:Cycles additions, including separate USB audio tracks and performance tools.'),
  project('digi-roll-studio', 'zooloo303/digi-roll-studio', 'tool', ['digitakt-ii', 'digitone-ii', 'analog-four'], 'A desktop sequencer for Elektron instruments, built in Rust.'),
  project('DigiFilter', 'DigiAlchemydsp/DigiFilter', 'mod', ['digitakt'], 'Extra per-track band-pass and comb filter modes for Digitakt mk1.'),
  project('plock2sound', 'AvroraPolnareff/plock2sound', 'mod', ['digitone'], 'Turn a step’s parameter locks into a sound you can save and reuse.'),
  project('OT Kyoti FW', 'Zac-Kyoti/octatrack-kyoti-fw', 'mod', ['octatrack'], 'An Octatrack firmware collection with effects, playback changes and workflow fixes. Selected features also have Modwerk ports.'),
  project('octa-panel', 'timhastie/octa-panel', 'emulator', ['octatrack'], 'An Octatrack emulator front panel with real-time audio and persistent virtual cards, for firmware development.'),
  project('screendump', 'jakobbak/screendump', 'tool', ['digitakt'], 'A command-line screen capture tool for Elektron instruments.'),
  project('DT-FM', 'mtalikka/DT-FM', 'mod', ['digitakt'], 'A four-operator FM synth machine for the original Digitakt, derived from DigiSophie.'),
  project('SYXGRID Digitone II', 'xrcstrecords/syxgrid-digitone-ii', 'tool', ['digitone-ii'], 'A browser editor for Digitone II projects, sequences, sounds and kits, with backup and restore tools.'),
  project('Digitakt II Perform', 'toonst/digitakt2-perform', 'mod', ['digitakt-ii'], 'Reach PERFORM KIT mode with one button and keep track levels when leaving it.'),
  project('Tone+FX', 'DigiAlchemydsp/Tone-FX', 'mod', ['digitone'], 'A Digitone master effects suite with ring modulation, EQ, wavefolding and output metering.'),
  project('ms-multi-output', 'scottmetoyer/ms-multi-output', 'mod', ['model-samples', 'model-cycles'], 'Per-track USB audio patches for Model:Samples and Model:Cycles.'),
  project('DNX', 'NoiseAndMatter/DNX', 'tool', ['digitone', 'digitone-ii'], 'Browser tools for Digitone project conversion, pattern management, presets and backups.'),
  project('Elekloader', 'irpina/elekloader', 'development', ['digitakt', 'digitakt-ii', 'digitone', 'octatrack'], 'An independent firmware builder and mod catalogue. Build from your own stock OS using its own installation workflow.'),
  project('digiemu', 'irpina/digiemu', 'emulator', ['digitakt', 'digitone', 'model-cycles', 'model-samples'], 'Run your own instrument firmware behind a virtual front panel with audio and MIDI.'),
  project('Model-TG', 'TinyGregAudio/Model-TG', 'mod', ['model-cycles'], 'Model:Cycles additions including a sampler machine, resampling and beat-repeat effects.'),
  project('Monomodule', 'shnolk/monomodule', 'emulator', ['monomachine'], 'A Monomachine sound-engine emulator packaged as plugins for your DAW.'),
  project('Em’s Monomachine Firmware', 'emuyia/ems-monomachine-firmware', 'mod', ['monomachine'], 'Monomachine firmware additions including track lengths, speeds and trig conditions.'),
  project('Em’s Machinedrum Firmware', 'emuyia/ems-machinedrum-firmware', 'mod', ['machinedrum'], 'Machinedrum firmware additions including track lengths, speeds and trig conditions.'),
  project('MCL / MegaCommand Live', 'jmamma/MCL', 'tool', ['machinedrum', 'monomachine', 'analog-four'], 'A MIDI sequencer and performance system for MegaCommand hardware and connected instruments.'),
  project('Overwitch', 'dagargo/overwitch', 'tool', ['digitakt', 'digitakt-ii', 'digitone', 'digitone-ii', 'syntakt', 'analog-four', 'analog-rytm', 'analog-heat'], 'JACK and PipeWire clients for Overbridge 2 devices. Original Analog Four, Analog Keys and Rytm MKI are not supported.'),
]

export function filterProjects(query: string, machine = 'all', type = 'all') {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return EXTERNAL_PROJECTS.filter(item => (machine === 'all' || item.machines.some(id => id === machine)) && (type === 'all' || item.type === type)
    && words.every(word => [item.name, item.author, item.description, PROJECT_TYPES[item.type], ...item.machines.map(id => PROJECT_MACHINES[id])].join(' ').toLocaleLowerCase().includes(word)))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

export function projectMachineForDevice(id: string) {
  if (id.startsWith('analog-four-') || id === 'analog-keys') return 'analog-four'
  if (id.startsWith('analog-rytm-')) return 'analog-rytm'
  return Object.hasOwn(PROJECT_MACHINES, id) ? id : undefined
}
