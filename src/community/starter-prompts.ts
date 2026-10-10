/** Copyable prompts that start a coding agent on a new module in a contributor's fork. */
import { developerWorkflowPrompt, INSTRUMENT_STEPS } from './developer-guidance'
import { DEVICES, DEVICES_BY_ID, deviceTitle, type DeviceProfile } from '../devices/registry'

export type StarterMachine = DeviceProfile['id']

export interface Starter {
  id: string
  title: string
  summary: string
  /** Module guides under docs/module-guides/, read before writing code. */
  guides: string[]
  /** The task, in the agent's words; `{idea}` is replaced by the contributor's idea. */
  task: string
  /** Ports start from an author's release instead of a scaffold. */
  port?: boolean
  example: string
}

export const STARTER_MACHINES: { id: StarterMachine; name: string; note?: string }[] = DEVICES.map(device => ({
  id: device.id, name: deviceTitle(device),
  note: device.sdk ? (device.status === 'preview' ? 'Preview' : undefined) : 'Integration needed',
}))

const OCTATRACK: Starter[] = [
  { id: 'effect', title: 'An effect', summary: 'A new FX1 or FX2 effect on the DSP, such as a filter, delay or distortion.', guides: ['effects.md'], example: 'Mini Verb, Tape Echo, Character',
    task: 'Build a new FX1/FX2 effect: {idea}\nStart it as an insert effect (`--kind dsp`) unless it genuinely needs the shared bus, and explain why if it does. Every knob must be lockable and modulatable without zipper noise, run `npm run fx:audit` for aliasing, clipping, DC and idle behaviour, and measure its cycles, stress it and benchmark it against the closest stock effect (`npm run perf:audit`, "Performance" in the module guides README).' },
  { id: 'machine', title: 'A track machine', summary: 'A new sound engine in the track machine list.', guides: ['machines.md'], example: 'Analog BD, FM Synth',
    task: 'Build a new track machine that appears in the machine chooser and SRC SETUP: {idea}\nUse Analog BD (sdk/octabam/modules/analog-bassdrum/) as the worked example, leave other tracks untouched, and make every parameter lockable and usable as an LFO destination.' },
  { id: 'sequencer', title: 'A sequencer tool', summary: 'Generative steps, ratchets, quantizing: anything that acts in time.', guides: ['machines.md', 'sequencing.md'], example: 'Euclid, Scale Quantizer',
    task: 'Build a module that acts on the sequencer: {idea}\nFollow the instrument\'s own transport, tempo, track speed, scale, length and swing, as Euclid does. Never keep a clock of your own.' },
  { id: 'midi-fx', title: 'A MIDI generator or MIDI effect', summary: 'An arpeggiator, chord or Euclidean note generator, or a MIDI effect such as transpose, scale mapping, humanise or echo.', guides: ['midi-usb.md', 'sequencing.md'], example: 'none yet',
    task: 'Build a MIDI generator or MIDI effect: {idea}\nSet the manifest to category midi-usb, location MIDI tracks (or Project sequencer), and scaffold with --kind coldfire. A generator follows the instrument\'s own transport, tempo, track speed and swing and never keeps a clock of its own. Every note-on must get its note-off on stop, on a change of Part, pattern or channel and on bypass; state what passes through unchanged and the most events one input can produce. Then measure the worst-case cycles per event, stress it with a flood of notes, CC and clock at wire rate, and benchmark what it adds to the stock frame interrupt and idle time (`npm run perf:audit -- template coldfire`, "Performance" in the module guides README). Agree the design with me first: no module generates MIDI notes yet, so there is no worked example.' },
  { id: 'midi', title: 'MIDI & USB', summary: 'Map controllers or change what the unit does over USB.', guides: ['midi-usb.md'], example: 'CC Map, USB Audio',
    task: 'Build a MIDI or USB module: {idea}\nSay exactly which messages it consumes, passes through, maps or sends, and keep everything else behaving as stock. If it generates or transforms notes, use the MIDI generator or MIDI effect starter instead.' },
  { id: 'workflow', title: 'A workflow tweak', summary: 'Playback, scenes, menus and settings: small changes that make the unit nicer to use.', guides: ['playback.md', 'scenes.md', 'system.md'], example: 'Repitch, Preview Vol, MIDI Scenes',
    task: 'Build a workflow module: {idea}\nPick the category (playback, scenes or system) whose guide fits best and tell me which one you chose. Defaults must be safe and a project must save and reload unchanged.' },
  { id: 'port', title: 'Port an octabam module', summary: 'Bring an existing octabam module to Modwerk with its author\'s credit.', guides: [], port: true, example: 'Sidechain Compressor',
    task: 'Port this octabam module to Modwerk: {idea}\nCopy it from octabam at an exact commit, record every copied file in sdk/imports/, keep the author\'s credit and full licence text, and compare the result with native octabam as the guide describes.' },
]

