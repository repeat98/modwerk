import { BackLink } from './BackLink'
import { INDEPENDENCE_NOTICE, FLASHING_RISKS } from '../firmware-notices'
import { isValidElement, useState } from 'react'
import type { ReactNode } from 'react'
import { BASE_FIRMWARE } from '../engine/base'
import { DOWNLOADS_ENABLED, DSP_LOADER } from '../engine/protocol'
import { Icon } from './Icon'

const OFFICIAL_OS = 'https://www.elektron.se/wp-content/uploads/2025/03/OCTATRACK_OS1.40C_dist.zip'
const RELEASE_NOTES = 'https://www.elektron.se/wp-content/uploads/2025/03/OCTATRACK_OS1.40C_readme.pdf'
const MKII_MANUAL = 'https://www.elektron.se/wp-content/uploads/2024/09/Octatrack-MKII-User-Manual_ENG_OS1.40A_210414.pdf'
const MKI_MANUAL = 'https://www.elektron.se/wp-content/uploads/2024/09/Octatrack-User-Manual_ENG-OS1.40A_220204.pdf'

function OfficialLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer">{children} <span aria-hidden="true">↗</span></a>
}

function ManualLinks({ recovery = false }: { recovery?: boolean }) {
  return <p className="faq-source">Elektron manuals, §{recovery ? '18.3' : '8.5.2'}: <OfficialLink href={MKII_MANUAL + '#page=' + (recovery ? '112' : '33')}>MKII</OfficialLink> · <OfficialLink href={MKI_MANUAL + '#page=' + (recovery ? '113' : '33')}>MKI</OfficialLink></p>
}

type Question = { id: string; title: string; keywords: string; answer: ReactNode }
type FaqSection = { title: string; questions: Question[] }

