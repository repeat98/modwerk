import { existsSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SubmissionPage } from './SubmissionPage'
import { cloneCommands, STARTER_MACHINES, starterPrompt, starterReading, startersFor, updatePrompt } from './starter-prompts'
import { AUTHOR_RELEASE_OPT_IN, DEVELOPER_CONTEXT, DEVELOPER_RULES, ISSUE_COMMANDS, RELEASE_STEPS } from './developer-guidance'
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

  it('includes the displayed workflow and distribution guidance in every complete prompt', () => {
    for (const machine of STARTER_MACHINES.filter(item => DEVICES.find(device => device.id === item.id)?.sdk)) {
      const prompts = {
        create: starterPrompt(machine.id, startersFor(machine.id)[0]),
        update: updatePrompt(machine.id),
      }
      for (const task of ['create', 'update'] as const) {
        const prompt = prompts[task]
        for (const step of RELEASE_STEPS[task]) expect(prompt).toContain(step.summary)
        for (const item of DEVELOPER_CONTEXT) expect(prompt).toContain(item.summary)
        for (const rule of DEVELOPER_RULES) expect(prompt).toContain(rule.summary)
        expect(prompt).toContain(AUTHOR_RELEASE_OPT_IN)
        expect(prompt).toContain(ISSUE_COMMANDS)
        expect(prompt).not.toMatch(/Jannik|Assfalg/i)
      }
    }
  })

  it('asks the agent to share findings as a separate docs-only PR', () => {
    for (const prompt of [starterPrompt('octatrack', startersFor('octatrack')[0]), updatePrompt('digitakt')]) {
      expect(prompt).toContain('Share what you learn')
      expect(prompt).toContain('separate docs-only PR')
      expect(prompt).toContain('Leave sdk/octabam/AGENTS.md unchanged')
    }
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
    expect(prompt).toContain('never check the evidence box on my behalf without my actual verification')
    expect(prompt).toContain('actual saved compatible firmware download')
    expect(prompt).toContain('A push or merge alone never closes a Modwerk report')
    expect(prompt).toContain('Missing, failed or untested required checks block automatic publication')
    expect(prompt).toContain('“Related to #<number>” instead of merge-time closing keywords')
  })
})

describe('start developing page', () => {
  it('shows one complete prompt and hides its long preview and setup by default', () => {
    const html = renderToStaticMarkup(createElement(SubmissionPage))
    expect(html).toContain('<h1>Start developing</h1>')
    expect(html).toContain('/fork"')
    expect(html).toContain('Copy prompt')
    expect(html.match(/Copy prompt/g)).toHaveLength(1)
    expect(html).toContain('Preview complete prompt')
    expect(html).not.toContain('<details open')
    expect(html.indexOf('Your coding prompt')).toBeLessThan(html.indexOf('Your first release'))
  })

  it.each(['miniverb', 'digitakt-digihealth', 'digitone-digihealth'])('prefills the correct update path for %s', moduleId => {
    const html = renderToStaticMarkup(createElement(SubmissionPage, { moduleId }))
    expect(html).toContain('Fixes and updates')
    expect(html).toContain('Module ID or source link')
    expect(html).not.toContain('npm run module:new')
    expect(html).toContain('Verify live, then resolve')
  })
})
