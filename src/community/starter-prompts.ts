/** Copyable prompts that start a coding agent on a new module in a contributor's fork. */
import { DEVELOPMENT_DISCORD_URL } from '../config/development-discord'
import { machineRoad } from '../devices/machine-road'
import { DEVICES, DEVICES_BY_ID, deviceTitle, isZd2Pedal, needsIntegration, type DeviceProfile } from '../devices/registry'

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
  note: needsIntegration(device) ? 'Integration needed' : device.status === 'preview' ? 'Preview' : undefined,
}))

const OCTATRACK: Starter[] = [
  { id: 'effect', title: 'An effect', summary: 'A new FX1 or FX2 effect on the DSP, such as a filter, delay or distortion.', guides: ['effects.md'], example: 'Mini Verb, Tape Echo, TapeHead',
    task: 'Build a new FX1/FX2 effect: {idea}\nStart it as an insert effect (`--kind dsp`) unless it genuinely needs the shared bus, and explain why if it does.' },
  { id: 'machine', title: 'A track machine', summary: 'A new sound engine in the track machine list.', guides: ['machines.md'], example: 'Analog BD, FM Synth',
    task: 'Build a new track machine that appears in the machine chooser and SRC SETUP: {idea}\nAnalog BD (sdk/octatrack/modules/analog-bassdrum/) is the worked example.' },
  { id: 'sequencer', title: 'A sequencer tool', summary: 'Generative steps, ratchets, quantizing: anything that acts in time.', guides: ['machines.md', 'sequencing.md'], example: 'Euclid, Scale Quantizer',
    task: 'Build a module that acts on the sequencer: {idea}\nFollow the instrument\'s own transport, tempo, track speed, scale, length and swing, as Euclid does. Never keep a clock of your own.' },
  { id: 'midi-fx', title: 'A MIDI generator or MIDI effect', summary: 'An arpeggiator, chord or Euclidean note generator, or a MIDI effect such as transpose, scale mapping, humanise or echo.', guides: ['midi-usb.md', 'sequencing.md'], example: 'none yet',
    task: 'Build a MIDI generator or MIDI effect: {idea}\nUse category midi-usb, location MIDI tracks (or Project sequencer), and scaffold with --kind coldfire. Agree the design with me first: no module generates MIDI notes yet, so there is no worked example.' },
  { id: 'midi', title: 'MIDI & USB', summary: 'Map controllers or change what the unit does over USB.', guides: ['midi-usb.md'], example: 'CC Map, USB Audio',
    task: 'Build a MIDI or USB module: {idea}\nSay exactly which messages it consumes, passes through, maps or sends, and keep everything else behaving as stock. If it generates or transforms notes, use the MIDI generator or MIDI effect starter instead.' },
  { id: 'workflow', title: 'A workflow tweak', summary: 'Playback, scenes, menus and settings: small changes that make the unit nicer to use.', guides: ['playback.md', 'scenes.md', 'system.md'], example: 'Repitch, Preview Vol, Apply Scene',
    task: 'Build a workflow module: {idea}\nPick the category (playback, scenes or system) whose guide fits best and tell me which one you chose. Defaults must be safe and a project must save and reload unchanged.' },
  { id: 'port', title: 'Port an octabam module', summary: 'Bring an existing octabam module to Modwerk with its author\'s credit.', guides: [], port: true, example: 'Sidechain Compressor',
    task: 'Port this octabam module to Modwerk: {idea}\nCopy it from octabam at an exact commit, record every copied file in sdk/imports/, keep the author\'s credit and full licence text, and compare the result with native octabam as the guide describes.' },
]

