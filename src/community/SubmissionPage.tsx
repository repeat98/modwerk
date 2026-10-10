import { useState } from 'react'
import { BackLink } from '../components/BackLink'
import { CopyButton, StarterPrompts } from './StarterPrompts'
import { cloneCommands, STARTER_MACHINES, type StarterMachine } from './starter-prompts'
import { assetUrl, sourceRepository } from '../hosting'
import { communityModule } from './modules'
import { DEVELOPMENT_DISCORD_URL } from '../config/development-discord'
import { DeveloperReleaseGuide } from './DeveloperReleaseGuide'
import type { DeveloperTask } from './developer-guidance'
import '../components/developer-release-guide.css'

export function SubmissionPage({ moduleId = '' }: { moduleId?: string }) {
  const module = communityModule(moduleId)
  const repository = sourceRepository() || 'https://github.com/repeat98/modwerk'
  const [login, setLogin] = useState('')
  const [task, setTask] = useState<DeveloperTask>(module ? 'update' : 'create')
  const [machine, setMachine] = useState<StarterMachine>(() => STARTER_MACHINES.find(item => item.id === module?.machine)?.id ?? 'octatrack')
  const clone = cloneCommands(repository, login)

  return <div className="community-page contribution-page start-developing">
    <BackLink href={moduleId ? '#developer' : '#library'}>{moduleId ? 'Creator settings' : 'Module library'}</BackLink>
    <header className="page-heading developer-heading">
      <div><p className="page-kicker">MODWERK / DEVELOPERS</p><h1>{module ? 'Update ' + module.name : 'Start developing'}</h1>
        <p>{module ? 'Current version ' + module.version + '. ' : ''}One prompt for your agent. Four steps to publication.</p>
      </div>
      <div className="developer-heading-links">
        <a className="button development-discord-button" href={DEVELOPMENT_DISCORD_URL} target="_blank" rel="noreferrer" aria-label="Join Discord for module development (opens in a new tab)">
          <img src={assetUrl('auth/discord.svg')} width={20} height={15} alt="" aria-hidden="true" /><span>Join Discord</span><span aria-hidden="true">↗</span>
        </a>
        <a className="developer-repository-link" href={repository} target="_blank" rel="noreferrer" aria-label="Modwerk repository on GitHub (opens in a new tab)">Modwerk on GitHub <span aria-hidden="true">↗</span></a>
      </div>
    </header>

    <section className="configuration-section developer-start" aria-labelledby="agent-start-title">
      <div className="developer-section-heading"><h2 id="agent-start-title">Your coding prompt</h2><span className="subtle">Open your agent in your Modwerk fork</span></div>
      <div className="developer-task-choice" role="group" aria-label="Development task">
        <button type="button" aria-pressed={task === 'create'} onClick={() => setTask('create')}><strong>New module or port</strong><span>First release</span></button>
        <button type="button" aria-pressed={task === 'update'} onClick={() => setTask('update')}><strong>Fix or update</strong><span>Existing module</span></button>
      </div>
      <StarterPrompts login={login} repository={repository} task={task} machine={machine} onMachine={setMachine} initialModule={module?.sourcePath} />
      <details className="developer-guide-details developer-setup">
        <summary>Need to set up your fork?</summary>
        <div className="developer-setup-content"><div><p>Fork, clone and open the folder in your coding agent. No GitHub account or agent yet? Paste the prompt into ChatGPT, Gemini or Claude and it walks you through setup. Node 24; Octatrack native builds also need Python 3.10+, Docker and your own OS 1.40C.</p>
          <a className="button button-quiet" href={repository + '/fork'} target="_blank" rel="noreferrer">Fork on GitHub ↗</a>
          <label className="starter-field"><span>Your GitHub login <small>optional</small></span><input value={login} onChange={event => setLogin(event.target.value)} placeholder="your-github-login" autoCapitalize="off" autoCorrect="off" spellCheck={false} /></label>
        </div><div className="start-code"><pre>{clone}</pre><CopyButton text={clone} label="Copy clone commands" /></div></div>
      </details>
    </section>

    <DeveloperReleaseGuide repository={repository} task={task} machine={machine} />
  </div>
}