const DIGI: Starter[] = [
  { id: 'machine', title: 'A new machine', summary: 'A new SRC machine in one of the free machine slots.', guides: ['machines.md'], example: 'Digitakt: Digi Poly, Digi Mono, SOPHIE',
    task: 'Build a new SRC machine in one of the free machine slots (core_machines, slots 4–7): {idea}\nClaim the slot in platform.claims and keep the stock machines untouched.' },
  { id: 'effect', title: 'An effect', summary: 'Process the audio at the render hooks, such as an EQ or a saturator.', guides: ['effects.md'], example: 'Digitakt: Digi EQ',
    task: 'Build an audio effect on the render hooks (ev_render_in / ev_render_out): {idea}\nStay inside the shared memory and fast SRAM budgets and say how much of each it uses.' },
  { id: 'sequencer', title: 'A sequencer tool', summary: 'Ratchets, generative steps or anything else that acts in time.', guides: ['sequencing.md'], example: '',
    task: 'Build a module that acts on the sequencer: {idea}\nFollow the instrument\'s own transport, tempo, track speed and swing. Never keep a clock of your own.' },
  { id: 'midi-fx', title: 'A MIDI generator or MIDI effect', summary: 'Generate notes from the transport, or transform MIDI: transpose, scale mapping, humanise, echo.', guides: ['midi-usb.md', 'sequencing.md'], example: '',
    task: 'Build a MIDI generator or MIDI effect: {idea}\nFollow the instrument\'s own transport, tempo, track speed and swing, never a clock of your own. Every note-on must get its note-off on stop, on a pattern change and on removal; say what passes through unchanged and the most events one input can produce. Claim any SysEx id in platform.claims and report the shared memory, fast SRAM and time per event you measured while stressing it with a flood of notes, CC and clock. Agree the design with me first.' },
  { id: 'midi', title: 'MIDI & USB', summary: 'Map or filter MIDI.', guides: ['midi-usb.md'], example: '',
    task: 'Build a MIDI module: {idea}\nSay exactly which messages it consumes, passes through, maps or sends, and claim any SysEx id it uses.' },
  { id: 'workflow', title: 'A workflow tweak', summary: 'Playback, screens, keys and SETTINGS rows that make the unit nicer to use.', guides: ['playback.md', 'system.md'], example: 'Digitakt: Digi Utils, Digi Matrix; Digitone: digitables',
    task: 'Build a workflow module using the key, encoder, draw or SETTINGS events: {idea}\nPick the category (playback or system) whose guide fits best and tell me which one you chose. Only take the key or encoder events it needs and leave everything else to the OS.' },
  { id: 'port', title: 'Port an elekloader mod', summary: 'Bring a released .elemod mod to Modwerk with its author\'s credit.', guides: [], port: true, example: '',
    task: 'Port this elekloader mod to Modwerk: {idea}\nImport it with `npm run elekloader:update`, pin `source` to the author\'s commit, keep their credit, licence and README under upstream/, and record the import in sdk/imports/.' },
]

const INTEGRATION: Starter[] = [{
  id: 'integration', title: 'Instrument integration', summary: 'Research and qualify SDK/builder support before writing a module.', guides: [], example: '',
  task: 'Research and prepare Modwerk support for this instrument: {idea}',
}]

export function startersFor(machine: StarterMachine) {
  return machine === 'octatrack' ? OCTATRACK : DEVICES_BY_ID[machine]?.sdk ? DIGI : INTEGRATION
}

const REPOSITORY = 'https://github.com/repeat98/modwerk'