const DIGI: Starter[] = [
  { id: 'machine', title: 'A new machine', summary: 'A new SRC machine under a free machine id.', guides: ['machines.md'], example: 'Digitakt: Digi Poly, Digi Mono, SOPHIE',
    task: 'Build a new SRC machine under a free machine id (core_machines, ids 4–127): {idea}\nClaim the id in platform.claims and keep the stock machines untouched.' },
  { id: 'effect', title: 'An effect', summary: 'Process the audio at the render hooks, such as an EQ or a saturator.', guides: ['effects.md'], example: 'Digitakt: Digi EQ',
    task: 'Build an audio effect on the render hooks (ev_render_in / ev_render_out): {idea}\nStay inside the shared memory and fast SRAM budgets and say how much of each it uses.' },
  { id: 'sequencer', title: 'A sequencer tool', summary: 'Ratchets, generative steps or anything else that acts in time.', guides: ['sequencing.md'], example: '',
    task: 'Build a module that acts on the sequencer: {idea}\nFollow the instrument\'s own transport, tempo, track speed and swing. Never keep a clock of your own.' },
  { id: 'midi-fx', title: 'A MIDI generator or MIDI effect', summary: 'Generate notes from the transport, or transform MIDI: transpose, scale mapping, humanise, echo.', guides: ['midi-usb.md', 'sequencing.md'], example: '',
    task: 'Build a MIDI generator or MIDI effect: {idea}\nClaim any SysEx id in platform.claims. Agree the design with me first.' },
  { id: 'midi', title: 'MIDI & USB', summary: 'Map or filter MIDI.', guides: ['midi-usb.md'], example: '',
    task: 'Build a MIDI module: {idea}\nSay exactly which messages it consumes, passes through, maps or sends, and claim any SysEx id it uses.' },
  { id: 'workflow', title: 'A workflow tweak', summary: 'Playback, screens, keys and SETTINGS rows that make the unit nicer to use.', guides: ['playback.md', 'system.md'], example: 'Digitakt: Digi Utils, Digi Matrix; Digitone: digitables',
    task: 'Build a workflow module using the key, encoder, draw or SETTINGS events: {idea}\nPick the category (playback or system) whose guide fits best and tell me which. Only take the key or encoder events it needs and leave everything else to the OS.' },
  { id: 'port', title: 'Port an elekloader mod', summary: 'Bring a released .elemod mod to Modwerk with its author\'s credit.', guides: [], port: true, example: '',
    task: 'Port this elekloader mod to Modwerk: {idea}\nImport it with `npm run elekloader:update`, pin `source` to the author\'s commit, keep their credit, licence and README under upstream/, and record the import in sdk/imports/.' },
]

/** The Analog Rytm MKII and the Analog Four MKII: analog voices, so no SRC machine to add, and a digital path (the effects and the inputs) at the render hooks. */
function analogStarters(example: Partial<Record<string, string>>): Starter[] {
  const shared = (id: string) => DIGI.find(starter => starter.id === id)!
  return [
    { id: 'effect', title: 'An effect on the digital path', summary: 'Process the effects and the inputs at the audio interrupt, or add a return of your own. The analog voices stay as they are.', guides: ['effects.md'], example: example.effect ?? '',
      task: 'Build an effect on the render hooks (ev_render_in / ev_render_out): {idea}\nThey cover the digital path only (the effects and the inputs): a mod cannot change an analog voice\'s own sound. Say how much of the shared mod memory it uses.' },
    { id: 'sequencer', title: 'A sequencer tool', summary: 'Retrigs, accents, humanising or anything else that acts in time.', guides: ['sequencing.md'], example: example.sequencer ?? '',
      task: 'Build a module that acts on the sequencer: {idea}\nFollow the instrument\'s own transport, tempo, track speed and swing. Never keep a clock of your own.' },
    shared('midi-fx'),
    shared('midi'),
    { id: 'workflow', title: 'A workflow tweak', summary: 'Playback, screens, keys and rows in the GLOBAL menu that make the unit nicer to use.', guides: ['playback.md', 'system.md'], example: example.workflow ?? '',
      task: 'Build a workflow module using the key, encoder, draw or settings events: {idea}\nPick the category (playback or system) whose guide fits best and tell me which. Only take the key and encoder events it needs; leave the rest to the OS.' },
    shared('port'),
  ]
}
const RYTM = analogStarters({ workflow: 'Loop Sync, Filter Hz' })
const FOUR = analogStarters({})