const SECTIONS: FaqSection[] = [
  {
    title: 'Getting started',
    questions: [
      {
        id: 'what-is-modwerk',
        title: 'What is Modwerk? Is it official Elektron firmware?',
        keywords: 'octamod octabam custom experimental configurator endorsed supported warranty digitakt digitone machines',
        answer: <>
          <p>Modwerk brings together firmware modules for Elektron machines. Choose your machine, explore its modules and keep a separate configuration for each device. Octatrack modules use octabam; Digitakt and Digitone modules use their own machine-specific SDK.</p>
          <p>{INDEPENDENCE_NOTICE} {FLASHING_RISKS} Local build checks cannot guarantee hardware safety.</p>
        </>,
      },
      {
        id: 'supported-machines',
        title: 'Which machines and OS versions can I use?',
        keywords: 'compatibility supported model hardware device octatrack mki mkii digitakt mk1 digitone keys 1.40c 1.53 1.54 1.43 1.44 preview research',
        answer: <>
          <p><strong>Octatrack MKI and MKII:</strong> the original OS {BASE_FIRMWARE.version} .bin is the base for browser builds. Review each module’s evidence for your model.</p>
          <p><strong>Digitakt mk1:</strong> OS 1.53 or 1.54 .syx. <strong>Digitone mk1 and Digitone Keys:</strong> OS 1.43 or 1.44 .syx. These machines are in preview: you can plan module combinations, but builds and downloads await verification. Support for these models does not include Digitakt II or Digitone II.</p>
          <p>Other machine pages may show research or an invitation to contribute. A machine listing does not mean firmware builds are available. Check the machine’s status and each module’s supported releases before choosing an OS file.</p>
        </>,
      },
      {
        id: 'base-firmware',
        title: 'Where do I get the original firmware file?',
        keywords: 'download base original stock official elektron os 1.40c bin syx zip extract digitakt digitone',
        answer: <>
          <p>Download the original OS from Elektron for your exact machine and a release listed in its Configuration page. Unzip the archive before choosing a file. Modwerk verifies the original file; a renamed, modified or unsupported OS cannot be used as the base.</p>
          <p><strong>Octatrack:</strong> download <OfficialLink href={OFFICIAL_OS}>the original OS {BASE_FIRMWARE.version} archive</OfficialLink> and choose <code>{BASE_FIRMWARE.filename}</code> in <a href="#configuration">Octatrack Configuration</a>. Choose the .bin, not the ZIP or .syx. This exact version is required even if Elektron releases a newer one.</p>
          <p><strong>Digitakt and Digitone:</strong> choose the original .syx for a supported release in that machine’s Configuration page. Find OS archives and manuals on <OfficialLink href="https://www.elektron.se/support-downloads/digitakt#resources">Elektron’s Digitakt page</OfficialLink> or <OfficialLink href="https://www.elektron.se/support-downloads/digitone#resources">Digitone page</OfficialLink>. If an older supported release is unavailable, ask Elektron; do not use a firmware file from another person.</p>
          <p>The original file is the starting point for your build. It does not contain the modules you select in Modwerk.</p>
        </>,
      },
      {
        id: 'mods-stability',
        title: 'Are the mods stable?',
        keywords: 'stable stability reliable reliability testing stress project cycles memory modulation hardware emulator performance live configuration',
        answer: <>
          <p>Test records describe what was checked on a particular version and setup. They do not guarantee that your combination of modules, machine model and workload will behave reliably.</p>
          <p>New modules and updates must provide the following evidence for owner review:</p>
          <ol>
            <li>Worst-case cycle counts under parameter extremes, simultaneous modulation, mode changes and maximum supported load, within the available processing budget.</li>
            <li>Exact memory accounting for code, state, tables, buffers, stack/heap and shared allocations, including totals at the maximum instance count.</li>
            <li>Module-specific emulator/native checks and real-hardware evidence tied to the module version and tested source/build. Record the model, OS, tester, date, duration, workload, observed behavior and limitations. Emulator results or a reported functional test must not be presented as full hardware qualification.</li>
            <li>Complete module documentation, a short practical tutorial and actual hardware or emulator screenshots of the selection location and relevant controls. The owner reviews the documentation and test evidence before release.</li>
          </ol>
          <p>New Octatrack modules and updates need a hardware report from a real unit that states its model, how long it ran, the workload and the limitations. There is no fixed minimum duration. The owner verifies the actual cycle, memory and hardware reports before merge.</p>
          <p>Emulator results cannot replace hardware testing. Existing modules retain their recorded evidence; read each module’s test conditions and limitations rather than assuming every configuration has been tested.</p>
          <p><strong>Always test your own configuration before relying on it.</strong> Start with a fresh Octatrack project after installing a new build, then rehearse your actual track count, module combinations, modulation, recording, streaming and transitions for a sustained run. Repeat after changing modules or versions, and keep a tested fallback for performances or important recordings.</p>
          {!DOWNLOADS_ENABLED && <p>Octatrack firmware downloads remain paused. Wait for the updated build to complete verification before installing a custom build from Modwerk.</p>}
        </>,
      },
      {
        id: 'build-firmware',
        title: 'How do I prepare a configuration and build firmware?',
        keywords: 'select add modules configuration choose file build download json',
        answer: <>
          <ol>
            <li>Open your machine’s <a href="#library">module library</a>, read the module pages and add the modules you want. Modules belong to one machine and cannot be combined across devices.</li>
            <li>Open that machine’s Configuration page and choose the original OS file it requests. For Octatrack, use <code>{BASE_FIRMWARE.filename}</code>.</li>
            <li>Review compatibility messages and use the suggested fixes to resolve any errors before building.</li>
            <li>When building is available for your machine, read the flashing risks, tick the acknowledgement and choose <strong>Build firmware</strong>. Keep the tab open until it finishes.</li>
            <li>{DOWNLOADS_ENABLED ? <>For Octatrack, choose <strong>Download .bin</strong> when the finished file is ready.</> : 'Downloads are paused. You can check that a supported configuration builds, but Modwerk will not offer a firmware file until verification is complete.'}</li>
          </ol>
          <p>Digitakt and Digitone are in preview. Planning a combination or verifying its original OS does not unlock a firmware download.</p>
          <p>For Octatrack, <strong>Export configuration</strong> saves a JSON backup of your choices. It is not a firmware file and cannot be flashed.</p>
        </>,
      },
    ],
  },
  {
    title: 'Octatrack flashing & recovery',
    questions: [
      {
        id: 'before-flashing',
        title: 'What should I do before flashing an Octatrack?',
        keywords: 'backup projects banks samples card sync restore safety risk memory',
        answer: <>
          <p>In the PROJECT menu’s PROJECT section, save your project and choose <strong>SYNC TO CARD</strong>. Then copy the entire CompactFlash card to your computer, including projects, banks and samples. Keep both the official .bin and .syx files available, and read the recovery procedure before installing custom firmware.</p>
          <p>After installing a new firmware build, create and open a fresh project on your Octatrack. Older projects that use stock effects replaced by your modules are not compatible with the modified firmware. Removing stock FX2 effects can also make existing projects incompatible. Keep your original project backups.</p>
          <p>Use a stable power supply and allow the update and startup to finish completely. Review module limitations and test your fresh project before using custom firmware in a live set. Some module configurations reserve about 10 MB of sample memory. The finished build explains whether your selection uses this reservation.</p>
          <p className="faq-source"><OfficialLink href={RELEASE_NOTES}>Elektron OS 1.40C update and backup instructions</OfficialLink></p>
        </>,
      },
      {
        id: 'flash-card',
        title: 'How do I flash an Octatrack .bin from the CompactFlash card?',
        keywords: 'install update upgrade usb disk mode cf root eject system yes',
        answer: <>
          {!DOWNLOADS_ENABLED && <p><strong>Octatrack downloads are paused.</strong> These steps also apply to installing the official Elektron .bin. Wait for Octatrack downloads to resume before installing a custom build from this site.</p>}
          <ol>
            <li>Connect the Octatrack to your computer by USB. Open <strong>PROJECT → SYSTEM → USB DISK MODE</strong> and press <strong>YES</strong> (ENTER/YES on MKI).</li>
            <li>Copy the firmware .bin to the card’s root: the top level, outside every folder.</li>
            <li>Safely eject the Octatrack drive on your computer, then leave USB DISK MODE.</li>
            <li>Open <strong>PROJECT → SYSTEM → OS UPGRADE</strong>, press <strong>YES</strong> and confirm the update.</li>
            <li>Wait until updating and startup have fully finished, or the device asks you to restart. Never disconnect power during the update.</li>
          </ol>
          <p>After completion, confirm the OS version in the system status screen. Once startup has fully finished, power-cycle before testing a custom build with a copy of a project.</p>
          <ManualLinks />
        </>,
      },
      {
        id: 'bin-or-syx',
        title: 'Can I update an Octatrack over USB or MIDI?',
        keywords: 'midi din interface cable sysex transfer format rename',
        answer: <>
          <p>A .bin is for an update from the CompactFlash card. USB DISK MODE lets you copy that file to the card. A .syx is for sending an update through a MIDI interface into the Octatrack’s 5-pin DIN MIDI IN.</p>
          <p>The Octatrack’s USB port cannot receive a MIDI OS upgrade. Modwerk’s Octatrack download format is .bin; for MIDI recovery, use the original .syx from Elektron’s archive. Renaming a .bin to .syx does not convert it.</p>
          <ManualLinks recovery />
        </>,
      },
      {
        id: 'recover',
        title: 'How do I recover an Octatrack that will not boot?',
        keywords: 'restore stock original stuck frozen failed boot startup func function trig 3 midi upgrade sysex',
        answer: <>
          <p>If an update is still running, keep power connected. If it has finished and the unit will not boot, try the MIDI update procedure in the startup menu:</p>
          <ol>
            <li>Connect your computer’s MIDI interface OUT to the Octatrack’s DIN MIDI IN.</li>
            <li>With the Octatrack off, hold <strong>FUNC</strong> (FUNCTION on MKI) while powering it on.</li>
            <li>Press <strong>TRIG 3</strong> for <strong>MIDI UPGRADE</strong> and wait for the receive prompt.</li>
            <li>Send Elektron’s original <code>OCTATRACK_OS1.40C.syx</code> with a SysEx application, such as Elektron Transfer, using the connected MIDI output.</li>
            <li>Wait for the transfer, flash update and startup to finish. Follow any restart prompt.</li>
          </ol>
          <p>Recovery is not guaranteed. If the startup menu is unavailable or the official update fails, contact <OfficialLink href="https://www.elektron.se/support">Elektron support</OfficialLink>. EMPTY RESET clears settings and is not a firmware reinstall.</p>
          <ManualLinks recovery />
        </>,
      },
      {
        id: 'return-to-stock',
        title: 'Can I return an Octatrack to the original Elektron OS?',
        keywords: 'revert uninstall downgrade restore stock backup project',
        answer: <>
          <p>If the Octatrack boots, install the original <code>{BASE_FIRMWARE.filename}</code> from Elektron using the CompactFlash procedure above. If it does not boot, try the official .syx through the startup menu’s MIDI UPGRADE.</p>
          <p>Keep your backups: projects saved with custom modules may not behave correctly under the original OS. Elektron does not support OS downgrades and warns that user content may be lost.</p>
          <p className="faq-source"><OfficialLink href={RELEASE_NOTES}>Elektron’s update and downgrade guidance</OfficialLink></p>
        </>,
      },
    ],
  },
  {
    title: 'Digitakt & Digitone',
    questions: [
      {
        id: 'digi-preview',
        title: 'What can I do while Digitakt and Digitone are in preview?',
        keywords: 'digitakt digitone preview available build verification download module combinations memory conflicts standalone',
        answer: <>
          <p>Read the module documentation, select modules in a configuration and review supported OS releases, memory use and conflicts. Where the firmware chooser is available, you can verify and save your original .syx locally. Builds and downloads remain unavailable while verification is incomplete.</p>
          <p>Two modules may need the same machine slot, control, memory area or firmware change. Follow the conflict message and remove one of the affected modules. A standalone firmware module must be used on its own. A combination that fits is not proof that it works on hardware.</p>
        </>,
      },
      {
        id: 'digi-flashing',
        title: 'How are Digitakt and Digitone OS files installed?',
        keywords: 'digitakt digitone keys syx usb midi elektron transfer update upgrade yes compactflash bin',
        answer: <>
          <p><strong>Modwerk’s Digitakt and Digitone downloads await verification.</strong> The following is Elektron’s procedure for installing an official OS. Back up your projects and sounds, keep the original OS and follow the manual for your model.</p>
          <ol>
            <li>Unzip the official OS archive. Connect the machine to your computer by USB and open Elektron Transfer.</li>
            <li>Select the machine as Transfer’s MIDI input and output, then connect.</li>
            <li>Drop the original .syx onto Transfer’s <strong>Drop files here</strong> area.</li>
            <li>When prompted, press <strong>YES</strong> on the machine and follow its instructions. Keep power connected until the upgrade and startup have finished.</li>
          </ol>
          <p>The Octatrack’s CompactFlash .bin procedure does not apply to these machines. Renaming a .bin to .syx does not convert it.</p>
          <p className="faq-source"><OfficialLink href="https://support.elektron.se/support/solutions/articles/43000662890-how-to-update-your-device">Elektron’s USB OS update instructions</OfficialLink></p>
        </>,
      },
      {
        id: 'digi-recovery',
        title: 'How do I recover a Digitakt or Digitone that will not boot?',
        keywords: 'digitakt digitone keys recovery restore stock startup midi din sysex transfer usb failed boot',
        answer: <>
          <p>Keep power connected while an update is running. If it has finished and the machine will not boot, follow the model’s startup-menu OS upgrade procedure using Elektron’s original .syx.</p>
          <p>In Elektron Transfer, open <strong>SYSEX TRANSFER</strong> and choose <strong>OS upgrade via device startup menu</strong>. Load the official OS file and follow the instructions for that machine. Startup-menu upgrades require a physical MIDI interface connected to the machine’s MIDI port; USB cannot carry this recovery update.</p>
          <p>Recovery is not guaranteed. If the startup menu is unavailable or the original OS will not install, contact <OfficialLink href="https://www.elektron.se/support">Elektron support</OfficialLink>.</p>
          <p className="faq-source"><OfficialLink href="https://support.elektron.se/support/solutions/articles/43000662701-how-to-update-your-device-via-sysex-transfer">Elektron’s SysEx and startup-menu update instructions</OfficialLink></p>
        </>,
      },
    ],
  },
  {
    title: 'Troubleshooting',
    questions: [
      {
        id: 'download-status',
        title: 'Why is there no firmware download button?',
        keywords: 'paused disabled missing ready built hardware audio effects load failed preview digitakt digitone',
        answer: <>
          <p>{DOWNLOADS_ENABLED ? 'The download button appears only after a successful build. Choose the original base firmware, add supported modules, resolve configuration errors and acknowledge the flashing risks first.' : 'Firmware downloads are paused. The built-in logger is undergoing verification. Downloads will resume after the updated builds have passed review.'}</p>
          <p>That download status applies to Octatrack. Digitakt and Digitone remain in preview with builds and downloads awaiting verification.</p>
          <p>A build that fits and passes local file checks is not proof that it will work on hardware. You can still export your configuration as JSON.</p>
        </>,
      },
      {
        id: 'rejected-file',
        title: 'Why does Modwerk reject my firmware file?',
        keywords: 'invalid size fingerprint verification checksum wrong version modified syx zip https',
        answer: <>
          <p>Use the original file for the selected machine and a supported OS release. For Octatrack, Modwerk accepts only <code>{BASE_FIRMWARE.filename}</code>; for Digitakt and Digitone, use the supported original .syx. Extract the archive again if needed. A ZIP, a file for another machine, an unsupported release or already modified firmware cannot be the base. Renaming a file will not make it valid.</p>
          <p>If the message mentions HTTPS, open Modwerk at its secure HTTPS address. A local preview works on localhost; an unsecured preview over Wi-Fi cannot verify firmware.</p>
        </>,
      },
      {
        id: 'configuration-errors',
        title: 'What if my Octatrack modules do not fit or a module is unavailable?',
        keywords: 'compatibility placement memory capacity stock fx2 versions pending verification paused crackling',
        answer: <>
          <p>Follow the message in Configuration and use the suggested compatible choices. For a capacity error, remove a module and check the revised configuration again. {DSP_LOADER ? <>You can also turn off <strong>Keep stock FX2 effects</strong> for a shorter FX2 menu.</> : <>Custom effects take the space of the original FX2 reverbs they need (Spring, Plate or Dark), and only those are left out of the FX2 menu. The build summary names them. If the module menus need more room, the FX2 menu lists only your modules.</>} All original FX1 effects remain available.</p>
          <p>Saved configurations and imported backups automatically use the current module versions. Review the module pages for changes; each build checks the current selection again. Modules marked <strong>Build verification pending</strong> cannot be included in a build yet. A temporarily withdrawn module must be removed from an older saved configuration before building.</p>
        </>,
      },
      {
        id: 'card-file',
        title: 'Why can’t the Octatrack find the update on my card?',
        keywords: 'bin cf compactflash root folder zip json extension eject copy missing upgrade',
        answer: <>
          <p>Check that the extracted .bin is at the top level of the CompactFlash card, outside all folders. A ZIP archive, .syx or configuration JSON is not a card update. Confirm the copy completed and safely eject the drive before choosing OS UPGRADE.</p>
          <p>Follow the instructions for your model if the unit reports an error. Do not interrupt an update already in progress.</p>
          <ManualLinks />
        </>,
      },
    ],
  },
  {
    title: 'Privacy & sharing',
    questions: [
      {
        id: 'local-firmware',
        title: 'Is my firmware uploaded? How do I remove it?',
        keywords: 'privacy device browser saved storage indexeddb cache clear forget offline sync',
        answer: <>
          <p>Your firmware stays in this browser on your device. Where the firmware chooser is available, Modwerk saves the verified original file separately for each machine and verifies it again when you return. It is never uploaded, synced, logged or included in configuration exports.</p>
          <p>Open the relevant machine’s Configuration page and choose <strong>Remove from device</strong> below Base firmware to delete that machine’s saved copy from Modwerk. This does not delete your original download or uninstall firmware from your hardware. Clearing browser site data also removes local configurations and the saved file.</p>
        </>,
      },
      {
        id: 'share-configuration',
        title: 'Can I share my configuration or a finished firmware file?',
        keywords: 'export import json backup send copyright redistribute bin syx modules',
        answer: <>
          <p>For Octatrack, share the JSON file from <strong>Export configuration</strong>. Another Octatrack owner can use <strong>Import JSON</strong> from the actions menu (<strong>⋯</strong>) in Configuration and supply their own original OS {BASE_FIRMWARE.version} file. Your browser’s saved configurations do not sync between devices automatically.</p>
          <p>Do not redistribute original or built firmware .bin or .syx files: they contain Elektron’s copyrighted OS. Share your module choices instead.</p>
        </>,
      },
      {
        id: 'community',
        title: 'Do I need an account? How do I report a module issue?',
        keywords: 'guest comments ratings likes email sign in bug author community github contribution',
        answer: <>
          <p>Browsing and the configurator work without an account. To post in the forum, comment, rate, like or use <strong>Report an issue</strong>, register and verify your email. Your email address stays private. New issue reports become public GitHub issues, where the module developers track and fix bugs. You don’t need a GitHub account: their replies and fixes appear in your notifications. When the problem comes from a combination of modules, use <strong>Report a problem</strong> on your configuration: every module’s developers see it. Manage private configuration details and logs in <a href="#account">Your account</a>.</p>
          <p>Describe the module, your machine and model, the displayed OS version and how to reproduce the problem. Never attach firmware. Module contributions and updates go through GitHub pull requests and owner review; see <a href="#submit">Start developing</a>.</p>
        </>,
      },
    ],
  },
]

