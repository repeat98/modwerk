import { useState } from 'react'
import { assetUrl } from '../hosting'
import { DEVICES, deviceHref, deviceTitle, type DeviceProfile } from '../devices/registry'
import { zoomHubHref } from '../devices/zoom-hub-route'
import { CARD_SET_FILE } from '../engine/elekloader/card-set'
import { MODULE_SKIP_HINT } from '../firmware-notices'
import { Icon, type IconName } from './Icon'
import './base-page.css'

/** A picture of the unit's own display: a real capture (emulator or module media), never a mock-up. */
type Screen = { src: string; alt: string; title: string; caption: string; keys?: string }
type Step = { icon: IconName; title: string; text: React.ReactNode }

const screen = (file: string) => assetUrl('base/' + file)

// The Octatrack's own display, captured in the Octatrack emulator from the release base built of OS 1.40C (and a
// development twin of it, whose composed screen includes the base's dialogs); the machine list is Amiga's module capture.
// PROJ > MODWERK, the status, MODULE LOAD and MODULES were read off an MKII running development twins of base 0.7.1's source
// (device.mjs png:, 16 November 2026); MODULE LOAD and MODULES with five module effects installed, two on tracks, one off.
const OCTATRACK_SCREENS: Screen[] = [
  { src: screen('ot-startup.png'), alt: 'Octatrack display at startup: the Modwerk mark between NEW and BETA, above the word MODWERK', title: 'Startup',
    caption: 'The Modwerk mark docks while the Octatrack starts, so you can see at a glance that the base is running.' },
  { src: screen('ot-project-menu.png'), alt: 'Octatrack PROJECT menu with a fifth row, MODWERK, listing LOAD, MODULE LOAD, MISSING, SELF TEST and MODULES', title: 'PROJ › MODWERK',
    caption: 'A fifth row in the PROJECT menu with five pages: the load, each module’s share of it, the modules a project misses, a self-test, and your modules switched on and off. The rest of the menu, SYSTEM included, stays as Elektron made it.', keys: 'PROJ' },
  { src: screen('ot-status.png'), alt: 'Octatrack MODWERK BASE 0.7.1 status dialog with five bars: CPU, DSP T1-4, DSP T5-8, MEM T1-4 and MEM T5-8', title: 'Status, from anywhere',
    caption: 'How busy the Octatrack is right now: the CPU, and each DSP chip by its tracks (DSP). Below, how full each chip’s DSP memory is (MEM). The title names the base version. NO closes it.', keys: 'CUE + PROJ' },
  { src: screen('ot-module-load.png'), alt: 'Octatrack MODULE LOAD page: Tape Echo, Mini Verb, E-Verb and Air Chorus, with Mini Verb at about 20 percent on tracks 1-4 and E-Verb at about 21 percent on tracks 5-8', title: 'Module load',
    caption: 'What each installed module costs on each DSP chip, for the tracks that use it, so you can see which to drop when a set gets heavy. A ~ marks an estimate; - means no track uses it there.', keys: 'PROJ › MODWERK › MODULE LOAD' },
  { src: screen('ot-modules.png'), alt: 'Octatrack MODULES page listing five installed modules, four ON and Tapehead OFF, with YES ON/OFF and NO', title: 'Modules on and off',
    caption: 'Every installed module with ON or OFF. YES switches the one under the cursor at once, with the Octatrack stopped. A module that is off stays saved on the card, also after a restart, and a sync from this site leaves it off.', keys: 'PROJ › MODWERK › MODULES' },
  { src: screen('ot-self-test.png'), alt: 'Octatrack SELF TEST page ending in ALL PASSED', title: 'Self-test',
    caption: 'Checks the modules the Octatrack runs and says ALL PASSED, or what is wrong. Status on Your Octatrack runs the same test from this site.', keys: 'PROJ › MODWERK › SELF TEST' },
  { src: screen('ot-machine-list.png'), alt: 'Octatrack SELECT MACHINE TYPE list with the module machine AMIGA below the stock machines', title: 'Shared lists',
    caption: 'Module machines join the machine list below the stock ones, and module effects join the FX1 and FX2 lists. The base owns these lists, so modules never fight over them, and no stock machine or effect is replaced.', keys: 'Double-tap a TRACK key' },
  { src: screen('ot-base-update.png'), alt: 'Octatrack BASE UPDATE screen: RECEIVING NEW BASE at 49 percent, DO NOT TOUCH, KEEP THE POWER ON', title: 'Base update',
    caption: 'While a new base arrives over USB, the whole screen says so and every key and knob is held back until it is saved. It ends on BASE SAVED, or NOT SAVED with the base you had still in place.' },
]

