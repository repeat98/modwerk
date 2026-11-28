import { MODULE_DOCUMENTS_BY_ID } from '../catalog/documents'
import MACHINE_MODULES from '../catalog/machine-modules.json'
import { moduleMediaGuide } from '../catalog/module-media-guides'
import type { ModwerkModule } from '../catalog/module-contract-v3'
import { assetUrl } from '../hosting'
import type { BuiltModule } from './build-follow-up'
import { moduleMediaDocument } from './module-media'

type Step = { title: string; text: string }
type GuideMedia = NonNullable<ReturnType<typeof moduleMediaDocument>>['media'][number]
// Teaching copy for exact published versions; other modules use their own usage documentation.
const QUICK_TESTS: Record<string, { version: string; steps: Step[] }> = {
  miniverb: { version: '0.2.3-experimental', steps: [
    { title: 'Load a sample.', text: 'Open a fresh project and play a sample on an audio track.' },
    { title: 'Choose MINI VERB.', text: 'Hold FUNC and press FX2. Choose Mini Verb with LEVEL, then press YES.' },
    { title: 'Listen to the tail.', text: 'Press FX2. Raise MIX on encoder F, then try DECAY and TONE. TONE 64 is neutral; MIX 0 gives dry playback.' },
  ] },
  tapeecho: { version: '0.1.2-experimental', steps: [
    { title: 'Play a sample.', text: 'Open a fresh project and play a sample on an audio track.' },
    { title: 'Choose TAPE ECHO.', text: 'Hold FUNC and press FX2. Choose Tape Echo with LEVEL and YES, then press FX2 for its controls.' },
    { title: 'Make it repeat.', text: 'Set SYNC to BEAT and choose a delay with TIME. Raise MIX and FDBK, then try WOW and AGE. MIX 0 gives dry playback.' },
  ] },
  euclid: { version: '0.1.4-experimental', steps: [
    { title: 'Play a loop.', text: 'Open a fresh project and load a loop on an audio track.' },
    { title: 'Choose Euclid.', text: 'Hold FUNC and press FX1 or FX2. Choose Euclid with LEVEL and YES. Raise MIX in SETUP.' },
    { title: 'Hear the rhythm.', text: 'Press the same FX key. Try STEPS 16 and PULSE 5, then press PLAY. Adjust DEPTH to hear the sweep; Euclid follows your track’s speed and swing.' },
  ] },
  repitch: { version: '0.1.2-experimental', steps: [
    { title: 'Load a loop.', text: 'Use a Flex or Static track and check the sample’s original tempo.' },
    { title: 'Choose RPCH.', text: 'Hold FUNC and press SRC. Set TSTR on encoder E to RPCH, then press SRC to return.' },
    { title: 'Change project tempo.', text: 'Play the loop and change BPM. Speed and pitch move together. PTCH is disabled; RATE still works. Change TSTR back to leave Repitch.' },
  ] },
  vector: { version: '0.3.2-experimental', steps: [
    { title: 'Choose VECTOR.', text: 'Select an audio track, double-tap SRC, choose VECTOR and press YES.' },
    { title: 'Assign a sample.', text: 'Choose STATIC or FLEX with UP/DOWN or LEVEL, then press RIGHT. Select a loaded, tuned sample and press YES to assign it.' },
    { title: 'Shape a phrase.', text: 'Press SRC. Change TYPE, DENS or ROOT to generate a phrase; each edit commits immediately, even during playback.' },
    { title: 'Hear a variation.', text: 'Press PLAY. Press YES on the generator for a new seed; STOP/PLAY keeps the populated phrase.' },
    { title: 'Return to sample playback.', text: 'Stop playback and select normal FLEX or STATIC. The generated pattern stays in place. Expand the full instructions below for sample editing and the second SRC page.' },
  ] },
  seq: { version: '0.1.0-experimental', steps: [
    { title: 'Open SEQ.', text: 'Hold a [TRACK] key and press [PAGE] on an audio or MIDI track.' },
    { title: 'Write a rhythm.', text: 'With LANE on TRIG, set PULS and ROT, then press [YES] to place sample or note trigs.' },
    { title: 'Add locks.', text: 'Turn LANE to PLCK, pick a parameter with D, set PULS / ROT and DPTH, then press [YES] again.' },
  ] },
  synth: { version: '0.1.5-experimental', steps: [
    { title: 'Choose FM SYNTH.', text: 'In a fresh project, select an audio track. Hold FUNC + SRC, choose FM SYNTH with UP/DOWN and press YES. No sample is needed.' },
    { title: 'Add harmonics.', text: 'Press SRC, set RATO to 1 and raise INDX from 0. The sine tone gains FM harmonics; PTCH changes pitch.' },
    { title: 'Play a pattern.', text: 'Place a trig and press PLAY. Use AMP ATK, HOLD and REL to shape note length. The full instructions cover voices, chords and glide.' },
    { title: 'Stop and reset.', text: 'Press STOP twice. To return to samples, choose FLEX or STATIC in FUNC + SRC and assign a sample.' },
  ] },
}

/** Never present newer controls or captures as instructions for an older downloaded version. */
export function downloadedModuleGuide(module: BuiltModule) {
  const ot = MODULE_DOCUMENTS_BY_ID[module.id]
  const digi = (MACHINE_MODULES.modules as ModwerkModule[]).find(item => item.machine + '-' + item.id === module.id)
  const document = ot ?? digi
  if (!document || document.version !== module.version) return undefined
  const source = moduleMediaDocument(module.id)!
  const media = moduleMediaGuide<GuideMedia>(module.id, module.version, source.media)
  const allMedia = [...media.primary, ...media.additional]
  const screenshots = allMedia.filter(item => item.captureType !== 'audio')
  const controls = screenshots.findIndex(item => 'otUi' in item && item.otUi?.shows === 'controls')
  const quick = QUICK_TESTS[module.id], access = document.access
  const hasQuickTest = quick?.version === module.version
  const thumbnail = digi?.media.find(item => item.kind === 'thumbnail')
  return {
    summary: document.presentation.summary,
    steps: hasQuickTest ? quick.steps : document.presentation.usage.map(text => ({ title: '', text })),
    hasQuickTest,
    usage: document.presentation.usage,
    access: access && 'steps' in access ? access.steps : [],
    noUiReason: access && 'noUiReason' in access ? access.noUiReason?.split(/(?<=\.)\s/)[0] : undefined,
    screenshots,
    initialScreenshot: Math.max(0, controls),
    audio: allMedia.filter(item => item.captureType === 'audio'),
    thumbnail: thumbnail ? assetUrl('module-media/' + module.id + '/' + module.version + '/' + thumbnail.path) : undefined,
  }
}

export type DownloadedModuleGuide = NonNullable<ReturnType<typeof downloadedModuleGuide>>
