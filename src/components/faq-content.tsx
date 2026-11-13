// SPDX-License-Identifier: GPL-3.0-or-later
// The FAQ's questions and answers, one list per machine group (FaqPage.tsx shows one group at a time). An answer names
// buttons and pages by the words the site shows, so change both together.
import type { ReactNode } from 'react'
import { INDEPENDENCE_NOTICE, FLASHING_RISKS, BASE_RECOVERY_NOTICE, BETA_REPORTING_NOTICE, REPORT_PROBLEMS, MODULE_SKIP_HINT } from '../firmware-notices'
import { BASE_FIRMWARE } from '../engine/base'
import { CARD_SET_FILE } from '../engine/elekloader/card-set'
import { DEVELOPMENT_DISCORD_URL } from '../config/development-discord'
import { OfficialLink } from './OfficialLink'

export type FaqMachine = 'octatrack' | 'digi' | 'rytm'
export type Question = { id: string; title: string; keywords: string; answer: ReactNode }
export type FaqSection = { id: string; title: string; questions: Question[] }
export type QuickStep = { title: string; text: ReactNode }
export type QuickStart = { title: string; steps: QuickStep[]; actions: { href: string; label: string }[]; more: string; caution: ReactNode }

export const FAQ_MACHINES: { id: FaqMachine; label: string; name: string }[] = [
  { id: 'octatrack', label: 'Octatrack', name: 'Octatrack' },
  { id: 'digi', label: 'Digitakt & Digitone', name: 'Digitakt or Digitone' },
  { id: 'rytm', label: 'Analog Rytm', name: 'Analog Rytm MKII' },
]

/** The machine group a device page belongs to; every machine without mods of its own reads the Octatrack's answers. */
export function faqMachine(device?: string): FaqMachine {
  return device?.startsWith('digitakt') || device?.startsWith('digitone') ? 'digi' : device?.startsWith('analog-rytm') ? 'rytm' : 'octatrack'
}

/** Ids of answers that were merged or renamed, so links shared before still open the right one. */
export const FAQ_ALIASES: Record<string, string> = {
  'flash-card': 'return-to-stock', 'configuration-errors': 'module-fit', 'community': 'account', 'digi-preview': 'preview',
}

const OFFICIAL_OS = 'https://www.elektron.se/wp-content/uploads/2025/03/OCTATRACK_OS1.40C_dist.zip'
export const RELEASE_NOTES = 'https://www.elektron.se/wp-content/uploads/2025/03/OCTATRACK_OS1.40C_readme.pdf'
const MKII_MANUAL = 'https://www.elektron.se/wp-content/uploads/2024/09/Octatrack-MKII-User-Manual_ENG_OS1.40A_210414.pdf'
const MKI_MANUAL = 'https://www.elektron.se/wp-content/uploads/2024/09/Octatrack-User-Manual_ENG-OS1.40A_220204.pdf'
export const TRANSFER_GUIDE = 'https://support.elektron.se/support/solutions/articles/43000662890-how-to-update-your-device'
const SYSEX_GUIDE = 'https://support.elektron.se/support/solutions/articles/43000662701-how-to-update-your-device-via-sysex-transfer'
const ELEKTRON_SUPPORT = 'https://www.elektron.se/support'


function manualLinks(recovery = false) {
  return <p className="faq-source">Elektron manuals, §{recovery ? '18.3' : '8.5.2'}: <OfficialLink href={MKII_MANUAL + '#page=' + (recovery ? '112' : '33')}>MKII</OfficialLink> · <OfficialLink href={MKI_MANUAL + '#page=' + (recovery ? '113' : '33')}>MKI</OfficialLink></p>
}

const OS = BASE_FIRMWARE.version

const supportedMachines: Question = {
  id: 'supported-machines',
  title: 'Which machines and OS versions does Modwerk support?',
  keywords: 'compatibility supported model hardware device octatrack mki mkii digitakt mk1 digitone keys analog rytm mkii digitakt ii 1.40c 1.53 1.54 1.43 1.44 1.74 1.17 preview research syntakt zoom lxr',
  answer: <>
    <ul>
      <li><strong>Octatrack MKI and MKII:</strong> original OS {OS}. Modules load over USB or from the card, on the Modwerk base.</li>
      <li><strong>Digitakt mk1:</strong> OS 1.53 or 1.54. <strong>Digitone mk1 and Digitone Keys:</strong> OS 1.43 or 1.44. In preview: you build and download a .syx.</li>
      <li><strong>Analog Rytm MKII:</strong> OS 1.74, in preview: you build and download a .syx.</li>
      <li><strong>Digitakt II:</strong> OS 1.17, in research. Its builds run in your browser for checks only; there are no downloads yet.</li>
    </ul>
    <p>Every other machine, such as the Digitone II, Syntakt, Analog Four or the Zoom pedals, has a page that shows how far it has come. A machine page alone does not mean you can build firmware for it. Check each module’s supported OS releases before you choose an OS file.</p>
  </>,
}

