import { useState } from 'react'
import { Icon } from '../components/Icon'
import { SUPPORT_MAILTO } from '../support'
import { EXTERNAL_PROJECTS, PROJECT_MACHINES, PROJECT_TITLE, PROJECT_TYPES, filterProjects } from './projects'
import './projects.css'
import { ProjectThumbnail } from './ProjectThumbnail'

export function ProjectsPage({ route = 'projects' }: { route?: string }) {
  const params = new URLSearchParams(route.split('?')[1] ?? '')
  const [query, setQuery] = useState('')
  const [machine, setMachine] = useState(Object.hasOwn(PROJECT_MACHINES, params.get('machine') ?? '') ? params.get('machine')! : 'all')
  const [type, setType] = useState('all')
  const results = filterProjects(query, machine, type)
  const filtered = query !== '' || machine !== 'all' || type !== 'all'
  function reset() { setQuery(''); setMachine('all'); setType('all') }
  return <div className="projects-page">
    <header className="projects-heading"><div><span className="projects-kicker">Beyond the builder</span><h1>{PROJECT_TITLE}</h1><p>A few good rabbit holes, chosen for what they bring to your setup. Prepare samples, manage projects, play in new ways or build your own tools.</p></div><div className="projects-heading-count" aria-label={EXTERNAL_PROJECTS.length + ' selected projects'}><strong>{EXTERNAL_PROJECTS.length}</strong><span>selected<br />projects <Icon name="external" size={13} /></span></div></header>
    <aside className="projects-intro"><Icon name="external" size={20} /><div><strong>Find your next rabbit hole</strong><p>These projects cannot be added to a Modwerk configuration. Follow the creator’s link for supported models, OS versions, installation instructions and support.</p></div></aside>
    {!filtered && <nav className="projects-starting-points" aria-label="Suggested starting points"><span>Start with a workflow</span>{[{ name: 'DigiChain', label: 'Prepare sample chains' }, { name: 'DNX', label: 'Organize Digitone projects' }, { name: 'Monomodule', label: 'Play in your DAW' }].map(item => <button key={item.name} type="button" onClick={() => setQuery(item.name)}>{item.label}<Icon name="arrow" size={14} /></button>)}</nav>}
    <div className="projects-filters">
      <label className="projects-search"><span className="sr-only">Search other projects</span><Icon name="search" size={17} /><input type="search" placeholder="Search projects, creators or features" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label className="projects-machine"><span className="sr-only">Filter projects by instrument</span><select value={machine} onChange={event => setMachine(event.target.value)}><option value="all">All instruments</option>{Object.entries(PROJECT_MACHINES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    </div>
    <div className="projects-results-bar"><div className="projects-types" role="group" aria-label="Filter projects by type"><button type="button" aria-pressed={type === 'all'} onClick={() => setType('all')}>All</button>{Object.entries(PROJECT_TYPES).map(([id, label]) => <button key={id} type="button" aria-pressed={type === id} onClick={() => setType(id)}>{label}</button>)}</div><span role="status">{results.length} {results.length === 1 ? 'project' : 'projects'}{filtered && <> of {EXTERNAL_PROJECTS.length}</>}</span>{filtered && <button className="text-button" type="button" onClick={reset}>Clear filters</button>}</div>
    {results.length ? <div className="projects-grid">{results.map(item => <article className="project-card" key={item.repository}>
      <ProjectThumbnail project={item} />
      <div className="project-card-type">{PROJECT_TYPES[item.type]}</div>
      <h2><a href={item.repository} target="_blank" rel="noopener noreferrer">{item.name}<Icon name="external" size={17} /><span className="sr-only"> (opens in a new tab)</span></a></h2>
      <a className="project-author" href={'https://github.com/' + item.author} target="_blank" rel="noopener noreferrer">{item.author}<span className="sr-only"> on GitHub (opens in a new tab)</span></a>
      <p>{item.description}</p>
      <ul className="project-machines" aria-label="Related instruments">{item.machines.map(id => <li key={id}>{PROJECT_MACHINES[id]}</li>)}</ul>
      <a className="project-open" href={item.repository} target="_blank" rel="noopener noreferrer">Visit project <Icon name="external" size={14} /><span className="sr-only">: {item.name} (opens in a new tab)</span></a>
    </article>)}</div> : <div className="no-results"><Icon name="search" size={28} /><h2>No projects match these filters</h2><p>Try another instrument, project type or search term.</p><button className="button button-quiet" type="button" onClick={reset}>Clear filters</button></div>}
    <footer className="projects-footer"><p>Made something useful for these machines?</p><a className="button button-quiet" href={SUPPORT_MAILTO + '?subject=' + encodeURIComponent('Project for the Modwerk directory') + '&body=' + encodeURIComponent('Project name:\nProject URL:\nInstruments:\nWhat it does:\n')}><Icon name="mail" size={15} />Want me to add your project?</a><small>A curated selection, based on a clear purpose, useful documentation and distinct workflows. GitHub previews belong to their respective projects.</small></footer>
  </div>
}