/** Opens every prompt. A coding agent carries on; a plain chat assistant, which cannot build a module, must guide a newcomer through setup instead. */
function setupGuidance(repository = REPOSITORY, login = '') {
  return [
    'Read this first: which kind of assistant are you?',
    'A) A coding assistant that can edit files and run commands in my Modwerk checkout (Claude Code, Codex, Cursor, Copilot agent mode or any assistant in an IDE or terminal): skip this block and do not walk me through setup. Only tell me what is missing (git, Node 24, my fork), then carry on with the instructions below.',
    'B) A chat assistant without access to my files and a terminal (ChatGPT, Gemini, Claude on the web): you cannot build a module. Do not propose a module, design its controls, ask about my idea or write code. Your only job is to get me set up. Reply now with one short sentence that we start with the setup, and ask which operating system I use. Then guide me one step at a time and wait for me to confirm each step before the next. Assume I have never used GitHub or a terminal: explain each step in plain words with exact clicks and links, and show me how to open a terminal on my system.',
    '  1. A free GitHub account (github.com/signup). Ask for my login and use it as the module author.',
    '  2. Fork ' + repository + ' with the Fork button, install git if I have none, then clone my fork and install its packages (Node 24 through nvm; nvm-windows on Windows):',
    ...cloneCommands(repository, login).split('\n').map(line => '     ' + line),
    '  3. A coding agent that works on files in that folder: Claude Code (Claude subscription) or Codex (ChatGPT plan), as a desktop app, IDE extension or terminal tool. Octatrack native builds also need Python 3.10+, Docker and my own stock OS 1.40C, which stays on my computer and is never sent to you.',
    '  4. Open the cloned folder in that agent, then tell me to copy this whole prompt from my first message and paste it there. Then stop: the agent takes over.',
  ]
}

const AGENT_ONLY = 'Instructions for the coding agent. A chat assistant must not act on anything below, only on the setup above.'
const SETUP_REMINDER = 'Reminder: if you are a chat assistant, nothing above applies yet. Reply with the setup guidance only, starting with my operating system.'

function withSetup(body: string[], repository: string, login: string) {
  return [...setupGuidance(repository, login), '', AGENT_ONLY, '', ...body, '', SETUP_REMINDER].join('\n')
}

const IDEA_PLACEHOLDER = '<describe your idea: what it does, its controls, and how it should sound or behave>'
const PORT_PLACEHOLDER = '<name the module and link its source>'

/** The files a starter prompt asks the agent to read, relative to the repository root. */
export function starterReading(machine: StarterMachine, starter: Starter) {
  const files = ['AGENTS.md', 'docs/DEVELOPER_WORKFLOW.md', 'docs/ADD_A_MODULE.md', 'docs/MODULE_AUTHOR_UPDATES.md', 'docs/MODULE_QUALIFICATION.md', 'docs/SDK.md', 'docs/module-guides/README.md', ...starter.guides.map(guide => 'docs/module-guides/' + guide)]
  return machine === 'octatrack' ? [...files, 'sdk/octabam/AGENTS.md'] : DEVICES_BY_ID[machine]?.sdk
    ? [...files, DEVICES_BY_ID[machine].sdk!]
    : [...files, 'docs/ADD_A_MACHINE.md', 'sdk/machines/README.md', 'sdk/machines/' + machine + '/machine.json']
}

export function starterPrompt(machine: StarterMachine, starter: Starter, idea = '', login = '', repository = REPOSITORY) {
  if (!DEVICES_BY_ID[machine]?.sdk) return integrationPrompt(machine, idea, login, '', '', repository)
  const name = STARTER_MACHINES.find(item => item.id === machine)!.name
  const author = login.trim().replace(/^@/, '') || '<your-github-login>'
  const description = idea.trim() || (starter.port ? PORT_PLACEHOLDER : IDEA_PLACEHOLDER)
  const reading = starterReading(machine, starter).map(file => '- ' + file + (file === 'sdk/octabam/AGENTS.md' ? ' (the DSP and ColdFire traps)' : file === 'docs/ADD_A_MODULE.md' ? ' (the "' + (machine === 'octatrack' ? 'Octatrack' : 'Digitakt and Digitone') + '" section)' : ''))
  const scaffold = machine === 'octatrack' ? 'npm run module:new -- <id> --kind dsp|coldfire --author ' + author : 'npm run module:new -- <id> --machine ' + machine + ' --author ' + author
  const create = starter.port ? 'Create the module folder as the guide describes for a port.' : 'Scaffold it with `' + scaffold + '`.'
  return withSetup([
    'I am working in my fork of Modwerk, which builds custom firmware modules for Elektron instruments. Help me make a module for the ' + name + '.',
    '',
    starter.task.replace('{idea}', description),
    '',
    'Before you write code, read:',
    ...reading,
    '',
    'Use Node 24 and npm ci. Propose a module id, its controls and the exact button steps to reach it on the unit. Wait for my OK before implementation. ' + create,
    '',
    developerWorkflowPrompt('create'),
  ], repository, login)
}