const account: Question[] = [
  {
    id: 'account',
    title: 'Do I need an account?',
    keywords: 'guest sign in register email verify comments likes forum follow updates notifications',
    answer: <>
      <p>No. Browsing, module sets and builds work without one.</p>
      <p>With an account and a verified email you can post in the forum, comment, like, confirm that a module works, follow module updates and report issues. Your email address stays private.</p>
      <p>When you download a build while signed in, you follow its modules: new versions reach your notifications and, depending on your settings, your email. <strong>Unfollow updates</strong> on a module page stops that.</p>
    </>,
  },
  {
    id: 'report',
    title: 'How do I report a problem?',
    keywords: 'bug issue report github author developer discord forum module combination reproduce',
    answer: <>
      <ul>
        <li><strong>One module misbehaves:</strong> use <strong>Report an issue</strong> on its module page.</li>
        <li><strong>You can’t tell which module it is:</strong> use <strong>Report a problem</strong> on your module set or configuration. Once it is narrowed down to one module, its developer is brought in.</li>
      </ul>
      <p>Say which machine and model you have, its OS version, the modules on it and how to make the problem happen again. Never attach firmware.</p>
      <p>Reports become public GitHub issues that the module’s developers work on. You don’t need a GitHub account: replies and fixes reach your notifications here. {BETA_REPORTING_NOTICE}</p>
    </>,
  },
  {
    id: 'local-firmware',
    title: 'Is my firmware uploaded? How do I remove it?',
    keywords: 'privacy device browser saved storage indexeddb cache clear forget offline sync',
    answer: <>
      <p>No. Your OS file stays in this browser on your device. Modwerk saves the verified original separately for each machine and checks it again when you return. It is never uploaded, synced, logged or put into an export.</p>
      <p><strong>Remove from device</strong>, below Base firmware on a machine’s Configuration page, deletes the saved copy. It does not delete your download or change what is on your hardware. Clearing this site’s data in the browser also removes your module sets and the saved file.</p>
    </>,
  },
  {
    id: 'share-configuration',
    title: 'Can I share my modules or a finished firmware file?',
    keywords: 'export import json backup send forum copyright redistribute bin syx modules configuration module set',
    answer: <>
      <p>Share the list, never the firmware. Export your module set or configuration as JSON from its <strong>⋯</strong> menu; another owner of the same machine uses <strong>Import JSON</strong> and their own original OS file. <strong>Share in forum</strong>, in the same menu, starts a thread about it.</p>
      <p>Do not pass on original or built .bin or .syx files: they contain Elektron’s copyrighted OS.</p>
    </>,
  },
  {
    id: 'support-creators',
    title: 'Can I support a module’s creator?',
    keywords: 'tip donate ko-fi kofi support creator author cup money',
    answer: <p>Where a creator has added a Ko-fi link, a small cup appears beside their name on the module page. It opens their Ko-fi tip dialog.</p>,
  },
  {
    id: 'audio-previews',
    title: 'How do I add an audio preview?',
    keywords: 'audio recording upload sound wav mp3 ogg credit caption samples permission preview',
    answer: <>
      <ol>
        <li>Find the module in <a href="#all">the module library</a> and open its page.</li>
        <li>Choose <strong>Add preview</strong> beside the main player or in the <strong>Previews</strong> tab. Sign in when prompted. You need a verified account; if you are new, create an account and verify your email first.</li>
        <li>Choose a <strong>WAV, MP3 or Ogg</strong> recording of up to <strong>12 MB</strong>. Listen to the preview before sharing.</li>
        <li>Add a <strong>credit</strong> and, optionally, a <strong>caption</strong> describing what the recording demonstrates. Confirm that you have permission to share the recording, including any samples.</li>
        <li>Press <strong>Add preview</strong> to upload. Your recording appears on the module page and in its Previews tab with your username, credit and caption.</li>
      </ol>
      <p>To remove your recording later, open the module’s <strong>Previews</strong> tab and choose <strong>Remove preview</strong> under your clip.</p>
    </>,
  },
  {
    id: 'develop',
    title: 'Can I write a module myself?',
    keywords: 'developer sdk contribute pull request github port agent start developing machine unlock',
    answer: <p>Yes. <a href="#submit">Start developing</a> takes you from an idea to a module with your coding agent, and shows what each machine still needs. Modules and updates arrive as GitHub pull requests. Questions are welcome in the <a href="#forum">forum</a> and on <OfficialLink href={DEVELOPMENT_DISCORD_URL}>Discord</OfficialLink>.</p>,
  },
]