/** What the base shows that has no picture here: each appears only with modules installed or during a transfer. */
const OCTATRACK_ALSO: [string, string][] = [
  ['MISSING', 'modules the open project uses that the Octatrack doesn’t have, with where each is used, such as BANK A SAVED PART 2 T5. Their slots say MISSING instead of going quiet without a word.'],
  ['MODWERK SYNC', 'a small box with a bar while a sync from this site sends your modules and starts them.'],
  ['CPU FULL', 'when a machine or effect pick would overload the Octatrack, the base refuses it and says why, instead of overloading it. Stock machines, stock effects and NONE are never refused.'],
]

const RYTM_SCREENS: Screen[] = [
  { src: screen('rytm-send-page.png'), alt: 'Analog Rytm SEND FX page for the bass drum with a SND knob', title: 'A send on every track',
    caption: 'Each track gets a SEND FX page with its send to the effect.' },
  { src: screen('rytm-send-fx.png'), alt: 'Analog Rytm FX track page showing the CHORUS effect with its eight controls', title: 'The send effect',
    caption: 'The FX track holds the effect you chose, its eight controls and the return level, saved with the kit.', keys: 'FUNC + A on SEND FX' },
  { src: screen('rytm-machine-list.png'), alt: 'Analog Rytm machine list with BD ANALOG in the bass drum section', title: 'Module machines',
    caption: 'A module machine joins its track’s machine list below the stock machines, here BD ANALOG on the bass drum.' },
]

const OCTATRACK_STEPS: Step[] = [
  { icon: 'download', title: 'Install once, from the card',
    text: <>The original OS has no USB link for Modwerk, so the first install is an OS update: <a href="#octatrack/setup">Setup</a> builds the base .bin in your browser from your own OS 1.40C file, you copy it to the card and run <strong>PROJECT › SYSTEM › OS UPGRADE</strong>.</> },
  { icon: 'swap', title: 'Then add modules, over USB or from the card',
    text: <>Pick modules into a set and choose <strong>Sync to Octatrack</strong> in Chrome or Edge. They load in seconds, without the card and without a restart, and come back every time the Octatrack starts. The card works too, in any browser: <strong>Load from the card</strong> on Setup gives you a <code>{CARD_SET_FILE}</code> file. Copy it to the top folder of the card and switch the Octatrack off and on (<a href="#faq/card-set">steps</a>).</> },
  { icon: 'arrow', title: 'Updates come over USB',
    text: <>When your set needs a newer base, the site offers <strong>Install latest base</strong>. The new base runs as a trial first and only then saves itself, with at most one restart. After a base change, sync once to put your modules back.</> },
  { icon: 'back', title: 'Go back whenever you like',
    text: <>Install Elektron’s original OS from the card with OS UPGRADE, like any update, and the Octatrack is stock again (<a href="#faq/return-to-stock">steps</a>).</> },
]

const SAFETY: Step[] = [
  { icon: 'shield', title: 'Two copies of the base', text: 'An update writes only the spare copy. A power cut or a pulled cable during an update leaves the base you had, and a new base that fails to start twice goes back to the previous one by itself.' },
  { icon: 'warn', title: 'A module that crashes is left out', text: 'If the Octatrack crashes or freezes while it loads modules at startup, the next start leaves that module out and says so.' },
  { icon: 'play', title: 'Start without your modules', text: MODULE_SKIP_HINT },
  { icon: 'lock', title: 'Elektron’s startup menu stays', text: 'The base never touches the part of the flash that holds the Octatrack’s startup menu, so the MIDI recovery always works.' },
]

const ZOOM_ADDS: Step[] = [
  { icon: 'sliders', title: 'MIDI control', text: 'Knobs, effects on and off, patches and tap tempo from MIDI CC.' },
  { icon: 'play', title: 'Follows MIDI clock', text: 'The patch tempo and a transport the effects can read.' },
  { icon: 'grid', title: 'A mixer', text: 'Saved buses, on its own screen.' },
  { icon: 'wave', title: 'More at once', text: 'The DSP limit rises from 225 to 300.' },
  { icon: 'swap', title: 'Looper services', text: 'A big buffer, footswitch and CC for the Looper effect.' },
  { icon: 'check', title: 'Your effects stay', text: 'The flash never touches them.' },
]

