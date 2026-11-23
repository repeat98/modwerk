import { issueRepository } from '../community/report-context'

type BaseChange = {
  label: string
  summary: string
  note: string
}

// Use the published Octatrack version. The Rytm's base changes are dated, and Zoom uses MIDISTOMP's version.
const changes: Record<'octatrack' | 'rytm' | 'zoom', BaseChange[]> = {
  octatrack: [
    { label: '0.8.1', summary: 'Large module sets cost much less CPU while their modules are unused, each DSP core spends less of every audio frame on its own checks, and a Part with RINGMOD SC has a little more room before DSP FULL.', note: '2026-11-23-octatrack-idle-module-cost' },
    { label: '0.8', summary: 'CPU FULL shows the cost of a pick, saved effects get priority on project load, and Beat Slicer can snap to zero crossings.', note: '2026-11-21-octatrack-base-0-8' },
    { label: '0.7.13', summary: 'Picking a module machine on a busy Octatrack counts what the machine really costs, so a swap back no longer shows CPU FULL.', note: '2026-11-21-octatrack-cpu-guard-meter-cost' },
    { label: '0.7.12', summary: 'Install USB Audio once and choose layouts, stem taps and Outbox pairs on the Octatrack.', note: '2026-11-20-octatrack-usb-audio-package' },
    { label: '0.7.11', summary: 'Opening a project no longer risks stopping the audio while its effects load.', note: '2026-11-20-octatrack-base-0-7-11' },
    { label: '0.7.10', summary: 'Large module sets spend less time handling the controls. Picks leave room for delay sends to open, and Undo restores Analog BD’s sound.', note: '2026-11-19-octatrack-base-0-7-10' },
    { label: '0.7.9', summary: 'Modules can share the Part Edit menu. Module effects also stay assigned after loading a project and restarting.', note: '2026-11-18-octatrack-effect-lost-after-project-load' },
    { label: '0.7.8', summary: 'Several DSP machines can run in one set. Modules that support resting can free up processing time while unused.', note: '2026-11-03-octatrack-dsp-hook-chains' },
    { label: '0.7.7', summary: 'Tracks with silent delays use less processing time.', note: '2026-11-16-octatrack-delay-idle-skip' },
    { label: '0.7.5', summary: 'The Octatrack keeps a module loaded while its window is open.', note: '2026-11-12-module-ui-roots' },
    { label: '0.7.4', summary: 'Larger modules can use up to 288 KiB of shared memory. Removing a module also returns any sample memory it borrowed.', note: '2026-11-16-module-memory-cap' },
    { label: '0.7.3', summary: 'A project remembers its module machines and shows which tracks need a missing machine.', note: '2026-11-16-machines-in-project-map' },
    { label: '0.7.2', summary: 'MISSING distinguishes switched-off modules and lets you switch them back on with YES.', note: '2026-11-16-module-off-edges' },
    { label: '0.7.1', summary: 'The status screen shows separate bars for CPU, DSP and memory use.', note: '2026-11-16-load-page-rows' },
    { label: '0.7', summary: 'Switch individual modules on or off from the PROJECT menu. The card remembers your choice.', note: '2026-11-16-modules-on-off' },
  ],
  rytm: [
    { label: '17 Nov 2026', summary: 'Sets with digital voices and no send effect leave more memory for modules. Saving a pattern on this variant drops its send-FX locks.', note: '2026-11-17-rytm-voices-no-lock-words' },
    { label: '11 Nov 2026', summary: 'Machine modules can generate digital voices on the Rytm.', note: '2026-11-11-rytm-base-digital-voices' },
    { label: '30 Oct 2026', summary: 'Sets can include a shared send effect. Builds without a send effect keep the memory and kit storage it would use.', note: '2026-10-30-rytm-site-modwerk-base' },
  ],
  zoom: [
    { label: 'MIDISTOMP 2.0.1', summary: 'Adds a looper, mixer, diagnostics and effect categories, and raises the DSP limit to 300.', note: '2026-11-06-midistomp-pin' },
    { label: '27 Oct 2026', summary: 'Modwerk can build MIDISTOMP locally from your own Zoom 2.10 updater.', note: '2026-10-27-zoom-midistomp-base' },
  ],
}

function Change({ change }: { change: BaseChange }) {
  return <div className="base-change">
    <dt>{change.label}</dt>
    <dd>{change.summary} <a href={issueRepository() + '/blob/main/changelog/' + change.note + '.md'}>Release note<span className="sr-only"> for {change.label}</span></a></dd>
  </div>
}

export function BaseChangelog({ machine }: { machine: keyof typeof changes }) {
  const [latest, ...earlier] = changes[machine]
  return <section className="base-changelog" aria-labelledby="base-changelog-title">
    <h3 id="base-changelog-title" tabIndex={-1}>Changelog</h3>
    <dl><Change change={latest} /></dl>
    <details className="base-reference"><summary>Earlier changes ({earlier.length})</summary>
      <dl>{earlier.map(change => <Change key={change.label} change={change} />)}</dl>
    </details>
  </section>
}