// Zoom pedals with the zdl platform: an effect file built in ZoomMultistompZDL and released on GitHub (docs/ZDL_MODULE_CONTRACT.md).
const ZOOM: Starter[] = [
  { id: 'effect', title: 'An effect', summary: 'A delay, reverb, modulation, looper or any audio effect for the pedal.', guides: ['effects.md'], example: 'MS-70CDR: Loop',
    task: 'Build a Zoom effect (.ZDL): {idea}\nWrite and build it in ZoomMultistompZDL with the linker\'s own runtime, stay inside the patch DSP, file and control budgets, and say what it costs.' },
  { id: 'port', title: 'List a released effect', summary: 'Bring an effect released on GitHub to Modwerk with its author\'s credit.', guides: ['effects.md'], port: true, example: '',
    task: 'List this released Zoom effect on Modwerk: {idea}\nIt must be built with the linker\'s own runtime, with no stock Zoom code; pin its GitHub release in platform.binary, keep the author\'s credit and licence, and vendor it with npm run zdl:vendor.' },
]

const INTEGRATION: Starter[] = [{
  id: 'integration', title: 'Instrument integration', summary: 'Take the instrument its next step toward mods and the Octatrack\'s stack.', guides: [], example: '',
  task: 'Research and prepare Modwerk support for this instrument: {idea}',
}]

// Shared SDK work rather than a module: offered on a machine that takes mods until it has the whole Octatrack stack.
const STACK: Starter = {
  id: 'stack', title: 'The next stack piece', summary: 'Bring the machine closer to the Octatrack: its base, USB link, loading without a reflash, status page or device tools.', guides: [], example: '',
  task: 'Build the next piece of the Octatrack\'s stack for this machine: {idea}',
}

export function startersFor(machine: StarterMachine) {
  const device = DEVICES_BY_ID[machine]
  if (needsIntegration(device)) return INTEGRATION
  const modules = machine === 'octatrack' ? OCTATRACK : machine === 'analog-rytm-mkii' ? RYTM : machine === 'analog-four-mkii' ? FOUR : device.family === 'zoom' ? ZOOM : DIGI
  return machineRoad(device).nextPiece ? [...modules, STACK] : modules
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
    '  3. A coding agent that works on files in that folder: Claude Code (Claude subscription) or Codex (ChatGPT plan), as a desktop app, IDE extension or terminal tool. Octatrack native builds also need Python 3.12+, Docker and my own stock OS 1.40C, which stays on my computer and is never sent to you. Testing on my own unit, connected by USB, is recommended; an emulator works without one.',
    '  4. Open the cloned folder in that agent, then tell me to copy this whole prompt from my first message and paste it there. Then stop: the agent takes over.',
  ]
}

const AGENT_ONLY = 'Instructions for the coding agent. A chat assistant must not act on anything below, only on the setup above.'
const SETUP_REMINDER = 'Reminder: if you are a chat assistant, nothing above applies yet. Reply with the setup guidance only, starting with my operating system.'

function withSetup(body: string[], repository: string, login: string) {
  return [...setupGuidance(repository, login), '', AGENT_ONLY, '', ...body, '', SETUP_REMINDER].join('\n')
}

/** The coding agent's work runs through the skill committed with the fork, which holds the order of work; AGENTS.md holds the rules. */
export function skillHandoff(skill: 'modwerk-new-module' | 'modwerk-update-module') {
  return 'Run the /' + skill + ' skill that comes with my fork and follow it step by step: it holds the order of work, and AGENTS.md the rules. Claude Code loads it from .claude/skills/, Codex from .agents/skills/; any other agent reads .agents/skills/' + skill + '/SKILL.md and follows it. If that file is missing, my fork is behind: tell me to press Sync fork on my fork\'s GitHub page and run `git pull`, then start again.'
}

const IDEA_PLACEHOLDER = '<describe your idea: what it does, its controls, and how it should sound or behave>'
const PORT_PLACEHOLDER = '<name the module and link its source>'