/** The machines this page has a view for, as the FAQ has: one shows at a time. */
type BaseMachine = 'octatrack' | 'zoom' | 'rytm' | 'others'
const BASE_MACHINES: { id: BaseMachine; label: string }[] = [
  { id: 'octatrack', label: 'Octatrack' },
  { id: 'zoom', label: 'MS-70CDR' },
  { id: 'rytm', label: 'Analog Rytm' },
  { id: 'others', label: 'Others' },
]
/** The view for the machine the visitor has selected on the site: its own, or Others for a machine with no base yet. */
function baseMachine(device?: string): BaseMachine {
  return !device || device === 'octatrack' || device === 'all' ? 'octatrack' : device === 'zoom-ms-70cdr' ? 'zoom' : device === 'analog-rytm-mkii' ? 'rytm' : 'others'
}
const COVERED = new Set(['octatrack', 'zoom-ms-70cdr', 'analog-rytm-mkii'])

function ScreenGallery({ screens, label }: { screens: Screen[]; label: string }) {
  return <ul className="base-screens" aria-label={label}>{screens.map(item => <li key={item.src} className="base-screen">
    <figure>
      <div className="base-lcd"><img src={item.src} alt={item.alt} loading="lazy" decoding="async" /></div>
      <figcaption>
        <h4>{item.title}</h4>
        {item.keys && <p className="base-keys"><span className="sr-only">Open with: </span>{item.keys}</p>}
        <p>{item.caption}</p>
      </figcaption>
    </figure>
  </li>)}</ul>
}

function Steps({ steps, className = '' }: { steps: Step[]; className?: string }) {
  return <ol className={'base-steps ' + className}>{steps.map(step => <li key={step.title}>
    <span className="base-step-icon" aria-hidden="true"><Icon name={step.icon} size={17} /></span>
    <div><h4>{step.title}</h4><p>{step.text}</p></div>
  </li>)}</ol>
}

function SectionHeading({ id, title, status, children }: { id: string; title: string; status: string; children: React.ReactNode }) {
  return <header className="base-section-heading">
    <h2 id={'base-' + id}>{title} <span className="base-status">{status}</span></h2>
    <p>{children}</p>
  </header>
}

/** What a machine without its own section has: a base under way, or none yet. */
function baseState(device: DeviceProfile) {
  if (device.stack.base === 'started') return 'Base in progress'
  if (device.family === 'zoom') return 'Effects only, no base'
  if (device.id === 'digitakt' || device.id === 'digitone') return 'Mods inside the OS file'
  return 'No base yet'
}

