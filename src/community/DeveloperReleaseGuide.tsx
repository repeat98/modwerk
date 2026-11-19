import { RELEASE_STEPS, type DeveloperTask } from './developer-guidance'
import type { StarterMachine } from './starter-prompts'
import { DEVICES_BY_ID, deviceHref, needsIntegration, type DeviceProfile } from '../devices/registry'
import { machineRoad } from '../devices/machine-road'

export function DeveloperReleaseGuide({ task, machine }: { task: DeveloperTask; machine: StarterMachine }) {
  const device = DEVICES_BY_ID[machine]
  if (needsIntegration(device)) return <IntegrationGuide device={device} />
  return <>
    <h2 id="developer-workflow-title">{task === 'create' ? 'Build, test, release' : 'Fix, test, release'}</h2>
    <p className="developer-lead">Your agent takes you through these steps.</p>
    <ol className="developer-release-list">{RELEASE_STEPS[task].map(step => <li key={step.title}><strong>{step.title}</strong><span>{step.summary}</span></li>)}</ol>
    <p className="developer-hint">{task === 'create' ? 'After your first release, you publish your own updates.' : 'A report stays open until the live download is checked.'}</p>
  </>
}

const STATE_LABELS = { done: 'Done', started: 'Started', open: 'Open' } as const

/** A machine not ready for modules: the road its machine page shows, with the next step marked, then the Octatrack's stack. */
function IntegrationGuide({ device }: { device: DeviceProfile }) {
  const road = machineRoad(device)
  return <>
    <h2 id="developer-workflow-title">Instrument integration</h2>
    <p className="developer-lead">Your agent picks up the next step. Each step is its own pull request, reviewed by the owner.</p>
    <ol className="developer-release-list">{road.steps.map(step => <li key={step.id}><strong>{step.title}</strong><span>{step === road.next ? 'Next' + (step.state === 'started' ? ', started' : '') : STATE_LABELS[step.state]}. {step.description}</span></li>)}</ol>
    <p className="developer-hint">Then the Octatrack’s stack: {road.stack.filter(piece => piece.state === 'done').length} of {road.stack.length} pieces done. <a href={deviceHref(device.id)}>The road on the machine page</a></p>
  </>
}

/** Reference links at the foot of the page: the guides. */
export function DeveloperLinks({ repository, machine }: { repository: string; machine: StarterMachine }) {
  const guide = (path: string) => repository + '/blob/main/' + path
  return <>
    <a href={guide('docs/ADD_A_MODULE.md')} target="_blank" rel="noreferrer">Module guide ↗</a>
    <a href={guide('docs/MODULE_AUTHOR_UPDATES.md')} target="_blank" rel="noreferrer">Releases & reports ↗</a>
    <a href={guide(DEVICES_BY_ID[machine]?.sdk || 'docs/ADD_A_MACHINE.md')} target="_blank" rel="noreferrer">{DEVICES_BY_ID[machine]?.sdk ? 'Instrument SDK' : 'Instrument integration'} ↗</a>
    <a href="#account/developer">Creator settings & support</a>
  </>
}