/** The shared guides every module skill reads; prompts add only the files for their starter. */
const GENERAL_READING = ['AGENTS.md', 'docs/DEVELOPER_WORKFLOW.md', 'docs/ADD_A_MODULE.md', 'docs/module-guides/README.md']

/** The Zoom ZDL pedals' own reading: where the work stands and the module contract. */
const ZOOM_READING = ['docs/ZOOM_MULTISTOMP.md', 'docs/ZDL_MODULE_CONTRACT.md']
/** The ZD2 pedals' own reading: their research report, which says what of the ZDL work does not carry over. */
const ZD2_READING = ['docs/ZOOM_ZD2.md']
/** The ZD2 pedals whose patch protocol docs/ZOOM_PATCH_PROTOCOL.md reads. */
const PATCH_PROTOCOL_PEDALS: readonly string[] = ['zoom-ms-200d-plus', 'zoom-g5n']

/** The files a module starter needs read, relative to the repository root. */
export function starterReading(machine: StarterMachine, starter: Starter) {
  const files = [...GENERAL_READING, ...starter.guides.map(guide => 'docs/module-guides/' + guide)]
  const device = DEVICES_BY_ID[machine]
  const zoomReading = device?.family === 'zoom' ? isZd2Pedal(device) ? [...ZD2_READING, ...PATCH_PROTOCOL_PEDALS.includes(machine) ? ['docs/ZOOM_PATCH_PROTOCOL.md'] : []] : ZOOM_READING : []
  if (starter.id === 'stack') return ['AGENTS.md', 'docs/MACHINE_RECIPE.md', 'docs/ADD_A_MACHINE.md', 'docs/FRONTEND_MCP.md', ...zoomReading, device.sdk!, 'sdk/machines/' + machine + '/machine.json']
  if (starter.id === 'integration') return [...files, 'docs/ADD_A_MACHINE.md', 'docs/MACHINE_RECIPE.md', 'sdk/machines/README.md', ...zoomReading, ...(device?.sdk ? [device.sdk] : []), 'sdk/machines/' + machine + '/machine.json']
  return machine === 'octatrack' ? [...files, 'sdk/octabam/AGENTS.md'] : [...files, ...(device.family === 'zoom' && !isZd2Pedal(device) ? ZOOM_READING : []), device.sdk!]
}

/** The pedals MIDISTOMP, the Zoom base, runs on; the G1on series has none yet. */
const MIDISTOMP_PEDALS: StarterMachine[] = ['zoom-ms-70cdr', 'zoom-ms-50g', 'zoom-ms-60b']

/** Zoom pedals take effect files on their own firmware, so the Elektron road (OS rebuild, boot, core) does not apply; this says what does. */
function zoomGuidance(machine: StarterMachine) {
  if (isZd2Pedal(DEVICES_BY_ID[machine])) return zd2Guidance(machine)
  return [
    DEVICES_BY_ID[machine]?.sdk
      ? 'Where the Zoom work stands: the `zdl` module contract is in force here. Follow "Create an effect" in ' + DEVICES_BY_ID[machine].sdk + ' (build with the own runtime, check, try on my pedal, release, list). Open steps: docs/ZOOM_MULTISTOMP.md#plan.'
      : 'Where the Zoom work stands: the MS-70CDR has the whole stack (its pedal page backs up, installs and removes effects over USB, syncs module sets and flashes the MIDISTOMP base; its effects are in the library under the `zdl` module contract, docs/ZDL_MODULE_CONTRACT.md). This pedal comes up the same road, one step per pull request with evidence from this pedal, in docs/ZOOM_MULTISTOMP.md#another-zdl-pedal; its beta pedal page only reads it so far. Pick up its next open step rather than a parallel one, and check the agent board and open pull requests first.',
    MIDISTOMP_PEDALS.includes(machine)
      ? 'The base is Luca Matturro\'s MIDISTOMP (MIT), pinned in sdk/imports/ (DSP limit 300, parallel routing, a shared transport). Building it needs the stock updater on my computer, never in the repository or CI; effects also run without it.' + (machine === 'zoom-ms-70cdr' ? '' : ' Its releases are built from the MS-70CDR\'s OS, so never flash one onto this pedal (the modding guidelines allow no firmware flips): this pedal\'s base is MIDISTOMP built from its own updater.')
      : 'MIDISTOMP, the base of the MultiStomp pedals, does not run on this pedal, so its effects install on the stock firmware.',
    'Anything Modwerk lists carries no stock Zoom code: build with the linker\'s own runtime (ZDL_OWN_RUNTIME=1), never its stock knob handlers, check the file with build/check_no_stock.py there, and graft nothing onto and build nothing from a stock effect.',
    // With an SDK the pedal's guide covers trying an effect on the pedal and recovery.
    ...DEVICES_BY_ID[machine]?.sdk ? [] : ['Test on my own pedal over USB through the pedal page and its link (src/engine/zoom/); Zoom Effect Manager stays the fallback install. Every write is persistent, so back the pedal up first and keep the recovery from its profile at hand.'],
    'For fast iteration without a pedal, use Ziddle (https://berbasoft.com/ziddle/), Berbasoft\'s Rust emulator and CLI for Zoom pedals. It is a developer tool: its results are never hardware evidence, and the site never offers it to musicians.',
    'The Plus and Four pedals (MS-70CDR+, G1 FOUR and others) load ZD2 effects and are not covered here.',
  ]
}

