import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { STARTER_MACHINES, starterPrompt, startersFor, updatePrompt, type StarterMachine } from './starter-prompts'
import type { DeveloperTask } from './developer-guidance'

export function CopyButton({ text, label = 'Copy', primary = false }: { text: string; label?: string; primary?: boolean }) {
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const copied = copiedText === text
  useEffect(() => { if (copiedText === null) return; const timer = window.setTimeout(() => setCopiedText(null), 2000); return () => window.clearTimeout(timer) }, [copiedText])
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopiedText(text) } catch { setCopiedText(null) } }
  return <button type="button" className={'button copy-button ' + (primary ? 'button-primary' : 'button-quiet')} onClick={copy}><Icon name={copied ? 'check' : 'file'} size={15} /><span aria-live="polite">{copied ? 'Copied' : label}</span></button>
}

export function StarterPrompts({ login, machine, onMachine, task, repository, initialModule = '' }: {
  login: string; repository: string; machine: StarterMachine; onMachine: (machine: StarterMachine) => void
  task: DeveloperTask; initialModule?: string
}) {
  const starters = startersFor(machine)
  const [starterId, setStarterId] = useState(starters[0].id)
  const [idea, setIdea] = useState('')
  const [change, setChange] = useState('')
  const [module, setModule] = useState(initialModule)
  const starter = starters.find(item => item.id === starterId) ?? starters[0]
  const prompt = task === 'create' ? starterPrompt(machine, starter, idea, login, repository) : updatePrompt(machine, module, change, '', repository, login)
  return <div className="starter-prompts">
    <div className="starter-fields">
      <label className="starter-field"><span>Instrument</span>
        <select value={machine} onChange={event => onMachine(event.target.value as StarterMachine)}>
          {STARTER_MACHINES.map(item => <option key={item.id} value={item.id}>{item.name}{item.note ? ' · ' + item.note : ''}</option>)}
        </select>
      </label>
      {task === 'create' ? <>
        <label className="starter-field"><span>Module type</span>
          <select value={starter.id} onChange={event => setStarterId(event.target.value)}>{starters.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
        </label>
        <label className="starter-field starter-field-wide"><span>{starter.port ? 'Module name or source link' : 'Your idea'} <small>optional</small></span>
          <textarea rows={2} value={idea} onChange={event => setIdea(event.target.value)} placeholder={starter.port ? 'The module name and a link to its source' : 'What should it do? Describe the controls, sound or behaviour.'} />
        </label>
      </> : <>
        <label className="starter-field"><span>Module ID or source link</span><input value={module} onChange={event => setModule(event.target.value)} placeholder="e.g. miniverb" /></label>
        <label className="starter-field starter-field-wide"><span>Change or GitHub issue link <small>optional</small></span><textarea rows={2} value={change} onChange={event => setChange(event.target.value)} placeholder="Describe the improvement, or link the report to fix." /></label>
      </>}
    </div>
    <div className="developer-prompt-actions"><span>Full workflow, tests and release rules included.</span><CopyButton text={prompt} label="Copy prompt" primary /></div>
    <details className="starter-prompt"><summary>Preview complete prompt</summary><pre tabIndex={0} aria-label="Starter prompt">{prompt}</pre></details>
  </div>
}
