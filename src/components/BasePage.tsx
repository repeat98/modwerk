import { useState } from 'react'
import { assetUrl } from '../hosting'
import { DeviceImage } from '../devices/DeviceImage'
import { DEVICES, DEVICES_BY_ID, deviceHref, deviceTitle, type DeviceProfile } from '../devices/registry'
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
// PROJ > MODWERK, the status, MODULE COST and MODULES were read off an MKII running development twins of base 0.7.1's and
// 0.7.2's source (device.mjs png:, 16 November 2026); MODULE COST and MODULES with module effects installed, two on tracks.
const OCTATRACK_SCREENS: Screen[] = [
  { src: screen('ot-startup.png'), alt: 'Octatrack display at startup: the Modwerk mark between NEW and BETA, above the word MODWERK', title: 'Startup',
    caption: 'The Modwerk mark docks while the Octatrack starts, so you can see at a glance that the base is running.' },
  { src: screen('ot-project-menu.png'), alt: 'Octatrack PROJECT menu with a fifth row, MODWERK, listing STATUS, MODULE COST, MISSING, SELF TEST and MODULES', title: 'PROJ › MODWERK',
    caption: 'A fifth row in the PROJECT menu with five pages: the load, each module’s share of it, the modules a project misses, a self-test, and your modules switched on and off. The rest of the menu, SYSTEM included, stays as Elektron made it.', keys: 'PROJ' },
  { src: screen('ot-status.png'), alt: 'Octatrack MODWERK BASE 0.7.2 status dialog with five bars: CPU, DSP T1-4, DSP T5-8, MEM T1-4 and MEM T5-8', title: 'Status, from anywhere',
    caption: 'How busy the Octatrack is right now: the CPU, and each DSP chip by its tracks (DSP). Below, how full each chip’s DSP memory is (MEM). The title names the base version. NO closes it.', keys: 'CUE + PROJ, or PROJ › MODWERK › STATUS' },
  { src: screen('ot-module-cost.png'), alt: 'Octatrack MODULE COST page: Tape Echo, Mini Verb, E-Verb and Air Chorus, with Mini Verb at about 20 percent on tracks 1-4 and E-Verb at about 21 percent on tracks 5-8', title: 'Module cost',
    caption: 'What each installed module costs on each DSP chip, for the tracks that use it, so you can see which to drop when a set gets heavy. A ~ marks an estimate; - means no track uses it there.', keys: 'PROJ › MODWERK › MODULE COST' },
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
  ['MISSING', 'modules the open project uses that the Octatrack doesn’t have or has switched off, machines included, with where each is used, such as BANK A SAVED PART 2 T5, and YES to switch the ones that are off back on. Their tracks say so, MISSING POLY8 or POLY8 IS OFF, instead of going quiet without a word.'],
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
  { icon: 'download', title: 'Install the base once',
    text: <>Setup builds a .bin from your original OS 1.40C file. Copy it to the card, then choose <strong>PROJECT › SYSTEM › OS UPGRADE</strong> on the Octatrack.</> },
  { icon: 'swap', title: 'Choose a module set',
    text: <>Pick modules in the library and choose <strong>Sync to Octatrack</strong>. They load over USB and come back after a restart. You can also <a href="#faq/card-set">load {CARD_SET_FILE} from the card</a>.</> },
  { icon: 'arrow', title: 'Update or return to stock',
    text: <>When your set needs a newer base, Setup offers <strong>Install latest base</strong>. Sync your set again after updating. To go back, <a href="#faq/return-to-stock">reinstall Elektron’s original OS</a>.</> },
]

