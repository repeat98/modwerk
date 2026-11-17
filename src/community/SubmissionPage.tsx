import { useState } from 'react'
import { BackLink } from '../components/BackLink'
import { CopyButton, StarterPrompts } from './StarterPrompts'
import { cloneCommands, setupPrompt, STARTER_MACHINES, type StarterMachine } from './starter-prompts'
import { assetUrl, sourceRepository } from '../hosting'
import { communityModule } from './modules'
import { DEVELOPMENT_DISCORD_URL } from '../config/development-discord'
import { DeveloperLinks, DeveloperReleaseGuide } from './DeveloperReleaseGuide'
import { AgentBoard } from './AgentBoard'
import { DEVELOPER_SKILLS, type DeveloperTask } from './developer-guidance'
import '../components/developer-release-guide.css'
import './develop-intro.css'
import { DEVICES_BY_ID, readyForMods, type DeviceProfile } from '../devices/registry'

// A machine without a core has to be unlocked first: reverse engineering, which needs programming experience.
function unlockNote(device: DeviceProfile | undefined) {
  const first = device?.family === 'erica' ? 'Its firmware source is public, but a Modwerk build has to boot from the SD card and give mods a place to run first.'
    : device?.family === 'zoom' ? 'Its effect files have to be understood and loaded on the stock firmware first.'
    : 'Its firmware has to be understood, rebuilt and booted first.'
  return first + ' Your agent helps, but you need to read and judge code.'
}

// machine: preselected from #submit?machine=<id>, as the overview's Start developing links do.
export function SubmissionPage({ moduleId = '', machine: initialMachine }: { moduleId?: string; machine?: string }) {
  const module = communityModule(moduleId)
  const repository = sourceRepository() || 'https://github.com/repeat98/modwerk'
  const [login, setLogin] = useState('')
  const [task, setTask] = useState<DeveloperTask>(module ? 'update' : 'create')
  const [machine, setMachine] = useState<StarterMachine>(() => STARTER_MACHINES.find(item => item.id === (module?.machine ?? initialMachine))?.id ?? 'octatrack')
  const clone = cloneCommands(repository, login), setup = setupPrompt(repository)
  const device = DEVICES_BY_ID[machine], locked = !module && !(device && readyForMods(device)), machineName = STARTER_MACHINES.find(item => item.id === machine)?.name ?? machine

  return <div className="community-page contribution-page start-developing">
    <BackLink href={moduleId ? '#developer' : '#library'}>{moduleId ? 'Creator settings' : 'Module library'}</BackLink>
    <header className="developer-hero">
      <h1>{module ? 'Update ' + module.name : locked ? <>Help unlock the {machineName}. <span>Programming experience needed.</span></> : 'Make a mod for your machine.'}</h1>
      <p className="developer-intro">{module ? 'Current version ' + module.version + '.' : locked ? unlockNote(device) : 'Your coding agent writes the code. You bring the idea and try it on your machine.'}</p>
    </header>

    <ol className="developer-path">
      <li aria-labelledby="setup-title">
        <h2 id="setup-title">Set up your computer</h2>
        <p className="developer-lead">Paste this into Claude Code or Codex. It sets everything up and asks before it installs anything.</p>
        <CopyButton text={setup} label="Copy setup prompt" primary />
        <p className="developer-hint">No coding agent yet? Paste it into ChatGPT or Gemini, and it helps you get one.</p>
        <details className="starter-prompt"><summary>Show the prompt</summary><pre tabIndex={0} aria-label="Setup prompt">{setup}</pre></details>
        <details className="developer-setup">
          <summary>Set it up by hand</summary>
          <p>Fork Modwerk, clone your fork and open the folder in your coding agent. <a href={repository + '/blob/main/docs/DEVELOPER_WORKFLOW.md#your-development-setup'} target="_blank" rel="noreferrer">What each instrument needs ↗</a></p>
          <label className="starter-field"><span>Your GitHub login <small>optional</small></span><input value={login} onChange={event => setLogin(event.target.value)} placeholder="your-github-login" autoCapitalize="off" autoCorrect="off" spellCheck={false} /></label>
          <div className="start-code"><pre>{clone}</pre></div>
          <div className="developer-setup-actions"><CopyButton text={clone} label="Copy clone commands" /><a className="button button-quiet" href={repository + '/fork'} target="_blank" rel="noreferrer">Fork on GitHub ↗</a></div>
        </details>
      </li>
      <li aria-labelledby="agent-start-title">
        <h2 id="agent-start-title">{locked ? 'Start the integration' : task === 'update' ? 'Describe the change' : 'Describe your idea'}</h2>
        <div className="developer-task-choice" role="group" aria-label="Development task">
          <button type="button" aria-pressed={task === 'create'} onClick={() => setTask('create')}>New module or port</button>
          <button type="button" aria-pressed={task === 'update'} onClick={() => setTask('update')}>Fix or update</button>
        </div>
        <StarterPrompts login={login} repository={repository} task={task} machine={machine} onMachine={setMachine} initialModule={module?.sourcePath} />
      </li>
      <li aria-labelledby="developer-workflow-title"><DeveloperReleaseGuide task={task} machine={machine} /></li>
    </ol>

    <section className="developer-more" aria-label="More for developers">
      <h2 id="commands-title">Commands in your agent</h2>
      <ul className="developer-skills" aria-labelledby="commands-title">{DEVELOPER_SKILLS.map(skill => <li key={skill.name}><code>/{skill.name}</code><span>{skill.summary}</span></li>)}</ul>
      <AgentBoard repository={repository} />
      <nav className="developer-help" aria-label="Help and guides">
        <a className="button development-discord-button" href={DEVELOPMENT_DISCORD_URL} target="_blank" rel="noreferrer" aria-label="Join Discord for module development (opens in a new tab)"><img src={assetUrl('auth/discord.svg')} width={20} height={15} alt="" aria-hidden="true" /><span>Join Discord</span><span aria-hidden="true">↗</span></a>
        <a href={repository} target="_blank" rel="noreferrer">Modwerk on GitHub ↗</a>
        <DeveloperLinks repository={repository} machine={machine} />
      </nav>
    </section>
  </div>
}
