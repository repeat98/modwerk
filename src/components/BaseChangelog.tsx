import { issueRepository } from '../community/report-context'

type Change = { area: string; detail: string; note?: string }
type BaseRelease = {
  version?: string
  title: string
  note: string
  noteLabel?: string
  changes: Change[]
}

const releases: Record<'octatrack' | 'rytm' | 'zoom', [BaseRelease, ...BaseRelease[]]> = {
  octatrack: [
    {
      version: '0.8.2', title: 'Recording costs less CPU', note: '2026-11-23-octatrack-recorder-cs1-skip',
      changes: [
        { area: 'Recording', detail: 'Tracks that record cost less CPU: the recorder leaves out two memory writes that would store what is already there.' },
        { area: 'Sync', detail: 'When a track runs a module that a sync changes, the site names that track and its FX slot.', note: '2026-11-24-octatrack-in-use-track' },
      ],
    },
    {
      version: '0.8.1', title: 'Lower overhead for module sets', note: '2026-11-23-octatrack-idle-module-cost', noteLabel: 'CPU release note',
      changes: [
        { area: 'CPU', detail: 'The base now caches the module-cost table. With playback stopped and 16 installed but unused modules on an Octatrack MKII, the CPU meter fell from about 46% to 41%. The base’s own work per UI tick fell from 1,412 to 247 µs.' },
        { area: 'DSP', detail: 'The loader packet check and load meter update take about 24 fewer cycles per audio frame on each DSP core. The module code area gains 8 to 10 words per core.', note: '2026-11-23-octatrack-receiver-one-word-forms' },
        { area: 'RINGMOD SC', detail: 'The key bus now counts for 43 DSP cycles per sample on each core, down from 51. A Part using RINGMOD SC has about 8 more cycles per sample before DSP FULL.', note: '2026-11-23-octatrack-keybus-charge' },
      ],
    },
    {
      version: '0.8', title: 'Clearer CPU warnings and better project recall', note: '2026-11-21-octatrack-base-0-8',
      changes: [
        { area: 'CPU FULL', detail: 'The warning shows how much the selected machine or effect would add. When you press PLAY, the base remembers the last playing load while the meter catches up.' },
        { area: 'Project load', detail: 'Sidechain can give its DSP memory back when a stopped project needs it for saved effects. It resumes when there is room.' },
        { area: 'Beat Slicer', detail: 'Slice boundaries can snap to zero crossings. FUNC + AED cycles through installed slice-grid actions.' },
        { area: 'Part Edit', detail: 'Modules can hide their inactive menu rows. Existing Mute Modes installations can upgrade, and shared reports describe interrupted USB uploads in more detail.' },
      ],
    },
    {
      version: '0.7.13', title: 'Machine swaps count their actual CPU cost', note: '2026-11-21-octatrack-cpu-guard-meter-cost',
      changes: [{ area: 'CPU FULL', detail: 'A busy unit uses a machine’s measured meter cost when available. Swapping a machine out and back while stopped no longer triggers CPU FULL, WAS BUSY PLAYING.' }],
    },
    {
      version: '0.7.12', title: 'One USB Audio module for every layout', note: '2026-11-20-octatrack-usb-audio-package',
      changes: [
        { area: 'Setup', detail: 'Choose the destination and layout in PROJ › MODWERK › SETTINGS › USB AUDIO. Existing sets restore their saved destination, layout and routing.' },
        { area: 'Track stems', detail: 'The 16- and 20-channel layouts offer PRE LEVEL and POST LEVEL for all eight stems. Main and Cue keep separate stereo pairs.' },
        { area: 'Outbox 8', detail: 'Choose a source or silence for each of four stereo USB pairs. Map physical outputs in Elektron’s app.' },
      ],
    },
    {
      version: '0.7.11', title: 'Audio continues when a project opens', note: '2026-11-20-octatrack-base-0-7-11',
      changes: [{ area: 'Project load', detail: 'The base waits until the project finishes loading to change the effects held by the DSP, preventing that transition from stopping audio.' }],
    },
    {
      version: '0.7.10', title: 'Faster controls and better trial recovery', note: '2026-11-19-octatrack-base-0-7-10',
      changes: [
        { area: 'Controls', detail: 'Large sets spend less time processing screen updates, key presses and encoder turns. Machine and effect picks reserve enough CPU for all eight stock delays.' },
        { area: 'Undo', detail: 'Undo restores Analog BD’s sound after a trial. A delay-buffer conflict now points to the affected FX2 slot. Close TRACK TRIG EDIT after trying Micro Timing to let Undo finish.' },
      ],
    },
    {
      version: '0.7.9', title: 'Module effects stay assigned across a restart', note: '2026-11-18-octatrack-effect-lost-after-project-load',
      changes: [{ area: 'Project recall', detail: 'Saving a loaded project now records the installed effects still assigned to its tracks. The base can also restore older saves where a module effect’s assignment was missing.' }],
    },
    {
      version: '0.7.8', title: 'Multiple DSP machines can share a set', note: '2026-11-03-octatrack-dsp-hook-chains',
      changes: [{ area: 'Machines', detail: 'Each installed DSP machine can claim its own tracks. A second DSP machine can install over USB alongside Analog BD.' }],
    },
    {
      version: '0.7.7', title: 'Silent delays use less CPU', note: '2026-11-16-octatrack-delay-idle-skip',
      changes: [{ area: 'Delay', detail: 'The base skips delay processing on tracks with no delay or a faded tail and a closed send. On an MKII with default DELAY on all eight tracks, CPU fell from 41% to 34%.' }],
    },
    {
      version: '0.7.5', title: 'Open module windows stay loaded', note: '2026-11-12-module-ui-roots',
      changes: [{ area: 'USB sync', detail: 'Close a module’s window or key layer before removing it, replacing it or undoing a trial. Modules with their own windows, such as Tuner, can now load over USB.' }],
    },
    {
      version: '0.7.4', title: 'More memory per module', note: '2026-11-16-module-memory-cap',
      changes: [
        { area: 'Shared memory', detail: 'One module can use up to 288 KiB of the existing 768 KiB pool. MIDI Scenes can keep locks for all 64 Parts.' },
        { area: 'Sample memory', detail: 'Modules such as Kits can borrow sample memory while installed. Removing the module returns that memory.' },
      ],
    },
    {
      version: '0.7.3', title: 'Projects remember their module machines', note: '2026-11-16-machines-in-project-map',
      changes: [{ area: 'MISSING', detail: 'The MISSING page names unavailable machines and where the project uses them. Press YES to switch a disabled machine back on. The track and the site both indicate what is missing.' }],
    },
    {
      version: '0.7.2', title: 'Find and re-enable switched-off modules', note: '2026-11-16-module-off-edges',
      changes: [
        { area: 'MISSING', detail: 'Disabled modules appear with an OFF label. YES switches the listed modules back on. When switching off a module used in another Part, the unit says where.' },
        { area: 'After an update', detail: 'The instrument prompts you to sync on the site first. The site names previously disabled modules when it puts your set back.' },
      ],
    },
    {
      version: '0.7.1', title: 'Separate CPU, DSP and memory meters', note: '2026-11-16-load-page-rows',
      changes: [{ area: 'Status', detail: 'The five bars show CPU, DSP for tracks 1–4 and 5–8, and DSP memory for each group. Open the display with CUE + PROJ.' }],
    },
    {
      version: '0.7', title: 'Switch modules on or off on the Octatrack', note: '2026-11-16-modules-on-off',
      changes: [{ area: 'Module controls', detail: 'With playback stopped, press YES on a module in PROJECT › MODWERK › MODULES. The setting survives a restart or sync. A module in use on a track stays on.' }],
    },
  ],
  rytm: [
    {
      title: 'More room for digital voice modules', note: '2026-11-17-rytm-voices-no-lock-words',
      changes: [
        { area: 'Memory', detail: 'The voices variant gives modules 1,752 more bytes of RAM in sets with a digital voice machine and no send effect.' },
        { area: 'Send FX locks', detail: 'Send-FX locks do not play on the voices variant. Saving a pattern on this variant removes those locks, so clear or re-create the affected locks if you return to the send-bus variant.' },
      ],
    },
    {
      title: 'Machines can render digital voices', note: '2026-11-11-rytm-base-digital-voices',
      changes: [{ area: 'Voice machines', detail: 'A module can generate a track’s audio and tie a sound type to the SYNTH page. The base supplies hit detection, level and quiet-voice handling.' }],
    },
    {
      title: 'Modwerk base with an optional send bus', note: '2026-10-30-rytm-site-modwerk-base',
      changes: [
        { area: 'Builds', detail: 'Sets with a send effect use the send-bus variant. Other sets keep the memory and kit storage that bus would use.' },
        { area: 'Saved sets', detail: 'Saved configurations and their module storage carry over from builds using core-ar2 0.7.' },
      ],
    },
  ],
  zoom: [
    {
      version: 'MIDISTOMP 2.0.1', title: 'Looper, mixer and more DSP headroom', note: '2026-11-06-midistomp-pin',
      changes: [
        { area: 'Playing', detail: 'MIDISTOMP adds a looper, mixer and effect categories. The DSP limit rises to 300.' },
        { area: 'Diagnostics', detail: 'A new diagnostics page and identity tag identify the installed base. The browser build matches MIDISTOMP’s own tool byte for byte.' },
      ],
    },
    {
      title: 'Build MIDISTOMP in your browser', note: '2026-10-27-zoom-midistomp-base',
      changes: [{ area: 'Setup', detail: 'Modwerk builds the same base as MIDISTOMP’s builder from your own MS-70CDR 2.10 updater. The updater stays on your computer.' }],
    },
  ],
}

const formatDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' })

function ReleaseDate({ note }: { note: string }) {
  const date = note.slice(0, 10)
  return <time dateTime={date}>{formatDate.format(new Date(date))}</time>
}

function ArchivedRelease({ release }: { release: BaseRelease }) {
  return <details className="base-reference base-archived-release">
    <summary>
      <span className="base-release-heading">
        <span>{release.version && <span className="base-release-version">{release.version}</span>} {release.title}</span>
        <ReleaseDate note={release.note} />
      </span>
    </summary>
    <div><ReleaseChanges release={release} /></div>
  </details>
}

function ReleaseChanges({ release }: { release: BaseRelease }) {
  const repository = issueRepository()
  return <>
    <dl className="base-release-changes">{release.changes.map(change => <div key={change.area}>
      <dt>{change.area}</dt>
      <dd>
        <p>{change.detail}</p>
        {change.note && <a href={repository + '/blob/main/changelog/' + change.note + '.md'}>
          Release note<span className="sr-only"> for {change.area}</span>
        </a>}
      </dd>
    </div>)}</dl>
    <a className="base-release-source" href={repository + '/blob/main/changelog/' + release.note + '.md'}>
      {release.noteLabel ?? 'Full release note'}
      <span className="sr-only"> for {release.version ?? release.title}</span>
    </a>
  </>
}

export function BaseChangelog({ machine }: { machine: keyof typeof releases }) {
  const [latest, ...earlier] = releases[machine]
  return <section className="base-changelog" aria-labelledby="base-changelog-title">
    <h3 id="base-changelog-title" tabIndex={-1}>Changelog</h3>
    <article className="base-latest-release" aria-labelledby="base-latest-title">
      <header className="base-release-heading">
        <h4 id="base-latest-title">{latest.version && <span className="base-release-version">{latest.version}</span>} {latest.title}</h4>
        <ReleaseDate note={latest.note} />
      </header>
      <ReleaseChanges release={latest} />
    </article>
    <div className="base-release-history">
      {earlier.slice(0, 2).map(release => <ArchivedRelease key={release.note} release={release} />)}
      {earlier.length > 2 && <details className="base-reference">
        <summary>Older releases ({earlier.length - 2})</summary>
        <div>{earlier.slice(2).map(release => <ArchivedRelease key={release.note} release={release} />)}</div>
      </details>}
    </div>
  </section>
}