const octatrack: FaqSection[] = [
  {
    id: 'start',
    title: 'Start here',
    questions: [
      {
        id: 'what-is-modwerk',
        title: 'What is Modwerk? Is it official Elektron firmware?',
        keywords: 'octamod custom experimental endorsed supported warranty unofficial community browser',
        answer: <>
          <p>Modwerk is a community workshop for mods on Elektron instruments. On the Octatrack you install the Modwerk base once, then add and remove modules over USB or from the card. Everything is built in your browser from your own original OS file; Modwerk never hosts firmware.</p>
          <p>{INDEPENDENCE_NOTICE}</p>
        </>,
      },
      {
        id: 'usb-base',
        title: 'How do I install mods on my Octatrack?',
        keywords: 'install load add modules mods usb base module set sync chrome edge chromium webusb card set file modwerk0.set setup restart reboot update os upgrade usb disk mode mki mkii firefox safari ipad',
        answer: <>
          <p>You need an Octatrack MKI or MKII, your original OS {OS} file, a USB cable and, in case USB stops working, a CompactFlash card reader or a MIDI interface.</p>
          <ol>
            <li><strong>Install the base once.</strong> Open <a href="#octatrack/setup">Your Octatrack → Setup</a> and follow the guide. The first install always goes through the card: the original OS has no USB link for Modwerk. You download the base .bin, copy it to the card over the cable in <strong>USB DISK MODE</strong> or with a card reader, then install it with <strong>PROJECT → SYSTEM → OS UPGRADE</strong>.</li>
            <li><strong>Pick modules</strong> from the <a href="#library">library</a> into your module set.</li>
            <li><strong>Send them to the Octatrack</strong>, in one of two ways:
              <ul>
                <li><strong>Over USB:</strong> in Chrome, Edge or another Chromium browser on a computer, connect the Octatrack with a USB cable and choose <strong>Sync to Octatrack</strong>. The modules load in seconds, without the card and without a restart.</li>
                <li><strong>From the card:</strong> in any browser, including Firefox, Safari, an iPad or a phone, choose <strong>Load from the card</strong> on Setup. Copy the downloaded <code>{CARD_SET_FILE}</code> to the top folder of the card, then switch the Octatrack off and on.</li>
              </ul>
            </li>
          </ol>
          <p>{BASE_RECOVERY_NOTICE}</p>
        </>,
      },
      {
        id: 'base',
        title: 'What is the Modwerk base?',
        keywords: 'base firmware loader core usb link what is install once update version id',
        answer: <>
          <p>The base is your original OS {OS} with Modwerk’s module loader and USB link added. It is built in your browser from your own OS file, which stays on your computer, and you install it once like any OS update.</p>
          <p>The base holds no modules itself. They come with a sync, and you change them whenever you like without flashing again. <a href="#octatrack/setup">Setup</a> shows which base your Octatrack runs.</p>
          <p>Every later base update goes over USB, with the card as the fallback. The site tells you when your module set needs a newer base.</p>
        </>,
      },
      {
        id: 'base-firmware',
        title: 'Where do I get the original OS file?',
        keywords: 'download base original stock official elektron os 1.40c bin syx zip extract',
        answer: <>
          <p>From Elektron. Download <OfficialLink href={OFFICIAL_OS}>the original OS {OS} archive</OfficialLink>, unzip it and choose <code>{BASE_FIRMWARE.filename}</code> when the install guide asks for it. Choose the .bin, not the ZIP or the .syx.</p>
          <p>It has to be exactly this version, even if Elektron releases a newer one. Modwerk verifies the file: a renamed, modified or different OS can’t be used. Don’t take a firmware file from another person.</p>
        </>,
      },
      {
        id: 'risks',
        title: 'What can go wrong? Can I lose my Octatrack?',
        keywords: 'brick bricked risk safe safety warranty danger unusable data loss recovery guarantee',
        answer: <>
          <p>{FLASHING_RISKS}</p>
          <p>What keeps the risk low: the Octatrack’s own startup menu can install Elektron’s original OS again from a MIDI interface, and a base update over USB that doesn’t start goes back to your previous base by itself after two failed starts. Your modules can be skipped at startup, too.</p>
          <p>See <a href="#faq/recover">how to recover an Octatrack that will not boot</a>.</p>
        </>,
      },
      {
        id: 'mods-stability',
        title: 'Are the mods stable?',
        keywords: 'stable stability reliable reliability testing stress hardware emulator performance live evidence test records',
        answer: <>
          <p>It depends on the module, so read its test records: they say what was checked, on which model and for how long. Every module release needs a hardware report from a real unit; emulator results can’t replace it. A record is not a guarantee for your combination of modules and your workload.</p>
          <p><strong>Test your own module set before you rely on it.</strong> Rehearse your real track count, modulation, recording and transitions for a sustained run, repeat that after you change modules, and keep a tested fallback for a performance.</p>
        </>,
      },
      supportedMachines,
    ],
  },
  {
    id: 'modules',
    title: 'Modules & sync',
    questions: [
      {
        id: 'module-sets',
        title: 'What is a module set?',
        keywords: 'module set configuration list several new starting points import json export saved browser',
        answer: <>
          <p>A module set is your list of modules for the Octatrack. A sync makes the Octatrack match it. You can keep several, for example one for the studio and one for playing live, and switch between them with a sync.</p>
          <p>Sets are saved in this browser. <strong>New module set</strong> starts an empty one, <strong>Starting points</strong> offers ready-made ones, and a set’s <strong>⋯</strong> menu exports it as JSON for another computer.</p>
        </>,
      },
      {
        id: 'sync',
        title: 'What happens when I sync?',
        keywords: 'sync usb adds removes updates playback stops restart kept project self-test seconds',
        answer: <>
          <p>Open a module set on <a href="#octatrack">Your Octatrack</a>. Before anything is sent, it shows what the sync will do: how many modules it adds, removes and updates, and whether stock effects change. <strong>Sync to Octatrack</strong> then sends it.</p>
          <ul>
            <li>Syncing stops playback on the Octatrack, so save your project first.</li>
            <li>The modules stay on the Octatrack, also after a restart.</li>
            <li>Your project isn’t changed.</li>
          </ul>
        </>,
      },
      {
        id: 'card-set',
        title: 'How do I load modules without USB?',
        keywords: 'card file modwerk0.set firefox safari ipad phone no usb webusb compactflash load from the card restart',
        answer: <>
          <p>An Octatrack on the Modwerk base reads its modules from one file on the card. That works from any browser and without the Octatrack at the computer.</p>
          <ol>
            <li>Add modules to your module set.</li>
            <li>On <a href="#octatrack/setup">Setup</a>, choose <strong>Load from the card</strong> to download <code>{CARD_SET_FILE}</code>.</li>
            <li>Copy it to the top folder of the card, outside every folder.</li>
            <li>Switch the Octatrack off and on. It starts with your modules.</li>
          </ol>
          <p>The file fits the base it was written for. After a base update, download it again.</p>
        </>,
      },
      {
        id: 'remove-modules',
        title: 'How do I remove a module?',
        keywords: 'remove uninstall delete module empty set skip start without modules proj func',
        answer: <>
          <p>Take it out of your module set and sync again. The review lists it under Removes before anything is sent. Syncing an empty set removes every module.</p>
          {MODULE_SKIP_HINT && <p>To start once without your modules, without removing them: {MODULE_SKIP_HINT.replace(/^If the Octatrack doesn’t start with your modules, h/, 'h')}</p>}
        </>,
      },
      {
        id: 'updates',
        title: 'How do I update modules or the base?',
        keywords: 'update new version module base latest install newer put back',
        answer: <>
          <p><strong>Modules:</strong> when a module in your set has a new version, the sync review counts it under Updates. Sync to install it.</p>
          <p><strong>Base:</strong> when your set needs a newer base, the site says so and offers <strong>Install latest base</strong>. It goes over USB, with the card as the fallback. After a base change the Octatrack starts without your modules; sync once to put them back.</p>
        </>,
      },
      {
        id: 'projects',
        title: 'Do my projects still work?',
        keywords: 'project compatibility stock effects fx2 missing modules bank part old projects',
        answer: <>
          <p>A sync doesn’t change your project. A project that uses a module needs that module on the Octatrack: when the open project uses modules that aren’t on it, Your Octatrack lists them and offers to add them to your set.</p>
          <p>Some effect modules take the place of stock effects; the sync review says when stock effects change. A project that used a replaced stock effect won’t sound the same, so keep a copy of your projects from before.</p>
        </>,
      },
      {
        id: 'backups',
        title: 'What should I back up?',
        keywords: 'backup projects banks samples card sync to card copy usb disk mode module files export',
        answer: <>
          <ul>
            <li><strong>Projects and samples:</strong> save your project, choose <strong>SYNC TO CARD</strong> in the PROJECT menu, then copy the whole card to your computer in USB DISK MODE or with a card reader.</li>
            <li><strong>Modules on the Octatrack:</strong> it keeps them on its card. <a href="#octatrack/backups">Backups</a> downloads those files.</li>
            <li><strong>Module sets:</strong> they live in this browser. Export each from its <strong>⋯</strong> menu.</li>
            <li><strong>The original OS:</strong> keep Elektron’s {OS} .bin and .syx on your computer.</li>
          </ul>
        </>,
      },
      {
        id: 'beta',
        title: 'What is the beta?',
        keywords: 'beta tester join discord experimental early modules round',
        answer: <p>Beta testers try new modules before everyone else. When a round is open, the site shows <strong>Join the beta</strong>. Beta modules are highly experimental. {BETA_REPORTING_NOTICE}</p>,
      },
    ],
  },
  {
    id: 'trouble',
    title: 'Troubleshooting',
    questions: [
      {
        id: 'cant-connect',
        title: 'Why can’t the site connect to my Octatrack?',
        keywords: 'connect connection usb webusb chrome edge windows linux udev snap in use another window tab device list not found',
        answer: <>
          <ul>
            <li><strong>Browser:</strong> USB needs Chrome, Edge or another Chromium browser on a computer. Firefox, Safari, iPads and phones can’t use USB; there, <a href="#faq/card-set">load your modules from the card</a>.</li>
            <li><strong>Original OS:</strong> syncing needs the Modwerk base. On Windows, Chrome can open the Octatrack only once it runs the base, so install the base from the card first.</li>
            <li><strong>In use:</strong> Modwerk in another tab, browser, Chrome profile or private window holds the Octatrack, and so can another app. Close it, and the page connects by itself. If not, quit the browser completely, or unplug the Octatrack and plug it back in.</li>
            <li><strong>Linux:</strong> Chrome needs permission for the device. <a href="#octatrack/setup">Setup</a> has the rule to add under “Can’t connect?”.</li>
          </ul>
          <p>Still nothing? {REPORT_PROBLEMS}</p>
        </>,
      },
      {
        id: 'no-modules-at-start',
        title: 'Why did my Octatrack start without my modules?',
        keywords: 'started without modules skipped held startup crashed froze proj func saved another base sync again status',
        answer: <>
          <p><a href="#octatrack">Status</a> on Your Octatrack says which of these happened:</p>
          <ul>
            <li><strong>Skipped at startup:</strong> PROJ or FUNC was held while it started. The modules load at the next start.</li>
            <li><strong>Held at startup:</strong> the last start crashed or froze while loading your modules. They load at the next start.</li>
            <li><strong>Saved by another base,</strong> or the saved modules couldn’t be read: this happens after a base change. Sync your modules again.</li>
          </ul>
        </>,
      },
      {
        id: 'no-sound',
        title: 'What if the Octatrack makes no sound or a module misbehaves?',
        keywords: 'no sound dsp stopped crackle crackling overload freeze crash glitch module broken narrow down',
        answer: <>
          <p>If the Octatrack goes silent, switch it off and on. It starts as usual, with your modules.</p>
          <p>If it happens again, find the module: remove half of your set, sync and test, then repeat with the half that still fails. Report what you find with <strong>Report a problem</strong> on Your Octatrack, or on the module’s page once you know which one it is.</p>
        </>,
      },
      {
        id: 'module-fit',
        title: 'Why can’t I add or sync a module?',
        keywords: 'compatibility conflict cannot run together capacity memory fit room unavailable paused pending verification newer base',
        answer: <>
          <p>The message on your module set names the reason. The usual ones:</p>
          <ul>
            <li><strong>Two modules can’t run together.</strong> They need the same key, screen or place in the Octatrack. Remove one of them.</li>
            <li><strong>The set doesn’t fit.</strong> Remove a module and check again.</li>
            <li><strong>The set needs a newer base.</strong> Install it from the same place.</li>
            <li><strong>The module is paused or its checks are pending.</strong> It can’t be synced for now.</li>
          </ul>
        </>,
      },
      {
        id: 'rejected-file',
        title: 'Why does Modwerk reject my OS file?',
        keywords: 'invalid size fingerprint verification checksum wrong version modified syx zip https',
        answer: <>
          <p>Modwerk accepts only Elektron’s original <code>{BASE_FIRMWARE.filename}</code>. A ZIP, the .syx, another OS version or an already modified file is refused, and renaming a file doesn’t help. Unzip the archive again and choose the .bin.</p>
          <p>If the message mentions HTTPS, open Modwerk at its secure https:// address.</p>
        </>,
      },
      {
        id: 'card-file',
        title: 'Why can’t the Octatrack find the base on my card?',
        keywords: 'bin cf compactflash root folder zip json extension eject copy missing upgrade',
        answer: <>
          <p>The base .bin has to be at the top level of the card, outside every folder. Check that the copy finished, eject the drive on your computer and leave USB DISK MODE before you choose OS UPGRADE. A ZIP, a .syx or a JSON export is not an update file.</p>
          {manualLinks()}
        </>,
      },
    ],
  },
  {
    id: 'recovery',
    title: 'Recovery & original OS',
    questions: [
      {
        id: 'before-flashing',
        title: 'What should I do before I install the base?',
        keywords: 'prepare backup card reader midi interface power original os keep safety before flashing',
        answer: <>
          <ol>
            <li>Back up the card: save your project, choose <strong>SYNC TO CARD</strong>, then copy the whole card to your computer.</li>
            <li>Keep Elektron’s original OS {OS} .bin and .syx on your computer.</li>
            <li>Have a CompactFlash card reader or a MIDI interface at hand. Either one is your way back if USB stops working.</li>
            <li>Read <a href="#faq/recover">the recovery steps</a> once, before you need them.</li>
            <li>Use a stable power supply and let the update and the startup finish.</li>
          </ol>
          <p className="faq-source"><OfficialLink href={RELEASE_NOTES}>Elektron OS {OS} update and backup instructions</OfficialLink></p>
        </>,
      },
      {
        id: 'recover',
        title: 'How do I recover an Octatrack that will not boot?',
        keywords: 'restore stock original stuck frozen failed boot startup func function trig 3 midi upgrade sysex brick',
        answer: <>
          <p>While an update is running, keep the power on. If it has finished and the Octatrack doesn’t start:</p>
          <ol>
            <li><strong>After a base update over USB, switch it off and on.</strong> After two starts that fail, it goes back to your previous base by itself.</li>
            {MODULE_SKIP_HINT && <li><strong>Start without your modules.</strong> {MODULE_SKIP_HINT}</li>}
            <li><strong>Install the original OS over MIDI.</strong> Connect your computer’s MIDI interface OUT to the Octatrack’s DIN MIDI IN. Hold <strong>FUNC</strong> (FUNCTION on an MKI) while you switch it on, press <strong>TRIG 3</strong> for <strong>MIDI UPGRADE</strong>, then send Elektron’s original <code>OCTATRACK_OS1.40C.syx</code> with a SysEx application such as Elektron Transfer. Wait for the transfer and the startup to finish.</li>
          </ol>
          <p>Recovery is not guaranteed. If the startup menu doesn’t appear or the original OS won’t install, contact <OfficialLink href={ELEKTRON_SUPPORT}>Elektron support</OfficialLink>. EMPTY RESET only clears settings; it doesn’t reinstall the OS.</p>
          {manualLinks(true)}
        </>,
      },
      {
        id: 'return-to-stock',
        title: 'How do I go back to the original Elektron OS?',
        keywords: 'revert uninstall downgrade restore stock original os upgrade card bin flash compactflash usb disk mode',
        answer: <>
          <p>Install Elektron’s original <code>{BASE_FIRMWARE.filename}</code> from the card, like any OS update:</p>
          <ol>
            <li>Open <strong>PROJECT → SYSTEM → USB DISK MODE</strong>, or put the card in a card reader.</li>
            <li>Copy the original .bin to the top level of the card, outside every folder.</li>
            <li>Eject the drive on your computer, then leave USB DISK MODE.</li>
            <li>Open <strong>PROJECT → SYSTEM → OS UPGRADE</strong> and confirm with <strong>YES</strong>.</li>
            <li>Keep the power on until the update and the startup have finished.</li>
          </ol>
          <p>If the Octatrack doesn’t start, use <a href="#faq/recover">the MIDI recovery</a>. Projects saved with modules may not behave the same on the original OS, so keep your backups.</p>
          {manualLinks()}
        </>,
      },
      {
        id: 'bin-or-syx',
        title: 'What is the difference between the .bin and the .syx?',
        keywords: 'midi din interface cable sysex transfer format rename usb update',
        answer: <>
          <p>The <strong>.bin</strong> installs from the CompactFlash card with OS UPGRADE. The <strong>.syx</strong> is sent through a MIDI interface into the Octatrack’s DIN MIDI IN, from the startup menu. Renaming one doesn’t turn it into the other.</p>
          <p>The Octatrack’s USB port can’t receive an OS upgrade as MIDI. The Modwerk base comes as a .bin; for the MIDI recovery, use Elektron’s original .syx.</p>
          {manualLinks(true)}
        </>,
      },
    ],
  },
  {
    id: 'account',
    title: 'Account, privacy & sharing',
    questions: [
      ...account.slice(0, 3),
      {
        id: 'diagnostics',
        title: 'What do diagnostics send?',
        keywords: 'diagnostics privacy consent reports log load crash share stop delete gdpr',
        answer: <>
          <p>Nothing unless you agree: sharing diagnostics is optional. With it on, the site sends what went wrong and where: sync results, self-test results, load readings, and what the Octatrack was doing when it overloaded, froze or crashed.</p>
          <p>It never sends firmware, samples, audio, project, sample or set names, or serial numbers. You can stop sharing and delete your reports under <a href="#octatrack/setup">Setup</a>.</p>
        </>,
      },
      ...account.slice(3),
    ],
  },
]

