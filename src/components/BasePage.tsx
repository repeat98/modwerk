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
  { src: screen('ot-project-menu.png'), alt: 'Octatrack PROJECT menu with MODWERK selected and its five menu entries visible', title: 'The MODWERK menu',
    caption: 'Open the new PROJECT menu entry for status, diagnostics and module controls.', keys: 'PROJ › MODWERK' },
  { src: screen('ot-machine-list.png'), alt: 'AMIGA below the stock machines in SELECT MACHINE TYPE', title: 'Machines and effects',
    caption: 'Installed machines join the track menu. Effects appear in FX1 and FX2.', keys: 'Double-tap TRACK' },
  { src: screen('ot-modules.png'), alt: 'MODULES showing four enabled modules and Tapehead switched off', title: 'Module switches',
    caption: 'Stop playback and press YES to switch a module on or off.', keys: 'PROJ › MODWERK › MODULES' },
  { src: screen('ot-status.png'), alt: 'Octatrack status display with CPU and separate DSP and memory bars for tracks 1–4 and 5–8', title: 'System load',
    caption: 'See total CPU, plus DSP load and memory for tracks 1–4 and 5–8.', keys: 'CUE + PROJ' },
  { src: screen('ot-module-cost.png'), alt: 'MODULE COST showing Mini Verb on tracks 1–4 and E-Verb on tracks 5–8', title: 'DSP per module',
    caption: 'Find which effect uses the most processing time on each DSP chip.', keys: 'PROJ › MODWERK › MODULE COST' },
  { src: screen('ot-self-test.png'), alt: 'Octatrack SELF TEST page ending in ALL PASSED', title: 'Module self-test',
    caption: 'Check the running modules and read any problems the unit finds.', keys: 'PROJ › MODWERK › SELF TEST' },
]
const OCTATRACK_REFERENCE_SCREENS: Screen[] = [
  { src: screen('ot-startup.png'), alt: 'Octatrack startup display with the Modwerk mark', title: 'Startup',
    caption: 'The Modwerk mark appears when the base starts.' },
  { src: screen('ot-base-update.png'), alt: 'Octatrack BASE UPDATE display receiving a new base at 49 percent', title: 'Follow a base update',
    caption: 'Keep the power on during the transfer. BASE SAVED confirms the update. NOT SAVED leaves the previous base in place.' },
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
const ORIGINAL_OS: Record<Exclude<BaseMachine, 'others'>, string> = {
  octatrack: 'OS 1.40C',
  zoom: 'Zoom 2.10 updater',
  rytm: 'OS 1.74',
}

function FirmwareStack({ machine }: { machine: Exclude<BaseMachine, 'others'> }) {
  const original = ORIGINAL_OS[machine]
  const Heading = machine === 'octatrack' ? 'h3' : 'h2'
  return <section className="base-stack" aria-labelledby="base-stack-title">
    <Heading id="base-stack-title">The firmware stack</Heading>
    <div className="base-stack-diagram">
      <img src={screen('firmware-stack.svg')} alt="" width={400} height={218} />
      <dl className="base-stack-layers">
        <div><dt>Modules</dt><dd>Your choice of machines, effects and tools.</dd></div>
        <div><dt>{machine === 'zoom' ? 'MIDISTOMP base' : 'Modwerk base'}</dt><dd>{machine === 'octatrack' ? 'Install once to load and manage module sets.' : machine === 'zoom' ? 'Adds MIDI control, clock sync and a mixer.' : 'Adds shared support for your selected modules.'}</dd></div>
        <div><dt>Original OS</dt><dd>Your own {original} file, read locally.</dd></div>
      </dl>
    </div>
  </section>
}

function ScreenGallery({ screens, label }: { screens: Screen[]; label: string }) {
  return <ul className="base-screens" aria-label={label}>{screens.map(item => <li key={item.src} className="base-screen">
    <figure>
      <div className="base-lcd"><img src={item.src} alt={item.alt} loading="lazy" decoding="async" /></div>
      <figcaption>
        <h4>{item.title}</h4>
        <p>{item.caption}</p>
        {item.keys && <p className="base-keys"><span className="sr-only">Open with: </span><kbd>{item.keys}</kbd></p>}
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

function SectionHeading({ id, title, status, action, children }: {
  id: string; title: string; status: string; action: React.ReactNode; children: React.ReactNode
}) {
  return <header className="base-section-heading base-device">
    <div>
      <h2 id={'base-' + id}>{title} <span className="base-status">{status}</span></h2>
      <p>{children}</p>
    </div>
    <div className="base-actions">{action}</div>
  </header>
}

function DeviceFacts({ device, children }: { device: DeviceProfile; children: React.ReactNode }) {
  return <div className="base-device-facts">
    <dl className="base-facts">{children}</dl>
    <div className="base-device-picture"><DeviceImage device={device} /><PhotoCredit device={device} /></div>
  </div>
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
      <div className="base-picker">
        <div className="faq-machines" role="group" aria-label="Choose your instrument">{BASE_MACHINES.map(item =>
          <button type="button" key={item.id} aria-pressed={item.id === machine} onClick={() => setMachine(item.id)}>{item.label}</button>)}</div>
      </div>
    </header>
    {(machine === 'zoom' || machine === 'rytm') && <FirmwareStack machine={machine} />}

    {machine === 'octatrack' && <section className="base-section" aria-labelledby="base-octatrack">
      <header className="base-section-heading base-device ot-intro">
        <div>
          <h2 id="base-octatrack">Octatrack MKI and MKII <span className="base-status">Released</span></h2>
          <p>Load a set of machines and effects over USB. The base adds a MODWERK menu under PROJECT where you can check the load and switch modules on or off.</p>
          <div className="base-actions">
            <a className="button button-primary" href="#octatrack/setup">Set up your Octatrack <Icon name="arrow" size={15} /></a>
            <button type="button" className="text-button" onClick={() => document.getElementById('base-changelog-title')?.focus()}>Read changelog</button>
          </div>
        </div>
        <FirmwareStack machine="octatrack" />
      </header>
      <section className="ot-controls" aria-labelledby="ot-controls-title">
        <h3 id="ot-controls-title">Octatrack controls</h3>
        <ScreenGallery screens={OCTATRACK_SCREENS} label="Octatrack module controls" />
        <details className="base-reference"><summary>Startup, updates and display messages</summary>
          <ScreenGallery screens={OCTATRACK_REFERENCE_SCREENS} label="More Octatrack base screens" />
          <dl className="base-also">{OCTATRACK_ALSO.map(([name, text]) => <div key={name}><dt>{name}</dt><dd>{text}</dd></div>)}</dl>
        </details>
      </section>
      <BaseChangelog machine="octatrack" />
      <section className="ot-install" aria-labelledby="ot-install-title">
        <div className="ot-install-intro">
          <h3 id="ot-install-title">Installation and recovery</h3>
          <p>Back up your projects. For the first install, have your <a href="#faq/base-firmware">original OS 1.40C file</a> and a CompactFlash card ready.</p>
          <p>Keep the original OS and a card reader or MIDI interface for recovery.</p>
          <div className="base-actions"><a className="button button-primary" href="#octatrack/setup">Open Octatrack setup <Icon name="arrow" size={15} /></a><a href="#faq/risks">Installation risks</a></div>
        </div>
        <div className="ot-install-topics">
          <details className="base-reference"><summary>Install the base from a card</summary>
            <p>Build the .bin in Setup and copy it to your CompactFlash card. On the Octatrack, open <strong>PROJECT › SYSTEM › OS UPGRADE</strong>.</p>
          </details>
          <details className="base-reference"><summary>Load or change your module set</summary>
            <p>Choose your modules in the <a href="#library">library</a>. Connect a USB cable and select <strong>Sync to Octatrack</strong> in Chrome or Edge on your computer. You can also <a href="#faq/card-set">load {CARD_SET_FILE} from the card</a>. The set survives a restart.</p>
          </details>
          <details className="base-reference"><summary>Update the base</summary>
            <p>When Setup offers <strong>Install latest base</strong>, install the update and sync your module set again.</p>
          </details>
          <details className="base-reference"><summary>Recover or return to the original OS</summary><Steps steps={SAFETY} /></details>
        </div>
      </section>
    </section>}

    {machine === 'zoom' && <section className="base-section" aria-labelledby="base-zoom">
      <SectionHeading id="zoom" title="Zoom MS-70CDR" status="Beta"
        action={<a className="button button-primary" href={zoomHubHref('zoom-ms-70cdr')}>Open the MS-70CDR page <Icon name="arrow" size={15} /></a>}>
        Luca Matturro’s <a href="https://github.com/matujuice/zoom-ms-midistomp" target="_blank" rel="noreferrer">MIDISTOMP</a> base adds MIDI control, clock sync and a mixer. Installing it keeps the effects already on your pedal.
      </SectionHeading>
      <BaseChangelog machine="zoom" />
      <DeviceFacts device={DEVICES_BY_ID['zoom-ms-70cdr']}>
        <div><dt>What you need</dt><dd>Zoom’s MS-70CDR 2.10 Mac updater (.zip) and a USB cable. The zip works in Chrome or Edge on any computer.</dd></div>
        <div><dt>Return to stock</dt><dd>Back up your effects first. Zoom’s original 2.10 updater rewrites the effects area when it restores the pedal.</dd></div>
      </DeviceFacts>
      <section className="base-workflow"><h3>Set up MIDISTOMP</h3>
        <ol className="base-sequence">
          <li><h4>Open the updater</h4><p>Hold <strong>Up + Down</strong> while plugging in the pedal to enter its firmware update mode.</p></li>
          <li><h4>Install over USB</h4><p>In <a href={zoomHubHref('zoom-ms-70cdr', 'setup')}>pedal setup</a>, select <strong>Install the base</strong> and choose Zoom’s updater file. The transfer takes about a minute.</p></li>
          <li><h4>Play with MIDI</h4><p>Change patches or effects with MIDI CC, follow MIDI clock or mix saved buses. The base also raises the DSP limit and supports the Looper effect.</p></li>
        </ol>
      </section>
    </section>}

    {machine === 'rytm' && <section className="base-section" aria-labelledby="base-rytm">
      <SectionHeading id="rytm" title="Analog Rytm MKII" status="Preview"
        action={<a className="button button-primary" href={deviceHref('analog-rytm-mkii')}>Open the Rytm library <Icon name="arrow" size={15} /></a>}>
        The base and your selected modules travel in one OS file. Build and install a new file each time you change your set.
      </SectionHeading>
      <BaseChangelog machine="rytm" />
      <DeviceFacts device={DEVICES_BY_ID['analog-rytm-mkii']}>
        <div><dt>What you need</dt><dd>Your original Rytm MKII OS 1.74 file, a USB cable and Elektron Transfer.</dd></div>
        <div><dt>Return to stock</dt><dd>Send Elektron’s original .syx with Elektron Transfer.</dd></div>
      </DeviceFacts>
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
    {machine !== 'octatrack' && <footer className="base-footer">Share module sets as JSON. Keep firmware files on your computer. <a href="#faq">Help &amp; FAQ</a></footer>}
  </div>
}
