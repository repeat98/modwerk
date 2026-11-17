import { INSTRUMENT_STEPS, RELEASE_STEPS, type DeveloperTask } from './developer-guidance'
import type { StarterMachine } from './starter-prompts'
import { DEVICES_BY_ID } from '../devices/registry'

export function DeveloperReleaseGuide({ task, machine }: { task: DeveloperTask; machine: StarterMachine }) {
  const hasSdk = Boolean(DEVICES_BY_ID[machine]?.sdk)
  const steps = hasSdk ? RELEASE_STEPS[task] : INSTRUMENT_STEPS
  return <>
    <h2 id="developer-workflow-title">{!hasSdk ? 'Instrument integration' : task === 'create' ? 'Build, test, release' : 'Fix, test, release'}</h2>
    <p className="developer-lead">Your agent takes you through these steps.</p>
    <ol className="developer-release-list">{steps.map(step => <li key={step.title}><strong>{step.title}</strong><span>{step.summary}</span></li>)}</ol>
    <p className="developer-hint">{!hasSdk ? 'No SDK yet: the instrument comes first, then modules.' : task === 'create' ? 'After your first release, you publish your own updates.' : 'A report stays open until the live download is checked.'}</p>
  </>
}

/** Reference links at the foot of the page: the guides and the separate catalogues. */
export function DeveloperLinks({ repository, machine }: { repository: string; machine: StarterMachine }) {
  const guide = (path: string) => repository + '/blob/main/' + path
  return <>
    <a href={guide('docs/ADD_A_MODULE.md')} target="_blank" rel="noreferrer">Module guide ↗</a>
    <a href={guide('docs/MODULE_AUTHOR_UPDATES.md')} target="_blank" rel="noreferrer">Releases & reports ↗</a>
    <a href={guide(DEVICES_BY_ID[machine]?.sdk || 'docs/ADD_A_MACHINE.md')} target="_blank" rel="noreferrer">{DEVICES_BY_ID[machine]?.sdk ? 'Instrument SDK' : 'Instrument integration'} ↗</a>
    <a href="#account/developer">Creator settings & support</a>
    <a href="https://github.com/sambanks/octabam" target="_blank" rel="noreferrer">Octabam ↗</a>
    <a href="https://github.com/irpina/elekloader" target="_blank" rel="noreferrer">Elekloader ↗</a>
  </>
}