/** Digitakt mk1, Digitone mk1/Keys and Analog Rytm MKII share one flow: a .syx built in the browser, sent with Transfer. */
function syxMachine(machine: 'digi' | 'rytm'): FaqSection[] {
  const rytm = machine === 'rytm'
  const name = rytm ? 'Analog Rytm MKII' : 'Digitakt or Digitone'
  const releases = rytm ? 'OS 1.74' : 'OS 1.53 or 1.54 for the Digitakt, OS 1.43 or 1.44 for the Digitone and Digitone Keys'
  const support = rytm
    ? <OfficialLink href="https://www.elektron.se/support-downloads/analog-rytm-mkii#resources">Elektron’s Analog Rytm MKII page</OfficialLink>
    : <><OfficialLink href="https://www.elektron.se/support-downloads/digitakt#resources">Elektron’s Digitakt page</OfficialLink> or <OfficialLink href="https://www.elektron.se/support-downloads/digitone#resources">Digitone page</OfficialLink></>
  return [
    {
      id: 'start',
      title: 'Start here',
      questions: [
        {
          id: 'what-is-modwerk',
          title: 'What is Modwerk? Is it official Elektron firmware?',
          keywords: 'octamod custom experimental endorsed supported warranty unofficial community browser',
          answer: <>
            <p>Modwerk is a community workshop for mods on Elektron instruments. For the {name} you choose modules, and Modwerk builds a firmware file in your browser from your own original OS file. Modwerk never hosts firmware.</p>
            <p>{INDEPENDENCE_NOTICE}</p>
          </>,
        },
        {
          id: 'build-firmware',
          title: `How do I put mods on my ${name}?`,
          keywords: 'select add modules configuration choose file build download syx install flash transfer',
          answer: <>
            <ol>
              <li>Open the {rytm ? <a href="#analog-rytm-mkii">Analog Rytm MKII library</a> : <><a href="#digitakt">Digitakt</a> or <a href="#digitone">Digitone</a> library</>}, read the module pages and add the modules you want. Modules belong to one machine.</li>
              <li>Open its Configuration page and choose the original OS file it asks for ({releases}).</li>
              <li>Resolve any compatibility message with the fix it suggests.</li>
              <li>Read the flashing risks, tick the acknowledgement and choose <strong>Build firmware</strong>. You can sign in, or build as a guest with <strong>Skip for now</strong>. Keep the tab open until it finishes.</li>
              <li>Confirm that you know how to get back to the original OS, then choose <strong>Download .syx</strong>.</li>
              <li>Send the .syx to the machine with Elektron Transfer: see <a href="#faq/digi-flashing">how to install it</a>.</li>
            </ol>
            <p>Every change to your modules is a new build and a new install.</p>
          </>,
        },
        {
          id: 'base-firmware',
          title: 'Where do I get the original OS file?',
          keywords: 'download base original stock official elektron os syx zip extract older release',
          answer: <>
            <p>From Elektron. Download the OS archive for your exact machine from {support}, unzip it and choose the .syx on the Configuration page. Supported: {releases}.</p>
            <p>Modwerk verifies the file: a renamed, modified or unsupported OS can’t be used. If Elektron no longer offers a supported release, ask Elektron; don’t take a firmware file from another person.</p>
          </>,
        },
        {
          id: 'preview',
          title: 'What does “preview” mean for this machine?',
          keywords: 'preview status available build verification download module library growing',
          answer: <p>Builds and .syx downloads work, and the module library is small and still growing. Fewer people have run these builds than on the Octatrack, so read each module’s test records before you flash.{rytm ? '' : ' Digitakt II and Digitone II are separate machines and are not included.'}</p>,
        },
        {
          id: 'risks',
          title: 'What can go wrong?',
          keywords: 'brick bricked risk safe safety warranty danger unusable data loss recovery guarantee stable stability',
          answer: <>
            <p>{FLASHING_RISKS}</p>
            <p>A build that fits and passes Modwerk’s checks is not proof that it works on hardware. Know <a href="#faq/digi-recovery">the recovery steps</a> before you flash: they need a MIDI interface with DIN ports, because the startup menu doesn’t work over USB.</p>
            <p><strong>Test your own build before you rely on it,</strong> and keep a tested fallback for a performance.</p>
          </>,
        },
        supportedMachines,
      ],
    },
    {
      id: 'install',
      title: 'Installing & recovery',
      questions: [
        {
          id: 'before-flashing',
          title: 'What should I do before I flash?',
          keywords: 'prepare backup projects sounds midi interface power original os keep safety',
          answer: <ol>
            <li>Back up your projects and sounds.</li>
            <li>Keep Elektron’s original OS .syx on your computer.</li>
            <li>Have a MIDI interface with DIN ports at hand. It is your way back if the machine doesn’t start.</li>
            <li>Read <a href="#faq/digi-recovery">the recovery steps</a> once, before you need them.</li>
          </ol>,
        },
        {
          id: 'digi-flashing',
          title: 'How do I install the .syx?',
          keywords: 'digitakt digitone keys analog rytm syx usb midi elektron transfer update upgrade yes install flash',
          answer: <>
            <p>The same way as an official OS update:</p>
            <ol>
              <li>Connect the machine to your computer by USB and open Elektron Transfer.</li>
              <li>Select the machine as Transfer’s MIDI input and output, then connect.</li>
              <li>Drop the .syx onto Transfer’s <strong>Drop files here</strong> area.</li>
              <li>When prompted, press <strong>YES</strong> on the machine. Keep the power on until the upgrade and the startup have finished.</li>
            </ol>
            <p className="faq-source"><OfficialLink href={TRANSFER_GUIDE}>Elektron’s USB OS update instructions</OfficialLink></p>
          </>,
        },
        {
          id: 'digi-recovery',
          title: `How do I recover a ${rytm ? 'Analog Rytm MKII' : 'Digitakt or Digitone'} that will not boot?`,
          keywords: 'digitakt ii digitone keys analog rytm mkii recovery restore stock startup midi din sysex transfer usb failed boot brick func trig 4',
          answer: <>
            <p>While an update is running, keep the power on. If it has finished and the machine doesn’t start, install Elektron’s original OS from the startup menu:</p>
            <ol>
              <li>Connect a MIDI interface to the machine’s DIN MIDI ports. USB can’t carry this update: the startup menu never appears over USB.</li>
              <li>{rytm ? <>Hold <strong>FUNC</strong> while you switch the machine on and choose <strong>OS UPGRADE</strong> (<strong>TRIG 4</strong>).</> : <>Open the startup menu and choose its OS upgrade, as your model’s manual describes. On a Digitakt II: hold <strong>FUNC</strong> while you switch it on, then choose <strong>OS UPGRADE</strong> (<strong>TRIG 4</strong>).</>}</li>
              <li>In Elektron Transfer, open <strong>SYSEX TRANSFER</strong>, choose <strong>OS upgrade via device startup menu</strong> and send the original .syx.</li>
            </ol>
            <p>Recovery is not guaranteed. If the startup menu doesn’t appear or the original OS won’t install, contact <OfficialLink href={ELEKTRON_SUPPORT}>Elektron support</OfficialLink>.</p>
            <p className="faq-source"><OfficialLink href={SYSEX_GUIDE}>Elektron’s SysEx and startup-menu update instructions</OfficialLink></p>
          </>,
        },
        {
          id: 'return-to-stock',
          title: 'How do I go back to the original Elektron OS?',
          keywords: 'revert uninstall downgrade restore stock original os transfer syx',
          answer: <p>Send Elektron’s original .syx with Elektron Transfer, exactly like <a href="#faq/digi-flashing">installing a build</a>. If the machine doesn’t start, use <a href="#faq/digi-recovery">the startup menu</a>.</p>,
        },
      ],
    },
    {
      id: 'trouble',
      title: 'Troubleshooting',
      questions: [
        {
          id: 'download-status',
          title: 'Why is there no download button?',
          keywords: 'paused disabled missing ready built download syx button build first',
          answer: <p><strong>Download .syx</strong> appears only after a build has finished. Choose the original OS file, add modules, resolve every compatibility message and acknowledge the flashing risks, then build. After the build, confirm that you know how to get back to the original OS.{rytm ? '' : ' Digitakt II builds run for checks only and offer no download yet.'}</p>,
        },
        {
          id: 'module-fit',
          title: 'Why can’t I combine two modules?',
          keywords: 'compatibility conflict clash slot control memory standalone exclusive combination fit',
          answer: <>
            <p>Two modules may need the same machine slot, control, memory area or firmware change. The message names them: remove one. A standalone firmware module is a complete build and is used on its own.</p>
            <p>Modules marked <strong>Build verification pending</strong> can’t be built yet.</p>
          </>,
        },
        {
          id: 'rejected-file',
          title: 'Why does Modwerk reject my OS file?',
          keywords: 'invalid size fingerprint verification checksum wrong version modified syx zip https',
          answer: <>
            <p>Modwerk accepts only Elektron’s original .syx for this machine in a supported release ({releases}). A ZIP, a file for another machine, another release or an already modified file is refused, and renaming a file doesn’t help. Unzip the archive again and choose the .syx.</p>
            <p>If the message mentions HTTPS, open Modwerk at its secure https:// address.</p>
          </>,
        },
      ],
    },
    { id: 'account', title: 'Account, privacy & sharing', questions: account },
  ]
}