/** The ZD2 pedals (docs/ZOOM_ZD2.md): effect files on the stock firmware, but none of the ZDL family's pedal page, base or contract. */
function zd2Guidance(machine: StarterMachine) {
  return [
    'Where the ZD2 work stands: this pedal loads .ZD2 effects, not the ZDL family\'s .ZDL files, so the pedal page, its link, MIDISTOMP and the proposed `zdl` module contract do not apply. docs/ZOOM_ZD2.md separates hardware results, firmware readings and unknowns and ends with the open steps; pick up the next one rather than starting a parallel one, and check the agent board and open pull requests first.',
    'Anything Modwerk lists carries no stock Zoom code: no effect grafted onto, patched into or built from a stock one, and no knob handlers taken from a stock effect. Build on the clean-room route the report describes (Stomphacks\' pipeline plus one header change)' + (machine === 'zoom-g1-four' ? ', which runs on this pedal.' : '. It is shown on the G1 FOUR only and unproven on this pedal, so prove it here first.'),
    'Install over USB MIDI with the pedal\'s own file commands (zoom-zt2); Zoom\'s Guitar Lab stays the fallback. Every write is persistent: back the pedal up first, keep autosave off, keep custom effects out of saved patches and keep the recovery from its profile at hand.',
  ]
}

export function starterPrompt(machine: StarterMachine, starter: Starter, idea = '', login = '', repository = REPOSITORY) {
  if (needsIntegration(DEVICES_BY_ID[machine])) return integrationPrompt(machine, idea, login, '', '', repository)
  if (starter.id === 'stack') return stackPrompt(machine, idea, login, repository)
  const name = STARTER_MACHINES.find(item => item.id === machine)!.name
  const author = login.trim().replace(/^@/, '') || '<your-github-login>'
  const description = idea.trim() || (starter.port ? PORT_PLACEHOLDER : IDEA_PLACEHOLDER)
  // The skill reads the shared guides; the prompt adds this starter's category guides and, on a machine still getting the Octatrack's stack, its guide's stack section, which says what the base will own (docs/MACHINE_RECIPE.md).
  const reading = starterReading(machine, starter).filter(file => !GENERAL_READING.includes(file)).map(file => '- ' + file + (file === 'sdk/octabam/AGENTS.md' ? ' (the DSP and ColdFire traps)' : file === DEVICES_BY_ID[machine]?.sdk ? ' (its Modwerk stack section first)' : ''))
  const scaffold = machine === 'octatrack' ? 'npm run module:new -- <id> --kind dsp|coldfire --author ' + author : 'npm run module:new -- <id> --machine ' + machine + ' --author ' + author
  const create = starter.port ? 'Create the module folder as the guide describes for a port.' : 'When you scaffold it, use `' + scaffold + '`.'
  const zoom = DEVICES_BY_ID[machine]?.family === 'zoom'
  return withSetup([
    zoom ? 'I am working in my fork of Modwerk, which lists effects for Zoom MultiStomp pedals. Help me make an effect for the ' + name + '.' : 'I am working in my fork of Modwerk, which builds custom firmware modules for Elektron instruments. Help me make a module for the ' + name + '.',
    '',
    starter.task.replace('{idea}', description),
    '',
    skillHandoff('modwerk-new-module'),
    '',
    'For this module, also read:', ...reading,
    ...(zoom ? ['', ...zoomGuidance(machine), ''] : []),
    create + ' My GitHub login is ' + author + ', the module author.',
  ], repository, login)
}

