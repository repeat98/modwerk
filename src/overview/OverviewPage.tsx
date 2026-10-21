import { useState } from 'react'
import { Icon } from '../components/Icon'
import { DeviceImage, MachinePhotoCredits } from '../devices/DeviceImage'
import { DEVICE_STEPS } from '../devices/registry'
import type { Overview, OverviewKind, OverviewMachine } from './overview'
import './overview.css'

// short: the label in the phone's segmented control.
const FILTERS: { id: OverviewKind | 'all'; label: string; short: string }[] = [{ id: 'all', label: 'All', short: 'All' }, { id: 'mods', label: 'Mods available', short: 'Mods' }, { id: 'research', label: 'Research started', short: 'Research' }, { id: 'open', label: 'No research yet', short: 'Open' }]

// One short phrase per machine: its modules, or how far the research has come.
function stateLabel(machine: OverviewMachine) {
  if (machine.count) return machine.count + (machine.count === 1 ? ' module' : ' modules') + (machine.device.status === 'preview' ? ' in preview' : '')
  return machine.kind === 'research' ? machine.stepsDone + ' of ' + DEVICE_STEPS.length + ' steps' : 'No research yet'
}

// The landing page: every machine as one tile, and where the machines without mods begin, an invitation to build the first one.
export function OverviewPage({ overview }: { overview: Overview }) {
  const [filter, setFilter] = useState<OverviewKind | 'all'>('all')
  const count = (id: OverviewKind | 'all') => id === 'all' ? overview.machines.length : overview.machines.filter(machine => machine.kind === id).length
  const shown = overview.machines.filter(machine => filter === 'all' || machine.kind === filter)
  return <div className="overview-page">
    <header className="overview-heading">
      <div>
        <h1>Choose your machine</h1>
        <p><span><b>{overview.modules}</b> modules by <b>{overview.creators}</b> developers</span><span className="overview-key" aria-label="Modules by category">{overview.categories.map(item => <span key={item.category}><i className={'is-' + item.category} aria-hidden="true" /><b>{item.count}</b> {item.label}</span>)}</span></p>
      </div>
      <div className="overview-chips" role="group" aria-label="Show machines">{FILTERS.map(item => <button key={item.id} type="button" className={'overview-chip is-' + item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.id !== 'all' && <i aria-hidden="true" />}<span className="overview-chip-label">{item.label}</span>{item.short !== item.label && <span className="overview-chip-short" aria-hidden="true">{item.short}</span>}<small>{count(item.id)}</small></button>)}</div>
    </header>
    <div className="machine-grid">
      {shown.filter(machine => machine.kind === 'mods').map(machine => <MachineTile key={machine.device.id} machine={machine} />)}
      {filter !== 'research' && filter !== 'open' && <DevelopTile machines={overview.machines.filter(machine => machine.count).map(machine => machine.device.name)} />}
      {shown.filter(machine => machine.kind !== 'mods').map(machine => <MachineTile key={machine.device.id} machine={machine} />)}
      {(filter === 'all' || filter === 'open') && <AddMachineTile />}
    </div>
    <MachinePhotoCredits />
  </div>
}

// Building a module for the machines that have mods, in three plain steps. It sits right after those machines.
function DevelopTile({ machines }: { machines: string[] }) {
  return <a className="overview-tile is-develop" href="#submit">
    <span className="overview-art">
      <span className="overview-waiting"><strong>Build your own mod</strong><small>{machines.join(' · ')}</small></span>
      <span className="overview-pitch">Describe your idea, paste the starter prompt into Claude or ChatGPT, build it together.</span>
    </span>
    <div className="overview-tile-body">
      <div className="overview-tile-line"><h2 className="overview-tile-name">Start developing</h2><Icon name="plus" size={16} /></div>
    </div>
  </a>
}

// The last tile: Modwerk is not limited to the machines above, whichever company makes the instrument.
function AddMachineTile() {
  return <a className="overview-tile is-develop is-add-machine" href="#forum?category=requests">
    <span className="overview-art">
      <span className="overview-waiting"><strong>Add your machine</strong><small>Any instrument · any maker</small></span>
      <span className="overview-pitch">Not only Elektron. Suggest the instrument you want to mod and help open its firmware.</span>
    </span>
    <div className="overview-tile-body">
      <div className="overview-tile-line"><h2 className="overview-tile-name">Suggest a machine</h2><Icon name="plus" size={16} /></div>
    </div>
  </a>
}

function MachineTile({ machine }: { machine: OverviewMachine }) {
  const { device } = machine, variants = device.variants?.join(' · ')
  // Without mods the machine is locked: its picture starts the work (the first mod once it has a core, otherwise unlocking it,
  // which needs programming experience), its name opens the research page.
  if (!machine.count) {
    const action = machine.coreReady ? 'Build the first mod' : 'Help unlock'
    return <article className={'overview-tile is-locked is-' + machine.kind}>
    <a className="overview-art" href={machine.developHref} aria-label={action + ': ' + device.name + (variants ? ' ' + variants : '') + (machine.coreReady ? '' : ', programming experience needed')}>
      <DeviceImage device={device} />
      <span className="overview-lock" aria-hidden="true"><Icon name="lock" size={22} /></span>
      <span className="overview-cta" aria-hidden="true"><span><Icon name="plus" size={15} />{action}</span>{!machine.coreReady && <small>Programming experience needed</small>}</span>
    </a>
    <div className="overview-tile-body">
      <div className="overview-tile-line">
        <h2 className="overview-tile-name"><a href={machine.href}>{device.name}</a>{variants && <small>{variants}</small>}</h2>
        <span className="overview-state">{stateLabel(machine)}</span>
      </div>
      <span className="overview-ladder" aria-hidden="true">{DEVICE_STEPS.map(step => <i key={step.id} className={'is-' + device.steps[step.id]} title={step.title + (device.steps[step.id] === 'done' ? ': done' : device.steps[step.id] === 'started' ? ': started' : '')} />)}</span>
    </div>
  </article>
  }
  return <a className={'overview-tile is-' + machine.kind + ' is-' + device.status} href={machine.href}>
    <span className="overview-art"><DeviceImage device={device} /></span>
    <div className="overview-tile-body">
      <div className="overview-tile-line">
        <h2 className="overview-tile-name">{device.name}{variants && <small>{variants}</small>}</h2>
        <span className="overview-state">{stateLabel(machine)}</span>
      </div>
      <span className="overview-mix" aria-hidden="true">{machine.categories.map(item => <span key={item.category} className={'is-' + item.category} style={{ flexGrow: item.count }} title={item.label + ': ' + item.count} />)}</span>
    </div>
  </a>
}
