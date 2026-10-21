import { existsSync, readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SubmissionPage } from './SubmissionPage'
import { cloneCommands, STARTER_MACHINES, starterPrompt, starterReading, startersFor, updatePrompt } from './starter-prompts'
import { RELEASE_STEPS } from './developer-guidance'
import { DEVICES } from '../devices/registry'

const all = STARTER_MACHINES.flatMap(machine => startersFor(machine.id).map(starter => ({ machine: machine.id, starter })))

describe('starter prompts', () => {
  it('lists every registered instrument and routes those without an SDK to integration', () => {
    expect(STARTER_MACHINES.map(machine => machine.id)).toEqual(DEVICES.map(device => device.id))
    for (const device of DEVICES.filter(device => !device.sdk)) {
      const starter = startersFor(device.id)[0]
      expect(starter.id).toBe('integration')
      const prompt = starterPrompt(device.id, starter, 'A new sound engine')
      expect(prompt).toContain('no published Modwerk SDK or qualified module builder yet')
      expect(prompt).toContain('docs/ADD_A_MACHINE.md')
      expect(prompt).toContain('sdk/machines/' + device.id + '/machine.json')
      expect(prompt).not.toContain('npm run module:new')
      expect(prompt).not.toContain('core_machines, slots 4–7')
    }
  })
  it('only ask the agent to read files that exist', () => {
    for (const { machine, starter } of all) for (const file of starterReading(machine, starter)) expect(existsSync(file), machine + '/' + starter.id + ': ' + file).toBe(true)
  })

  it('scaffold with the command for the machine and keep placeholders until filled', () => {
    expect(starterPrompt('octatrack', startersFor('octatrack')[0])).toContain('npm run module:new -- <id> --kind dsp|coldfire --author <your-github-login>')
    expect(starterPrompt('digitone', startersFor('digitone')[0])).toContain('npm run module:new -- <id> --machine digitone --author <your-github-login>')
    const filled = starterPrompt('digitakt', startersFor('digitakt')[1], 'A tilt EQ with one knob', '@octo-dev')
    expect(filled).toContain('A tilt EQ with one knob')
    expect(filled).toContain('--author octo-dev')
    expect(filled).not.toMatch(/<describe|\{idea\}/)
  })

  it('send ports through the import path instead of a scaffold', () => {
    for (const { machine, starter } of all.filter(item => item.starter.port)) expect(starterPrompt(machine, starter)).not.toContain('module:new')
  })

  it('clone the contributor’s fork and track the source repository', () => {
    expect(cloneCommands('https://github.com/repeat98/modwerk', 'octo-dev')).toBe('git clone https://github.com/octo-dev/modwerk.git\ncd modwerk\ngit remote add upstream https://github.com/repeat98/modwerk.git\nnvm use && npm ci')
  })

  it('names the displayed workflow stages in every prompt and leaves their rules to the repository', () => {
    for (const machine of STARTER_MACHINES.filter(item => DEVICES.find(device => device.id === item.id)?.sdk)) {
      const prompts = {
        create: starterPrompt(machine.id, startersFor(machine.id)[0]),
        update: updatePrompt(machine.id),
      }
      for (const task of ['create', 'update'] as const) {
        const prompt = prompts[task]
        for (const step of RELEASE_STEPS[task]) expect(prompt).toContain(step.summary)
        expect(prompt).toContain('AGENTS.md first')
        expect(prompt).toContain('docs/DEVELOPER_WORKFLOW.md')
        expect(prompt).toContain('record only results I actually report')
        expect(prompt).toContain('tell me in chat that publication will notify followers, including by email unless they opted out')
        expect(prompt).toContain('never commit firmware')
        expect(prompt).not.toMatch(/Jannik|Assfalg/i)
        // The prompt carries the order of work; the rules live in files every agent reads.
        expect(prompt.length, machine.id + ' ' + task).toBeLessThan(6000)
      }
    }
  })

  it('asks the agent to share findings as a separate docs-only PR', () => {
    for (const prompt of [starterPrompt('octatrack', startersFor('octatrack')[0]), updatePrompt('digitakt')]) {
      expect(prompt).toContain('Fixes and improvements')
      expect(prompt).toContain('"Fix: …", "Improvement: …" or "Docs: …"')
      expect(prompt).toContain('Never put it in the module PR')
    }
    expect(readFileSync('AGENTS.md', 'utf8')).toContain('Leave `sdk/octabam/AGENTS.md` unchanged')
  })

  it('has the agent check the catalogue for duplicates before it plans a new module', () => {
    for (const { machine, starter } of all.filter(item => DEVICES.find(device => device.id === item.machine)?.sdk)) {
      const prompt = starterPrompt(machine, starter)
      expect(prompt).toContain('look at what Modwerk already has')
      expect(prompt).toContain('instead of building a duplicate')
      expect(prompt.indexOf('look at what Modwerk already has')).toBeLessThan(prompt.indexOf('Before you write code, read'))
      expect(prompt).toContain('never patch a site another module or the base patches')
      expect(prompt).toContain('on my unit (recommended')
    }
    for (const file of ['sdk/catalog.json', 'src/catalog/machine-modules.json', 'sdk/drafts']) expect(existsSync(file), file).toBe(true)
    expect(updatePrompt('digitakt')).not.toContain('look at what Modwerk already has')
  })

  it('keeps the rules the prompts no longer carry in the files they send the agent to', () => {
    const agents = readFileSync('AGENTS.md', 'utf8'), workflow = readFileSync('docs/DEVELOPER_WORKFLOW.md', 'utf8')
    expect(agents).toContain('instead of building a duplicate')
    expect(agents).toContain('Refuse a module that copies someone else')
    expect(workflow).toContain('## Check what already exists')
    expect(workflow).toContain('## Refuse infringing work')
    expect(readFileSync('docs/module-guides/README.md', 'utf8')).toContain('## Cross-compatibility')
    expect(workflow).toContain('## Your development setup')
    expect(workflow).toContain('## Make it mergeable')
    expect(workflow).toContain('### Fixes and improvements')
    expect(readFileSync('.github/workflows/pr-flags.yml', 'utf8')).toContain('Improvement:*) label=enhancement')
    expect(readFileSync('.github/pull_request_template.md', 'utf8')).toContain('**What was wrong or hard:**')
    expect(agents).toContain('npm run pr:ready')
    expect(updatePrompt('digitakt')).toContain('npm run pr:ready -- --author <my login>')
    expect(readFileSync('docs/ADD_A_MACHINE.md', 'utf8')).toContain("## Aim for the Octatrack's interface")
    expect(workflow).toContain('--device-socket')
    expect(workflow).toContain('Building a USB interface for the machine is recommended')
    expect(agents).toContain('Emulators (')
    expect(updatePrompt('digitakt')).toContain('"Your development setup" in docs/DEVELOPER_WORKFLOW.md')
    expect(readFileSync('docs/MODULE_AUTHOR_UPDATES.md', 'utf8')).toContain('Automatically merge and publish my module update after checks pass.')
  })

  it('opens every prompt with a setup check: coding agents skip it, chat assistants guide a newcomer', () => {
    const prompts = [
      starterPrompt('octatrack', startersFor('octatrack')[0], '', 'octo-dev', 'https://github.com/acme/modwerk'),
      updatePrompt('digitakt', 'digi-eq', '', '', 'https://github.com/acme/modwerk', 'octo-dev'),
      ...DEVICES.filter(device => !device.sdk).map(device => starterPrompt(device.id, startersFor(device.id)[0], '', 'octo-dev', 'https://github.com/acme/modwerk')),
    ]
    for (const prompt of prompts) {
      expect(prompt.startsWith('Read this first: which kind of assistant are you?')).toBe(true)
      expect(prompt).toContain('skip this block and do not walk me through setup')
      expect(prompt).toContain('you cannot build a module. Do not propose a module')
      expect(prompt).toContain('A chat assistant must not act on anything below')
      expect(prompt.endsWith('starting with my operating system.')).toBe(true)
      expect(prompt).toContain('github.com/signup')
      expect(prompt).toContain('Fork https://github.com/acme/modwerk with the Fork button')
      expect(prompt).toContain('git clone https://github.com/octo-dev/modwerk.git')
      expect(prompt).not.toMatch(/Jannik|Assfalg/i)
    }
    expect(starterPrompt('octatrack', startersFor('octatrack')[0])).toContain('git clone https://github.com/<your-github-login>/modwerk.git')
  })

  it('keeps author verification and live-download checks in the update prompt', () => {
    const prompt = updatePrompt('digitakt', 'sdk/digitakt/modules/digi-eq', 'Fix a filter click', 'https://github.com/repeat98/modwerk/issues/123')
    expect(prompt).toContain('Fix issue https://github.com/repeat98/modwerk/issues/123')
    expect(prompt).toContain('Digitakt mk1')
    expect(prompt).toContain('Fix a filter click')
    expect(prompt).not.toContain('module:new')
    expect(prompt).toContain('never check them for me')
    expect(prompt).toContain('docs/MODULE_AUTHOR_UPDATES.md')
    expect(prompt).toContain('A push or merge alone never closes a Modwerk report')
    expect(prompt).toContain('Missing, failed or untested required checks block automatic publication')
    expect(prompt).toContain('"Related to #<number>", not closing keywords')
  })
})