export function updatePrompt(machine: StarterMachine, module = '', idea = '', issue = '', repository = REPOSITORY, login = '') {
  if (needsIntegration(DEVICES_BY_ID[machine])) return integrationPrompt(machine, idea, login, module, issue, repository)
  const name = STARTER_MACHINES.find(item => item.id === machine)!.name
  const author = login.trim().replace(/^@/, '') || '<your-github-login>'
  return withSetup([
    'I am working in my Modwerk fork. Help me fix or update ' + (module.trim() || '<module id or source link>') + ' for the ' + name + '.',
    'Change: ' + (idea.trim() || '<describe the change or investigate the linked report>'),
    ...(issue.trim() ? ['Fix issue ' + issue.trim()] : []),
    'My GitHub login is ' + author + '.',
    '',
    skillHandoff('modwerk-update-module'),
  ], repository, login)
}

/** For a machine that takes mods but lacks part of the Octatrack's stack: its next piece, as shared SDK work (docs/MACHINE_RECIPE.md). */
function stackPrompt(machine: StarterMachine, idea = '', login = '', repository = REPOSITORY) {
  const device = DEVICES_BY_ID[machine]
  const name = deviceTitle(device)
  const road = machineRoad(device)
  return withSetup([
    'I am working in my Modwerk fork. Help me build the next piece of the Octatrack\'s stack for the ' + name + '.',
    'Goal: ' + (idea.trim() || '<the piece you want to work on, or leave it to the next one below>'),
    ...(login.trim() ? ['My GitHub login: ' + login.trim().replace(/^@/, '')] : []),
    '',
    'This is shared SDK work, not a module: it goes in its own pull request for owner review, never inside a module release.',
    'Before changing code, read:', ...starterReading(machine, STACK).map(file => '- ' + file + (file === device.sdk ? ' (its Modwerk stack section first)' : '')),
    'Then sdk/machines/' + machine + '/GOAL.md, where it exists.',
    '',
    'The ' + name + '\'s stack, as its profile and machine page record it (' + road.stack.filter(piece => piece.state === 'done').length + ' of ' + road.stack.length + ' done):',
    ...road.stack.map((piece, index) => `${index + 1}. ${piece.title}: ${piece.state}`),
    'Next piece: ' + road.nextPiece!.title + ' (' + road.nextPiece!.description + ') The "Next" column for this machine in docs/MACHINE_RECIPE.md says what that means here.',
    'Extend the Octatrack\'s pieces, listed with their files in the recipe: add this machine\'s glue, addresses and pages to the loader, link, builder, device tools and machine page rather than designing new ones. The base is Modwerk\'s and owns what several modules share; a hook costs nothing while no module uses it.',
    '',
    'Check the agent board (`npm run board`: claims, questions and findings on machine ' + machine + ') and open pull requests for the ' + name + ' first. Pick up the next piece rather than a parallel one, and ask whoever is on it before starting.',
    'Use Node 24 and npm ci. Work on that piece only: establish what the machine already has for it, propose a scoped plan and wait for my approval before implementation.',
    'Develop for USB and test the exact build on my unit through the developer MCP\'s device tools; emulators are for iteration, never evidence. A piece is done once its exact build passed on more than one unit and the owner released it; until then it stays started.',
    'When the piece moves, update the profile\'s stack, the machine\'s guide and the table in docs/MACHINE_RECIPE.md in the same pull request. Keep stock firmware and extracted bytes private, and never edit generated files by hand.',
  ], repository, login)
}

