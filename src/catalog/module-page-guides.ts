import type { ModuleDocument } from './module-contract.ts'
import type { FirmwareModule } from './modules.ts'
import { escapeHtml, paragraph } from '../../scripts/page-html.ts'

/** Extra static-page copy and screenshots for modules whose README is longer than the SEO summary. */
export function modulePageGuideHtml(module: FirmwareModule, document: ModuleDocument, appUrl: URL): string {
  if (module.id !== 'seq') return ''
  const mediaUrl = (path: string) => new URL(`module-media/${module.id}/${document.version}/${path}`, appUrl).href
  const figure = (path: string, alt: string, caption: string) =>
    `<figure><img src="${escapeHtml(mediaUrl(path))}" alt="${escapeHtml(alt)}" loading="lazy" width="512" height="256" /><figcaption>${escapeHtml(caption)}</figcaption></figure>`

  const lanes = [
    ['TRIG', 'Sample-trig or note-trig rhythm', 'Rewrites track trigs and places locks for the current destination on those steps. Copies that destination\'s PLCK PULS / ROT to match.'],
    ['PLCK', 'That destination\'s lock rhythm', 'Leaves track trigs alone. Clears the destination on every miss, including on steps with a trig, then writes on PLCK hits.'],
  ]

  return ''
    + '<h2>Find it on your Octatrack</h2>'
    + paragraph(document.access?.location ?? 'Hold [TRACK] and press [PAGE] on any track.')
  + (document.access?.steps?.length ? '<ol>' + document.access.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('') + '</ol>' : '')
    + '<h2>Screen reference</h2>'
    + figure('media/seq-rhythm-open.png',
      'SEQ rhythm page on track 1 with PULS, ROT, TRIG lane and the step grid.',
      'Hold [TRACK 1] and press [PAGE]: rhythm page with PULS / ROT and the Euclidean grid (MKII capture).')
    + figure('media/seq-rhythm-audio-emulator.png',
      'SEQ Rhythm on an audio track.',
      'Rhythm page on an audio track: LANE TRIG, SRC / PTCH on D, DPTH on E.')
    + figure('media/seq-harmony-audio-emulator.png',
      'SEQ Harmony on an audio track with RAND phrase selected.',
      'Press [RIGHT] on SRC / PTCH: SCAL, ROOT, PHRS and JUMP for pitch locks.')
    + figure('media/seq-harmony-midi-emulator.png',
      'SEQ Harmony on a MIDI track with RAND selected.',
      'MIDI track: VOIC, PHRS, JUMP and CHRD for note trigs and chords.')
    + figure('media/seq-clear-menu-emulator.png',
      'SEQ clear menu.',
      'Press [FUNC] + [BANK]: CLEAR DEST, CLEAR ALL DEST or CLEAR ALL+TRIGS.')
    + '<h2>Mental model</h2>'
    + paragraph('Each track has one TRIG rhythm and a separate PLCK rhythm for each lock destination. TRIG fills sample or note trigs. PLCK fills one parameter\'s locks on its own steps. The grid previews SEQ\'s settings; press [YES] to write the preview to the pattern.')
    + '<h2>TRIG and PLCK lanes</h2>'
    + '<table><thead><tr><th>LANE</th><th>You edit</th><th>[YES]</th></tr></thead><tbody>'
    + lanes.map(row => `<tr><td>${escapeHtml(row[0])}</td><td>${escapeHtml(row[1])}</td><td>${escapeHtml(row[2])}</td></tr>`).join('')
    + '</tbody></table>'
    + '<h2>Writing and clearing</h2>'
    + paragraph('Press [YES] to write from PULS, ROT or a [CUE] random tap on the focused lane. On audio tracks, PLCK hits without a sample trig create trigless trigs. Press [FUNC] + [BANK] for the clear menu; set PLCK PULS to 0 and press [YES] to clear one destination.')
}