const SECTIONS: Record<FaqMachine, FaqSection[]> = { octatrack, digi: syxMachine('digi'), rytm: syxMachine('rytm') }
export const faqSections = (machine: FaqMachine) => SECTIONS[machine]

const QUICK: Record<FaqMachine, QuickStart> = {
  octatrack: {
    title: 'Install mods on your Octatrack',
    steps: [
      { title: 'Install the base once', text: <>From the card, built from your original OS {OS} file.</> },
      { title: 'Pick your modules', text: 'From the library, into a module set.' },
      { title: 'Sync over USB', text: <>In Chrome or Edge, without a restart. Or copy <code>{CARD_SET_FILE}</code> to the card.</> },
    ],
    actions: [{ href: '#octatrack/setup', label: 'Open Setup' }],
    more: 'usb-base',
    caution: 'Have a CompactFlash card reader or a MIDI interface at hand before you install the base: either one is your way back if USB stops working.',
  },
  digi: {
    title: 'Put mods on your Digitakt or Digitone',
    steps: [
      { title: 'Pick your modules', text: 'From the machine’s library.' },
      { title: 'Build the firmware', text: 'In your browser, from your original OS .syx.' },
      { title: 'Send the .syx', text: 'With Elektron Transfer, like an OS update.' },
    ],
    actions: [{ href: '#digitakt', label: 'Digitakt modules' }, { href: '#digitone', label: 'Digitone modules' }],
    more: 'build-firmware',
    caution: 'Have a MIDI interface with DIN ports at hand before you flash: recovery doesn’t work over USB.',
  },
  rytm: {
    title: 'Put mods on your Analog Rytm MKII',
    steps: [
      { title: 'Pick your modules', text: 'From the machine’s library.' },
      { title: 'Build the firmware', text: 'In your browser, from your original OS 1.74 .syx.' },
      { title: 'Send the .syx', text: 'With Elektron Transfer, like an OS update.' },
    ],
    actions: [{ href: '#analog-rytm-mkii', label: 'Browse modules' }],
    more: 'build-firmware',
    caution: 'Have a MIDI interface with DIN ports at hand before you flash: recovery doesn’t work over USB.',
  },
}
export const faqQuickStart = (machine: FaqMachine) => QUICK[machine]