/** For a machine not ready for modules: its next step on the road its machine page shows, and the Octatrack's stack after it (docs/MACHINE_RECIPE.md). */
function integrationPrompt(machine: StarterMachine, idea = '', login = '', module = '', issue = '', repository = REPOSITORY) {
  const device = DEVICES_BY_ID[machine]
  const name = deviceTitle(device)
  const zoom = device.family === 'zoom'
  const road = machineRoad(device)
  const piecesDone = road.stack.filter(piece => piece.state === 'done').length
  return withSetup([
    'I am working in my Modwerk fork. Help me take the ' + name + ' its next step toward mods and the Octatrack\'s stack.',
    'Goal: ' + (idea.trim() || '<describe the module or instrument support you want>'),
    ...(module.trim() ? ['Requested module/change: ' + module.trim()] : []),
    ...(issue.trim() ? ['Related issue: ' + issue.trim()] : []),
    ...(login.trim() ? ['My GitHub login: ' + login.trim().replace(/^@/, '')] : []),
    '',
    device.sdk
      ? 'This instrument has an SDK guide (' + device.sdk + ') but is not ready for modules yet, so do not scaffold, build or publish a module for it.'
      : 'This instrument has no published Modwerk SDK or qualified module builder yet. The dropdown lists known instruments, not a claim that they can all build modules. Do not use Digitakt/Digitone commands, core slots, render hooks or memory budgets for this hardware.',
    'Talk to the owner first: before any implementation (research tools, a writer, a base or a profile), I message the owner on the Modwerk Discord (' + DEVELOPMENT_DISCORD_URL + ') with the device and the plan. Until I tell you I have, only read public material.',
    'Before changing code, read:', ...starterReading(machine, INTEGRATION[0]).map(file => '- ' + file),
    'Then the machine\'s own guide, sdk/machines/' + machine + '/README.md, and its GOAL.md, where they exist: they say where it stands and what comes next.',
    'Current machine profile: ' + device.summary,
    ...device.research?.map(source => 'Public research: ' + source.label + ' — ' + source.url) ?? [],
    '',
    'Where the ' + name + ' stands, as its profile and machine page record it:',
    ...road.steps.map((step, index) => `${index + 1}. ${step.title}: ${step.state}`),
    road.next ? 'Next step: ' + road.next.title + ' (' + road.next.description + ')' : 'Every step to the first mod is recorded as done; check the profile against the guide before going on.',
    'After the first mod comes the Octatrack\'s stack, ' + piecesDone + ' of ' + road.stack.length + ' pieces done: ' + road.stack.map(piece => piece.title + ' (' + piece.state + ')').join(', ') + '.',
    ...(zoom ? [] : ['Plan the core as the machine\'s Modwerk base from the start: started from an upstream core\'s source where one exists, owning the sites several mods share as hooks. Extend the Octatrack\'s pieces (loader, link, builder, device tools, machine page) rather than designing new ones.']),
    '',
    ...(zoom ? [...zoomGuidance(machine), ''] : ['Check the agent board (`npm run board`: claims, questions and findings on machine ' + machine + ') and open pull requests for the ' + name + ' first. Pick up the next step rather than a parallel one, and ask whoever is on it before starting.', '']),
    'Use Node 24 and npm ci. Work on the next step only: establish what is known about it, separating confirmed evidence, public research and unknowns, then propose a scoped plan for that step and wait for my approval before implementation. Shared SDK/builder changes need owner review; the automatic author-update path does not apply to instrument integration.',
    'Follow docs/ADD_A_MACHINE.md for profile, platform, toolchain, compatibility and browser integration. Keep stock firmware and extracted bytes private; do not mark unsupported milestones done or invent hardware results. Regenerate the machine registry through npm run machines:generate; never edit generated files by hand.',
    'Each step and each stack piece is its own owner-reviewed pull request with evidence from a real unit. When one moves, update the profile\'s steps or stack, the machine\'s guide and the table in docs/MACHINE_RECIPE.md in the same pull request.',
    'Modules come once the machine is ready for them; the module workflow in docs/DEVELOPER_WORKFLOW.md applies from then on.',
  ], repository, login)
}