function answerText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(answerText).join(' ')
  if (isValidElement<{ children?: ReactNode }>(node)) return answerText(node.props.children)
  return ''
}

const SEARCH_TEXT = new Map(SECTIONS.flatMap(section => section.questions.map(question => [
  question.id,
  (section.title + ' ' + question.title + ' ' + question.keywords + ' ' + answerText(question.answer)).toLowerCase(),
])))

export function FaqPage() {
  const [query, setQuery] = useState('')
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const searching = terms.length > 0
  const sections = SECTIONS.map(section => ({
    ...section,
    questions: section.questions.filter(question => terms.every(term =>
      SEARCH_TEXT.get(question.id)!.includes(term),
    )),
  })).filter(section => section.questions.length > 0)
  const count = sections.reduce((total, section) => total + section.questions.length, 0)

  return <div className="faq-page"><BackLink href="#library">Module library</BackLink>
    <div className="page-heading"><div><p className="page-kicker">MODWERK / HELP</p><h1>Frequently asked questions</h1><p>Choose the right firmware for your machine, understand preview status and find its flashing and recovery steps.</p></div></div>
    {!DOWNLOADS_ENABLED && <aside className="risk-note" role="note"><strong>Octatrack firmware downloads are paused</strong><p>The built-in logger is undergoing verification. You can explore modules and check supported configurations while the updated builds await review. The official Elektron OS remains available from Elektron.</p></aside>}
    <div className="faq-tools">
      <label className="faq-search"><Icon name="search" size={17} /><input type="search" aria-label="Search FAQ" placeholder="Search machines, firmware, flashing…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <a className="button button-quiet" href="#configuration">Octatrack configuration <Icon name="arrow" size={15} /></a>
    </div>
    {searching && <p className="faq-results" role="status">{count} {count === 1 ? 'answer' : 'answers'} found</p>}
    {sections.map(section => <section className="faq-section" key={section.title} aria-label={section.title}>
      <h2>{section.title}</h2>
      <div className="faq-questions">{section.questions.map(question => <details className="faq-question" key={question.id + (searching ? '-search' : '')} open={searching || question.id === 'base-firmware'}>
        <summary>{question.title}<Icon name="plus" size={17} /></summary>
        <div className="faq-answer">{question.answer}</div>
      </details>)}</div>
    </section>)}
    {!count && <div className="no-results"><Icon name="search" size={28} /><h2>No answers found</h2><p>Try “.bin”, “MIDI” or “backup”.</p><button className="button button-quiet" onClick={() => setQuery('')}>Clear search</button></div>}
    <p className="faq-footer">Follow Elektron’s official instructions for your exact machine. Octatrack owners should read the <OfficialLink href={RELEASE_NOTES}>OS 1.40C instructions</OfficialLink>; Digitakt and Digitone owners should read the <OfficialLink href="https://support.elektron.se/support/solutions/articles/43000662890-how-to-update-your-device">Transfer update guide</OfficialLink> and their model’s manual.</p>
  </div>
}