/** `machine` is the device the visitor has selected on the site. */
export function BasePage({ machine: device }: { machine?: string }) {
  const [machine, setMachine] = useState(() => baseMachine(device))
  const others = DEVICES.filter(device => !COVERED.has(device.id) && (device.status !== 'open' || device.stack.base !== 'open'))
  return <div className="base-page">
    <div className="page-heading faq-heading base-heading"><div>
      <p className="page-kicker">MODWERK / BASE</p>
      <h1>Base firmware</h1>
      <p>The base is your instrument’s own OS with a few things added: a module loader, the lists and pages modules share, and the screens that show what they do. Choose your machine to see what its base adds and how it is installed.</p>
    </div>
      <div className="faq-machines" role="group" aria-label="Machine">{BASE_MACHINES.map(item =>
        <button type="button" key={item.id} aria-pressed={item.id === machine} onClick={() => setMachine(item.id)}>{item.label}</button>)}</div>
    </div>

    <section className="base-intro" aria-labelledby="base-intro-title">
      <h2 id="base-intro-title" className="sr-only">How the base works</h2>
      <div className="base-intro-grid">
        <div><span className="base-eyebrow">BUILT FROM YOUR FILE</span><p>Your browser builds the base from the original OS file you download from the maker. The file never leaves your computer, and Modwerk hosts no firmware.</p></div>
        <div><span className="base-eyebrow">SHARED BY EVERY MODULE</span><p>The base owns what modules have in common, such as the machine and effect lists, so any set of modules runs side by side.</p></div>
        <div><span className="base-eyebrow">ALWAYS REVERSIBLE</span><p>The maker’s original OS puts the instrument back as it was, installed the same way as any OS update.</p></div>
      </div>
    </section>

    {machine === 'octatrack' && <section className="base-section" aria-labelledby="base-octatrack">
      <SectionHeading id="octatrack" title="Octatrack MKI and MKII" status="Released">
        For everyone, on the original OS 1.40C. Modules load over USB and stay on the Octatrack’s card.
      </SectionHeading>
      <h3 className="base-subhead">What you see on the Octatrack</h3>
      <ScreenGallery screens={OCTATRACK_SCREENS} label="Octatrack base screens" />
      <dl className="base-also">{OCTATRACK_ALSO.map(([name, text]) => <div key={name}><dt>{name}</dt><dd>{text}</dd></div>)}</dl>
      <div className="base-columns">
        <div><h3 className="base-subhead">Install, update, remove</h3><Steps steps={OCTATRACK_STEPS} /></div>
        <div><h3 className="base-subhead">What keeps it safe</h3><Steps steps={SAFETY} className="is-quiet" /></div>
      </div>
      <p className="base-actions"><a className="button button-primary" href="#octatrack/setup">Set up your Octatrack <Icon name="arrow" size={14} /></a><a className="button button-quiet" href="#faq/risks">What can go wrong?</a></p>
    </section>}

    {machine === 'zoom' && <section className="base-section" aria-labelledby="base-zoom">
      <SectionHeading id="zoom" title="Zoom MS-70CDR" status="Beta">
        The MS-70CDR’s base is Luca Matturro’s <a href="https://github.com/matujuice/zoom-ms-midistomp" target="_blank" rel="noreferrer">MIDISTOMP</a>: Zoom’s own firmware 2.10, patched in your browser from Zoom’s updater.
      </SectionHeading>
      <h3 className="base-subhead">What it adds</h3>
      <Steps steps={ZOOM_ADDS} className="base-grid-steps" />
      <div className="base-note">
        <p><strong>Install:</strong> on the pedal page, with Zoom’s MS-70CDR 2.10 updater for Mac (the .zip works on any computer) and Chrome or Edge. Hold Up and Down while you plug the pedal in, then the site flashes it over USB in about a minute.</p>
        <p><strong>Go back:</strong> run Zoom’s own 2.10 updater. It also rewrites the effects area, so back up your effects first. The pedal’s bootloader is never written, so it can always be flashed again.</p>
      </div>
      <p className="base-actions"><a className="button button-primary" href={zoomHubHref('zoom-ms-70cdr')}>Open the MS-70CDR page <Icon name="arrow" size={14} /></a></p>
    </section>}

    {machine === 'rytm' && <section className="base-section" aria-labelledby="base-rytm">
      <SectionHeading id="rytm" title="Analog Rytm MKII" status="Preview">
        The Rytm’s base comes inside the OS file you build for a set. When the set holds a send effect, the base adds a send bus; otherwise it adds only the room for module machines in the machine list.
      </SectionHeading>
      <h3 className="base-subhead">What you see on the Rytm</h3>
      <ScreenGallery screens={RYTM_SCREENS} label="Analog Rytm base screens" />
      <div className="base-note">
        <p><strong>Install:</strong> send the .syx you built with Elektron Transfer and confirm on the Rytm. There is no separate base to install, and no USB sync yet: a new set means a new OS file.</p>
        <p><strong>Go back:</strong> send Elektron’s original .syx the same way.</p>
      </div>
      <p className="base-actions"><a className="button button-quiet" href={deviceHref('analog-rytm-mkii')}>Open the Analog Rytm MKII page <Icon name="arrow" size={14} /></a></p>
    </section>}

    {machine === 'others' && <section className="base-section" aria-labelledby="base-others">
      <SectionHeading id="others" title="Other instruments" status="In the works">
        Every instrument grows the same base as the Octatrack, one step at a time. Each machine page shows how far it has come and the next step anyone can take.
      </SectionHeading>
      <ul className="base-machines">{others.map(device => <li key={device.id}>
        <a href={device.family === 'zoom' ? zoomHubHref(device.id) : deviceHref(device.id)}>
          <strong>{deviceTitle(device)}</strong>
          <span>{baseState(device)}</span>
        </a>
      </li>)}</ul>
    </section>}

    <footer className="base-footer">
      <p>Modwerk is an independent, unofficial project. The base is built from the maker’s firmware on your own computer; do not share the files it makes. Questions not answered here are in <a href="#faq">Help &amp; FAQ</a>.</p>
    </footer>
  </div>
}
