import { useState } from 'react'
import { assetUrl } from '../hosting'
import { DeviceImage, PhotoCredit } from '../devices/DeviceImage'
import { DEVICES, DEVICES_BY_ID, deviceHref, deviceTitle, type DeviceProfile } from '../devices/registry'
import { zoomHubHref } from '../devices/zoom-hub-route'
import { CARD_SET_FILE } from '../engine/elekloader/card-set'
import { MODULE_SKIP_HINT } from '../firmware-notices'
import { Icon, type IconName } from './Icon'
import { BaseChangelog } from './BaseChangelog'
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
  { src: screen('ot-machine-list.png'), alt: 'AMIGA below the stock machines in SELECT MACHINE TYPE', title: 'Find a new machine',
    caption: 'Module machines appear below the stock machines. Module effects appear in the FX1 and FX2 lists.', keys: 'Double-tap a TRACK key' },
  { src: screen('ot-status.png'), alt: 'Octatrack status display with bars for CPU, DSP and memory usage', title: 'Check the load',
    caption: 'Read the base version and see how much processing power and DSP memory your set uses.', keys: 'CUE + PROJ' },
  { src: screen('ot-modules.png'), alt: 'MODULES showing four modules on and Tapehead off', title: 'Switch modules on or off',
    caption: 'Stop playback and press YES to toggle a module. Its setting survives a restart or sync.', keys: 'PROJ › MODWERK › MODULES' },
]
const OCTATRACK_REFERENCE_SCREENS: Screen[] = [
  { src: screen('ot-startup.png'), alt: 'Octatrack display at startup: the Modwerk mark between NEW and BETA, above the word MODWERK', title: 'Startup',
    caption: 'The Modwerk mark docks while the Octatrack starts, so you can see at a glance that the base is running.' },
  { src: screen('ot-project-menu.png'), alt: 'Octatrack PROJECT menu with a fifth row, MODWERK, listing STATUS, MODULE COST, MISSING, SELF TEST and MODULES', title: 'PROJ › MODWERK',
    caption: 'A fifth row in the PROJECT menu with five pages: the load, each module’s share of it, the modules a project misses, a self-test, and your modules switched on and off. The rest of the menu, SYSTEM included, stays as Elektron made it.', keys: 'PROJ' },
  { src: screen('ot-module-cost.png'), alt: 'Octatrack MODULE COST page: Tape Echo, Mini Verb, E-Verb and Air Chorus, with Mini Verb at about 20 percent on tracks 1-4 and E-Verb at about 21 percent on tracks 5-8', title: 'Module cost',
    caption: 'What each installed module costs on each DSP chip, for the tracks that use it, so you can see which to drop when a set gets heavy. A ~ marks an estimate; - means no track uses it there.', keys: 'PROJ › MODWERK › MODULE COST' },
  { src: screen('ot-self-test.png'), alt: 'Octatrack SELF TEST page ending in ALL PASSED', title: 'Self-test',
    caption: 'Checks the modules the Octatrack runs and says ALL PASSED, or what is wrong. Status on Your Octatrack runs the same test from this site.', keys: 'PROJ › MODWERK › SELF TEST' },
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

const SAFETY: Step[] = [
  { icon: 'back', title: 'Restore the original OS',
    text: <>Install Elektron’s original OS from the card with OS UPGRADE. <a href="#faq/return-to-stock">Return to stock instructions</a></> },
  { icon: 'shield', title: 'Two copies of the base', text: 'An update writes only the spare copy. A power cut or a pulled cable during an update leaves the base you had, and a new base that fails to start twice goes back to the previous one by itself.' },
  { icon: 'warn', title: 'A module that crashes is left out', text: 'If the Octatrack crashes or freezes while it loads modules at startup, the next start leaves that module out and says so.' },
  { icon: 'play', title: 'Start without your modules', text: MODULE_SKIP_HINT },
  { icon: 'lock', title: 'Recover over MIDI', text: <>Elektron’s startup menu can receive the original OS from a MIDI interface. <a href="#faq/recover">Startup recovery guide</a></> },
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

function SectionHeading({ id, device, title, status, action, children }: {
  id: string; device: DeviceProfile; title: string; status: string; action: React.ReactNode; children: React.ReactNode
}) {
  return <header className="base-section-heading base-device">
    <div>
      <h2 id={'base-' + id}>{title} <span className="base-status">{status}</span></h2>
      <p>{children}</p>
      <div className="base-actions">
        {action}
        <button type="button" className="text-button" onClick={() => document.getElementById('base-changelog-title')?.focus()}>View changelog</button>
      </div>
    </div>
    <div className="base-device-picture"><DeviceImage device={device} eager /><PhotoCredit device={device} /></div>
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
      <p className="base-definition">The base is your instrument’s original operating system with support for modules built in.</p>
      <dl className="base-overview">
        <div><dt><Icon name="file" />Original OS</dt><dd>The maker’s firmware file. Your copy stays on your computer.</dd></div>
        <div><dt><img src={assetUrl('modwerk-mark.svg')} alt="" />Modwerk base</dt><dd>Built in your browser. It provides the controls and connections modules share.</dd></div>
        <div><dt><Icon name="grid" />Modules</dt><dd>Features you choose, like a tape echo or a drum machine.</dd></div>
      </dl>
    </header>
    <div className="base-picker">
      <span id="base-picker-label">Choose your instrument</span>
      <div className="faq-machines" role="group" aria-labelledby="base-picker-label">{BASE_MACHINES.map(item =>
        <button type="button" key={item.id} aria-pressed={item.id === machine} onClick={() => setMachine(item.id)}>{item.label}</button>)}</div>
    </div>

    {machine === 'octatrack' && <section className="base-section" aria-labelledby="base-octatrack">
      <SectionHeading id="octatrack" device={DEVICES_BY_ID.octatrack} title="Octatrack MKI and MKII" status="Released"
        action={<a className="button button-primary" href="#octatrack/setup">Set up your Octatrack <Icon name="arrow" size={15} /></a>}>
        Install the base once from the card. After that, you can change your module set over USB without reinstalling the OS.
      </SectionHeading>
      <dl className="base-facts">
        <div><dt>What you need</dt><dd><a href="#faq/base-firmware">Original OS 1.40C</a> and a CompactFlash card. For USB sync, use Chrome or Edge on a computer and a USB cable.</dd></div>
        <div><dt>Before you install</dt><dd>Back up your projects. Keep the original OS and a card reader or MIDI interface for recovery. <a href="#faq/risks">Installation risks</a></dd></div>
      </dl>
      <section className="base-workflow"><h3>From setup to your first set</h3>
        <ol className="base-sequence">
          <li><h4>Install the base</h4><p>In Setup, build the .bin and copy it to the card. On the Octatrack, choose <strong>PROJECT › SYSTEM › OS UPGRADE</strong>.</p></li>
          <li><h4>Pick your modules</h4><p>Add effects, machines or tools from the <a href="#library">module library</a> to your set.</p></li>
          <li><h4>Load your set</h4><p>Choose <strong>Sync to Octatrack</strong> over USB, or <a href="#faq/card-set">load {CARD_SET_FILE} from the card</a>. Your modules stay after a restart.</p></li>
        </ol>
      </section>
      <section className="base-workflow"><h3>On your Octatrack</h3>
        <ScreenGallery screens={OCTATRACK_SCREENS} label="Octatrack module controls" />
      </section>
      <details className="base-reference"><summary>More Octatrack screens and messages</summary>
        <ScreenGallery screens={OCTATRACK_REFERENCE_SCREENS} label="More Octatrack base screens" />
        <dl className="base-also">{OCTATRACK_ALSO.map(([name, text]) => <div key={name}><dt>{name}</dt><dd>{text}</dd></div>)}</dl>
      </details>
      <section className="base-workflow base-recovery"><h3>Updates and recovery</h3>
        <p>When Setup offers <strong>Install latest base</strong>, update and sync your set again. To remove the base, <a href="#faq/return-to-stock">reinstall Elektron’s original OS</a>.</p>
        <details className="base-reference"><summary>Startup shortcuts and recovery options</summary><Steps steps={SAFETY} /></details>
      </section>
    </section>}

    {machine === 'zoom' && <section className="base-section" aria-labelledby="base-zoom">
      <SectionHeading id="zoom" device={DEVICES_BY_ID['zoom-ms-70cdr']} title="Zoom MS-70CDR" status="Beta"
        action={<a className="button button-primary" href={zoomHubHref('zoom-ms-70cdr')}>Open the MS-70CDR page <Icon name="arrow" size={15} /></a>}>
        Luca Matturro’s <a href="https://github.com/matujuice/zoom-ms-midistomp" target="_blank" rel="noreferrer">MIDISTOMP</a> base adds MIDI control, clock sync and a mixer. Installing it keeps the effects already on your pedal.
      </SectionHeading>
      <dl className="base-facts">
        <div><dt>What you need</dt><dd>Zoom’s MS-70CDR 2.10 Mac updater (.zip) and a USB cable. The zip works in Chrome or Edge on any computer.</dd></div>
        <div><dt>Return to stock</dt><dd>Back up your effects first. Zoom’s original 2.10 updater rewrites the effects area when it restores the pedal.</dd></div>
      </dl>
      <section className="base-workflow"><h3>Set up MIDISTOMP</h3>
        <ol className="base-sequence">
          <li><h4>Open the updater</h4><p>Hold <strong>Up + Down</strong> while plugging in the pedal to enter its firmware update mode.</p></li>
          <li><h4>Install over USB</h4><p>In <a href={zoomHubHref('zoom-ms-70cdr', 'setup')}>pedal setup</a>, select <strong>Install the base</strong> and choose Zoom’s updater file. The transfer takes about a minute.</p></li>
          <li><h4>Play with MIDI</h4><p>Change patches or effects with MIDI CC, follow MIDI clock or mix saved buses. The base also raises the DSP limit and supports the Looper effect.</p></li>
        </ol>
      </section>
    </section>}

    {machine === 'rytm' && <section className="base-section" aria-labelledby="base-rytm">
      <SectionHeading id="rytm" device={DEVICES_BY_ID['analog-rytm-mkii']} title="Analog Rytm MKII" status="Preview"
        action={<a className="button button-primary" href={deviceHref('analog-rytm-mkii')}>Open the Rytm library <Icon name="arrow" size={15} /></a>}>
        The base and your selected modules travel in one OS file. Build and install a new file each time you change your set.
      </SectionHeading>
      <dl className="base-facts">
        <div><dt>What you need</dt><dd>Your original Rytm MKII OS 1.74 file, a USB cable and Elektron Transfer.</dd></div>
        <div><dt>Return to stock</dt><dd>Send Elektron’s original .syx with Elektron Transfer.</dd></div>
      </dl>
      <section className="base-workflow"><h3>Build and install a set</h3>
        <ol className="base-sequence">
          <li><h4>Choose modules</h4><p>Add drum machines or a send effect from the Rytm library to your set.</p></li>
          <li><h4>Build the OS file</h4><p>Open your set, choose the original OS file and download the resulting .syx.</p></li>
          <li><h4>Send it to the Rytm</h4><p>Drop the .syx into Elektron Transfer. Press <strong>YES</strong> on the Rytm and keep it powered until the update finishes.</p></li>
        </ol>
      </section>
      <section className="base-workflow"><h3>On your Analog Rytm</h3><ScreenGallery screens={RYTM_SCREENS} label="Analog Rytm base screens" /></section>
    </section>}

    {machine === 'others' && <section className="base-section" aria-labelledby="base-others">
      <header className="base-section-heading"><h2 id="base-others">Other instruments</h2><p>Choose a machine to see its firmware support and development progress.</p></header>
      <ul className="base-machines">{others.map(device => <li key={device.id}><a href={device.family === 'zoom' ? zoomHubHref(device.id) : deviceHref(device.id)}>
        <strong>{deviceTitle(device)}</strong><span>{baseState(device)}</span><Icon name="arrow" size={15} />
      </a></li>)}</ul>
    </section>}
    {machine !== 'others' && <BaseChangelog key={machine} machine={machine} />}
    <footer className="base-footer">Share module sets as JSON. Keep firmware files on your computer. <a href="#faq">Help &amp; FAQ</a></footer>
  </div>
}
