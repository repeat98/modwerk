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
import './develop-intro.css'
import { Icon } from '../components/Icon'
import { DEVICES_BY_ID } from '../devices/registry'

// machine: preselected from #submit?machine=<id>, as the overview's Start developing links do.
export function SubmissionPage({ moduleId = '', machine: initialMachine }: { moduleId?: string; machine?: string }) {
  const module = communityModule(moduleId)
  const repository = sourceRepository() || 'https://github.com/repeat98/modwerk'
  const [login, setLogin] = useState('')
  const [task, setTask] = useState<DeveloperTask>(module ? 'update' : 'create')
  const [machine, setMachine] = useState<StarterMachine>(() => STARTER_MACHINES.find(item => item.id === (module?.machine ?? initialMachine))?.id ?? 'octatrack')
  const clone = cloneCommands(repository, login)
  // A machine without a core has to be unlocked first: reverse engineering, which needs programming experience.
  const locked = !module && DEVICES_BY_ID[machine]?.steps.core !== 'done', machineName = STARTER_MACHINES.find(item => item.id === machine)?.name ?? machine

  return <div className="community-page contribution-page start-developing">
    <BackLink href={moduleId ? '#developer' : '#library'}>{moduleId ? 'Creator settings' : 'Module library'}</BackLink>
    <header className="page-heading developer-heading">
      <div><p className="page-kicker">MODWERK / DEVELOPERS</p><h1>{module ? 'Update ' + module.name : locked ? <>Help unlock the {machineName}. <span>Programming experience needed.</span></> : <>Make a mod for your machine. <span>Describe it, paste one prompt, build it together.</span></>}</h1>
        <p>{module ? 'Current version ' + module.version + '. One prompt for your agent. Four steps to publication.' : locked ? 'Before anyone can build mods for it, its firmware file has to be understood, rebuilt and booted, and a core has to give mods a place to run. That is reverse-engineering work. An AI coding assistant helps, but you need to read and judge code yourself. The starter prompt below sets up the machine integration with you.' : 'An AI coding assistant writes and checks the code. You bring the idea, try it on your machine and decide when it’s ready. The starter prompt below sets everything up with you and guides you through every step.'}</p>
      </div>
      <div className="developer-heading-links">
        <a className="button development-discord-button" href={DEVELOPMENT_DISCORD_URL} target="_blank" rel="noreferrer" aria-label="Join Discord for module development (opens in a new tab)">
          <img src={assetUrl('auth/discord.svg')} width={20} height={15} alt="" aria-hidden="true" /><span>Join Discord</span><span aria-hidden="true">↗</span>
        </a>
        <a className="developer-repository-link" href={repository} target="_blank" rel="noreferrer" aria-label="Modwerk repository on GitHub (opens in a new tab)">Modwerk on GitHub <span aria-hidden="true">↗</span></a>
      </div>
    </header>
    {!module && !locked && <DevelopIntro />}

    <section className="configuration-section developer-start" aria-labelledby="agent-start-title">
      <div className="developer-section-heading"><h2 id="agent-start-title">Your starter prompt</h2><span className="subtle">{module ? 'Open your agent in your Modwerk fork' : 'Paste it into Claude or ChatGPT, or straight into your coding agent'}</span></div>
      <div className="developer-task-choice" role="group" aria-label="Development task">
        <button type="button" aria-pressed={task === 'create'} onClick={() => setTask('create')}><strong>New module or port</strong><span>First release</span></button>
        <button type="button" aria-pressed={task === 'update'} onClick={() => setTask('update')}><strong>Fix or update</strong><span>Existing module</span></button>
      </div>
      <StarterPrompts login={login} repository={repository} task={task} machine={machine} onMachine={setMachine} initialModule={module?.sourcePath} />
      <details className="developer-guide-details developer-setup">
        <summary>Need to set up your fork?</summary>
        <div className="developer-setup-content"><div><p>Fork, clone and open the folder in your coding agent. No GitHub account or agent yet? Paste the prompt into your AI assistant and it walks you through setup. Node 24; Octatrack native builds also need Python 3.10+, Docker and your own OS 1.40C.</p>
          <p>Test on your own unit where you can: on the Octatrack your agent drives it over USB through the <a href={repository + '/blob/main/docs/DEVELOPER_WORKFLOW.md#your-development-setup'} target="_blank" rel="noreferrer">developer MCP ↗</a>, which also reaches the site. Without a unit, the emulators get you started, though they only approximate the instrument.</p>
          <a className="button button-quiet" href={repository + '/fork'} target="_blank" rel="noreferrer">Fork on GitHub ↗</a>
          <label className="starter-field"><span>Your GitHub login <small>optional</small></span><input value={login} onChange={event => setLogin(event.target.value)} placeholder="your-github-login" autoCapitalize="off" autoCorrect="off" spellCheck={false} /></label>
        </div><div className="start-code"><pre>{clone}</pre><CopyButton text={clone} label="Copy clone commands" /></div></div>
      </details>
    </section>

    <DeveloperReleaseGuide repository={repository} task={task} machine={machine} />
  </div>
}

// For someone who has never programmed: what it takes and who does what, before the prompt itself.
function DevelopIntro() {
  return <section className="develop-intro" aria-label="Before you start">
    <div><h2>What you need</h2>
      <ul className="develop-needs">
        <li><span className="develop-need-icon"><Icon name="message" /></span><strong>An AI coding assistant</strong><small>Modules are built with large language models (LLMs). The assistant writes and checks the code with you.</small></li>
        <li><span className="develop-need-icon"><Icon name="file" /></span><strong>A free GitHub account</strong><small>Where your module lives. The prompt helps you create one if you don’t have it yet.</small></li>
        <li className="is-optional"><span className="develop-need-icon"><Icon name="sliders" /></span><strong>Your machine</strong><small>To try your mod for real. You can start in an emulator without one.</small></li>
      </ul>
    </div>
    <div><h2>How it works <span className="subtle">You decide, the assistant does the coding</span></h2>
      <ol className="develop-steps">
        <li><span className="develop-step-number">01</span><h3>Describe your idea</h3><p>Choose your machine and say what the mod should do, in plain words. Below, this page turns it into your starter prompt.</p><span className="develop-step-who">You · 2 minutes</span></li>
        <li><span className="develop-step-number">02</span><h3>Paste it into Claude or ChatGPT</h3><p>It asks which computer you use, then sets up GitHub, your copy of Modwerk and the coding assistant with you, one step at a time. No terminal experience assumed.</p><span className="develop-step-who">The chat guides you</span></li>
        <li><span className="develop-step-number">03</span><h3>Build and test together</h3><p>The assistant writes the module, runs the checks and helps you test it. Then it opens the pull request, and your first release is reviewed before it goes live.</p><span className="develop-step-who">The assistant codes, you test</span></li>
      </ol>
    </div>
  </section>
}