const repositoryParts = (repository: string) => { const [, owner = 'repeat98', name = 'modwerk'] = repository.match(/github\.com\/([^/]+)\/([^/]+)$/) ?? []; return { owner, name } }

/** One prompt for every developer, whatever the instrument: a coding agent sets the computer up and installs the skills; a chat assistant only gets the newcomer to a coding agent. The instrument's own tools come from the setup section it points to. */
export function setupPrompt(repository = REPOSITORY) {
  const { owner, name } = repositoryParts(repository)
  return [
    'Set up my computer for Modwerk development: ' + repository + ', a community workshop that builds mods for electronic music instruments.',
    '',
    'If you are a chat assistant without access to my files and a terminal (ChatGPT, Gemini, Claude on the web), you cannot do this setup. Guide me instead, one step at a time, and wait for me to confirm each step. Ask which operating system I use and show me how to open a terminal. Help me create a free GitHub account (github.com/signup). Then help me install a coding agent that works on files on my computer: Claude Code (Claude subscription) or Codex (ChatGPT plan), as a desktop app or a terminal tool. Then tell me to open it in an empty folder, paste this whole prompt there, and stop. Do nothing below.',
    '',
    'If you are a coding agent that can run commands on my computer, do the setup yourself, step by step. Before each step, say in one plain sentence what it does. Ask before you install anything, skip anything already in place, and answer in the language I write to you in.',
    '',
    '1. Tools: git, the GitHub CLI signed in (`gh auth login`; help me create a GitHub account if I have none), and Node 24 through nvm. On Windows, set up WSL and work inside it, because the developer MCP does not run on native Windows.',
    '2. My fork: unless this folder is already my Modwerk checkout, run `gh repo fork ' + owner + '/' + name + ' --clone`, which also adds `upstream`. In an existing checkout, check that `upstream` is ' + repository + '.git and run `git fetch upstream`. Then, inside the checkout, run `nvm install && npm ci`.',
    '3. Ask me which instruments I own and how I will test: on my own unit (recommended), in an emulator, or not yet. Set up what docs/DEVELOPER_WORKFLOW.md#your-development-setup describes for that. Firmware and stock OS files stay on my computer: never commit, upload or paste them.',
    '4. Register the developer MCP with yourself as docs/FRONTEND_MCP.md shows, with its data in a private folder outside the repository such as ~/.modwerk. Leave out --allow-device-writes.',
    '5. The agent board: run `npm run board -- login` once. It shows who is working on what.',
    '6. The Modwerk skills: they live in the checkout\'s .agents/skills/ (Claude Code reads the identical .claude/skills/). Install them for yourself by linking, not copying, each skill folder into your own user skills folder (Claude Code: ~/.claude/skills/), so a `git pull` keeps them current. Leave out the owner\'s own skills, whose description says they are only for the owner. Then give me an overview: one plain line per skill, from its SKILL.md description, saying what it does and when I would use it.',
    '7. Check that it works: call the MCP\'s site_catalogue tool, and device_status if my unit runs the Modwerk base and is connected.',
    '8. Give me a short list of what is ready and what is still missing, with the one command or click that fixes each. If the skills don\'t show up for you yet, tell me to reopen you in the ' + name + ' folder. Then run /modwerk-start.',
    '',
    'Reminder for a chat assistant: only the guidance in the second paragraph applies to you.',
  ].join('\n')
}

export function cloneCommands(repository: string, login = '') {
  const { owner, name } = repositoryParts(repository)
  const fork = login.trim().replace(/^@/, '') || '<your-github-login>'
  return ['git clone https://github.com/' + fork + '/' + name + '.git', 'cd ' + name, 'git remote add upstream https://github.com/' + owner + '/' + name + '.git', 'nvm use && npm ci'].join('\n')
}