const SAFETY: Step[] = [
  { icon: 'back', title: 'Restore the original OS',
    text: <>Install Elektron’s original OS from the card with OS UPGRADE. <a href="#faq/return-to-stock">Return to stock instructions</a></> },
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

function Steps({ steps }: { steps: Step[] }) {
  return <ul className="base-steps">{steps.map(step => <li key={step.title}>
    <span className="base-step-icon" aria-hidden="true"><Icon name={step.icon} size={17} /></span>
    <div><h4>{step.title}</h4><p>{step.text}</p></div>
  </li>)}</ul>
}

function SectionHeading({ id, title, status, picture, caption, action, children }: {
  id: string; title: string; status: string; picture: React.ReactNode; caption?: string; action: React.ReactNode; children: React.ReactNode
}) {
  return <header className="base-section-heading base-device">
    <div>
      <h2 id={'base-' + id}>{title} <span className="base-status">{status}</span></h2>
      <p>{children}</p>
      <div className="base-actions">{action}</div>
    </div>
    <figure className="base-device-picture">{picture}{caption && <figcaption>{caption}</figcaption>}</figure>
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
    <header className="base-heading">
      <h1>Base firmware</h1>
      <div className="faq-machines" role="group" aria-label="Machine">{BASE_MACHINES.map(item =>
        <button type="button" key={item.id} aria-pressed={item.id === machine} onClick={() => setMachine(item.id)}>{item.label}</button>)}</div>
      <p className="base-definition">Base firmware is your instrument’s original operating system with support for mods built in. The base gives modules a place to run. Each module adds a feature, such as an effect or a drum machine.</p>
    </header>

    {machine === 'octatrack' && <section className="base-section" aria-labelledby="base-octatrack">
      <SectionHeading id="octatrack" title="Octatrack MKI and MKII" status="Released"
        picture={<img src={screen('ot-status.png')} alt={OCTATRACK_SCREENS[2].alt} />} caption="CPU and DSP load on the Octatrack"
        action={<a className="button button-primary" href="#octatrack/setup">Set up your Octatrack <Icon name="arrow" size={15} /></a>}>
        Module machines and effects appear alongside the stock choices in the track menus. Open <strong>PROJ › MODWERK</strong> to see how much processing power they use or switch individual modules on and off.
      </SectionHeading>
      <dl className="base-facts">
        <div><dt>What you need</dt><dd>Original OS 1.40C and a CompactFlash card. For USB sync, use a USB cable and Chrome or Edge on a computer.</dd></div>
        <div><dt>Before installing</dt><dd>Keep the original OS and a card reader or MIDI interface ready so you can recover if USB stops working. <a href="#faq/risks">Installation risks</a></dd></div>
      </dl>
      <section className="base-workflow"><h3>From the original OS to a module set</h3><Steps steps={OCTATRACK_STEPS} /></section>
      <details className="base-reference"><summary>Recovery and returning to stock</summary><Steps steps={SAFETY} /></details>
      <details className="base-reference"><summary>Octatrack screen guide</summary>
        <ScreenGallery screens={OCTATRACK_SCREENS} label="Octatrack base screens" />
        <dl className="base-also">{OCTATRACK_ALSO.map(([name, text]) => <div key={name}><dt>{name}</dt><dd>{text}</dd></div>)}</dl>
      </details>
    </section>}

    {machine === 'zoom' && <section className="base-section" aria-labelledby="base-zoom">
      <SectionHeading id="zoom" title="Zoom MS-70CDR" status="Beta"
        picture={<DeviceImage device={DEVICES_BY_ID['zoom-ms-70cdr']} />}
        action={<a className="button button-primary" href={zoomHubHref('zoom-ms-70cdr')}>Open the MS-70CDR page <Icon name="arrow" size={15} /></a>}>
        Luca Matturro’s <a href="https://github.com/matujuice/zoom-ms-midistomp" target="_blank" rel="noreferrer">MIDISTOMP</a> adds MIDI control, clock sync and a mixer to Zoom firmware 2.10.
      </SectionHeading>
      <dl className="base-facts">
        <div><dt>What you need</dt><dd>Zoom’s MS-70CDR 2.10 Mac updater (.zip) and Chrome or Edge. The zip works on any computer.</dd></div>
        <div><dt>Before restoring</dt><dd>Back up your effects. Zoom’s original updater rewrites the effects area.</dd></div>
      </dl>
      <section className="base-workflow"><h3>Install or restore firmware</h3>
        <p>Hold Up and Down while plugging in the pedal, then use the pedal page to install over USB. The transfer takes about a minute. To restore the original firmware, run Zoom’s 2.10 updater.</p>
      </section>
      <section className="base-workflow base-features"><h3>What MIDISTOMP adds</h3><Steps steps={ZOOM_ADDS} /></section>
    </section>}

    {machine === 'rytm' && <section className="base-section" aria-labelledby="base-rytm">
      <SectionHeading id="rytm" title="Analog Rytm MKII" status="Preview"
        picture={<img src={screen('rytm-send-fx.png')} alt={RYTM_SCREENS[1].alt} />} caption="Send effect on the FX track"
        action={<a className="button button-primary" href={deviceHref('analog-rytm-mkii')}>Open the Rytm library <Icon name="arrow" size={15} /></a>}>
        The OS file you build for each set includes the base. New drum machines appear in the track’s machine list. Add a send effect and each track gets a SEND FX page, with the effect controls on the FX track.
      </SectionHeading>
      <dl className="base-facts">
        <div><dt>Installation</dt><dd>Each set needs a new OS file. Send the .syx with Elektron Transfer and confirm on the Rytm.</dd></div>
        <div><dt>Return to stock</dt><dd>Send Elektron’s original .syx with Elektron Transfer.</dd></div>
      </dl>
      <details className="base-reference"><summary>Analog Rytm screen guide</summary><ScreenGallery screens={RYTM_SCREENS} label="Analog Rytm base screens" /></details>
    </section>}

    {machine === 'others' && <section className="base-section" aria-labelledby="base-others">
      <header className="base-section-heading"><h2 id="base-others">Other instruments</h2><p>Choose a machine to see its firmware support and development progress.</p></header>
      <ul className="base-machines">{others.map(device => <li key={device.id}><a href={device.family === 'zoom' ? zoomHubHref(device.id) : deviceHref(device.id)}>
        <strong>{deviceTitle(device)}</strong><span>{baseState(device)}</span><Icon name="arrow" size={15} />
      </a></li>)}</ul>
    </section>}
    <footer className="base-footer">Firmware is built locally from your own OS file. Share your set as JSON and keep firmware files on your computer. <a href="#faq">Help &amp; FAQ</a></footer>
  </div>
}