export function updatePrompt(machine: StarterMachine, module = '', idea = '', issue = '', repository = REPOSITORY, login = '') {
  if (!DEVICES_BY_ID[machine]?.sdk) return integrationPrompt(machine, idea, login, module, issue, repository)
  const name = STARTER_MACHINES.find(item => item.id === machine)!.name
  const reading = starterReading(machine, { ...startersFor(machine)[0], guides: [] })
  return withSetup([
    'I am working in my Modwerk fork. Help me fix or update ' + (module.trim() || '<module id or source link>') + ' for the ' + name + '.',
    'Change: ' + (idea.trim() || '<describe the change or investigate the linked report>'),
    ...(issue.trim() ? ['Fix issue ' + issue.trim()] : []),
    '',
    'Before changing code, read:', ...reading.map(file => '- ' + file),
    'Read the module’s manifest, README, TESTING and its category guide before implementation. Use Node 24 and npm ci.',
    '', developerWorkflowPrompt('update'),
  ], repository, login)
}

function integrationPrompt(machine: StarterMachine, idea = '', login = '', module = '', issue = '', repository = REPOSITORY) {
  const device = DEVICES_BY_ID[machine]
  const name = deviceTitle(device)
  return withSetup([
    'I am working in my Modwerk fork. Help me research and prepare instrument support for the ' + name + '.',
    'Goal: ' + (idea.trim() || '<describe the module or instrument support you want>'),
    ...(module.trim() ? ['Requested module/change: ' + module.trim()] : []),
    ...(issue.trim() ? ['Related issue: ' + issue.trim()] : []),
    ...(login.trim() ? ['My GitHub login: ' + login.trim().replace(/^@/, '')] : []),
    '',
    'This instrument has no published Modwerk SDK or qualified module builder yet. The dropdown lists known instruments, not a claim that they can all build modules. Do not use Digitakt/Digitone commands, core slots, render hooks or memory budgets for this hardware.',
    'Before changing code, read:', ...starterReading(machine, INTEGRATION[0]).map(file => '- ' + file),
    'Current machine profile: ' + device.summary,
    ...device.research?.map(source => 'Public research: ' + source.label + ' — ' + source.url) ?? [],
    '',
    'Instrument integration workflow:', ...INSTRUMENT_STEPS.map((step, index) => `${index + 1}. ${step.title}: ${step.summary}`),
    '',
    'Use Node 24 and npm ci. Establish what is known about the stock format, exact rebuild, recovery/boot, hooks/core and module support. Separate confirmed evidence, public research and unknowns. Propose a scoped integration plan and wait for my approval before implementation. Shared SDK/builder changes need owner review; the automatic author-update path does not apply to instrument integration.',
    'Follow docs/ADD_A_MACHINE.md for profile, platform, toolchain, compatibility and browser integration. Keep stock firmware and extracted bytes private; do not mark unsupported milestones done or invent hardware results. Regenerate the machine registry through npm run machines:generate; never edit generated files by hand.',
    'Only after the platform is integrated and qualified may we scaffold, build or publish a module. The following module workflow describes that later stage; it does not establish present support:',
    '', developerWorkflowPrompt('create'),
  ], repository, login)
}

export function cloneCommands(repository: string, login = '') {
  const [, owner = 'repeat98', name = 'modwerk'] = repository.match(/github\.com\/([^/]+)\/([^/]+)$/) ?? []
  const fork = login.trim().replace(/^@/, '') || '<your-github-login>'
  return ['git clone https://github.com/' + fork + '/' + name + '.git', 'cd ' + name, 'git remote add upstream https://github.com/' + owner + '/' + name + '.git', 'nvm use && npm ci'].join('\n')
}