describe('start developing page', () => {
  it('says that unlocking a machine without a core needs programming experience', () => {
    const html = renderToStaticMarkup(createElement(SubmissionPage, { machine: 'analog-heat' }))
    expect(html).toContain('Help unlock the Analog Heat')
    expect(html).toContain('Programming experience needed.')
    expect(html).not.toContain('Describe it, paste one prompt, build it together.')
    expect(html).not.toContain('What you need')
  })

  it('shows one complete prompt and hides its long preview and setup by default', () => {
    const html = renderToStaticMarkup(createElement(SubmissionPage))
    expect(html).toContain('Describe it, paste one prompt, build it together.')
    expect(html).toContain('An AI coding assistant')
    expect(html).toContain('/fork"')
    expect(html).toContain('Copy prompt')
    expect(html.match(/Copy prompt/g)).toHaveLength(1)
    expect(html).toContain('Preview complete prompt')
    expect(html).toContain('DEVELOPER_WORKFLOW.md#your-development-setup')
    expect(html).not.toContain('<details open')
    expect(html.indexOf('What you need')).toBeLessThan(html.indexOf('Your starter prompt'))
    expect(html.indexOf('Your starter prompt')).toBeLessThan(html.indexOf('Your first release'))
  })

  it('preselects the machine an overview link names', () => {
    const html = renderToStaticMarkup(createElement(SubmissionPage, { machine: 'syntakt' }))
    expect(html).toMatch(/<option value="syntakt" selected="">/)
    expect(html).toContain('Instrument integration')
  })

  it.each(['miniverb', 'digitakt-digihealth', 'digitone-digihealth'])('prefills the correct update path for %s', moduleId => {
    const html = renderToStaticMarkup(createElement(SubmissionPage, { moduleId }))
    expect(html).not.toContain('What you need')
    expect(html).toContain('Fixes and updates')
    expect(html).toContain('Module ID or source link')
    expect(html).not.toContain('npm run module:new')
    expect(html).toContain('Verify live, then resolve')
  })
})
