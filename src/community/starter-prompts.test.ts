import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SubmissionPage } from './SubmissionPage'
import { cloneCommands, setupPrompt, skillHandoff, STARTER_MACHINES, starterPrompt, starterReading, startersFor, updatePrompt } from './starter-prompts'
import { DEVELOPER_SKILLS, MAINTAINER_SKILLS, OWNER_SKILLS } from './developer-guidance'
import { DEVICES, isZd2Pedal, needsIntegration } from '../devices/registry'

const all = STARTER_MACHINES.flatMap(machine => startersFor(machine.id).map(starter => ({ machine: machine.id, starter })))

describe('starter prompts', () => {
  it('lists every registered instrument and routes those not ready for modules to integration', () => {
    expect(STARTER_MACHINES.map(machine => machine.id)).toEqual(DEVICES.map(device => device.id))
    // The Rytm MKI has an SDK guide but no finished core: it is unlocked first, like a machine without one.
    expect(DEVICES.filter(device => device.sdk && needsIntegration(device)).map(device => device.id)).toContain('analog-rytm-mki')
    for (const device of DEVICES.filter(needsIntegration)) {
      const starter = startersFor(device.id)[0]
      expect(startersFor(device.id).map(item => item.id)).toEqual(['integration'])
      const prompt = starterPrompt(device.id, starter, 'A new sound engine')
      expect(prompt).toContain(device.sdk ? 'not ready for modules yet' : 'no published Modwerk SDK or qualified module builder yet')
      expect(updatePrompt(device.id, 'some-module', 'A change')).toContain('its next step toward mods')
      expect(prompt).toContain('docs/ADD_A_MACHINE.md')
      expect(prompt).toContain('docs/MACHINE_RECIPE.md')
      expect(prompt).toContain('https://discord.gg/')
      expect(prompt).toContain('sdk/machines/' + device.id + '/machine.json')
      expect(prompt).not.toContain('npm run module:new')
      expect(prompt).not.toContain('core_machines, ids 4–127')
    }
  })
  it('give the machine\'s next step on its road and the Octatrack\'s stack after it', () => {
    const syntakt = starterPrompt('syntakt', startersFor('syntakt')[0])
    expect(syntakt).toContain('4. Core with hooks: started')
    expect(syntakt).toContain('Next step: Core with hooks')
    expect(syntakt).toContain('0 of 7 pieces done: Modwerk base (open), USB link (open)')
    expect(syntakt).toContain('Plan the core as the machine\'s Modwerk base from the start')
    expect(syntakt).toContain('machine syntakt')
    expect(syntakt).toContain('sdk/machines/syntakt/README.md')
    const rytm = starterPrompt('analog-rytm-mki', startersFor('analog-rytm-mki')[0])
    expect(rytm).toContain('Modwerk base (started)')
    expect(rytm).toContain('sdk/machines/analog-rytm-mki/README.md')
    // A Zoom pedal takes the Zoom road: effect files, no core to plan.
    const pedal = starterPrompt('zoom-ms-60b', startersFor('zoom-ms-60b')[0])
    expect(pedal).toContain('Next step: Own effect runs')
    expect(pedal).not.toContain('Plan the core')
  })

  it('offer the next stack piece wherever a machine that takes mods lacks part of the Octatrack\'s stack', () => {
    expect(startersFor('octatrack').map(starter => starter.id)).not.toContain('stack')
    for (const machine of ['digitakt', 'digitakt-ii', 'analog-rytm-mkii', 'zoom-ms-70cdr']) expect(startersFor(machine).at(-1)?.id).toBe('stack')
    const prompt = starterPrompt('digitakt-ii', startersFor('digitakt-ii').at(-1)!, '', 'octo-dev')
    expect(prompt).toContain('next piece of the Octatrack\'s stack for the Digitakt II')
    expect(prompt).toContain('1. Modwerk base: started')
    expect(prompt).toContain('Next piece: Modwerk base')
    expect(prompt).toContain('its own pull request for owner review, never inside a module release')
    expect(prompt).toContain('docs/MACHINE_RECIPE.md')
    expect(prompt).toContain('machine digitakt-ii')
    expect(prompt).not.toContain('module:new')
    expect(prompt).not.toContain('/modwerk-new-module')
    // The MS-70CDR has its USB setup and status page done, but its base is only started, so the base comes first.
    expect(starterPrompt('zoom-ms-70cdr', startersFor('zoom-ms-70cdr').at(-1)!)).toContain('Next piece: Modwerk base')
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

  it('hands every module prompt to the skill committed with the fork', () => {
    for (const machine of STARTER_MACHINES.filter(item => !needsIntegration(DEVICES.find(device => device.id === item.id)))) {
      const prompts = {
        'modwerk-new-module': startersFor(machine.id).filter(starter => starter.id !== 'stack').map(starter => starterPrompt(machine.id, starter)),
        'modwerk-update-module': [updatePrompt(machine.id)],
      }
      for (const [skill, list] of Object.entries(prompts)) for (const prompt of list) {
        expect(prompt).toContain(skillHandoff(skill as keyof typeof prompts))
        expect(prompt).toContain('.agents/skills/' + skill + '/SKILL.md')
        expect(prompt).toContain('Sync fork')
        expect(prompt).not.toMatch(/Jannik|Assfalg/i)
        // The skill carries the order of work and AGENTS.md the rules, so the prompt stays short.
        expect(prompt.length, machine.id + ' ' + skill).toBeLessThan(4500)
      }
    }
    for (const skill of ['modwerk-new-module', 'modwerk-update-module']) expect(readFileSync('.agents/skills/' + skill + '/SKILL.md', 'utf8')).toBe(readFileSync('.claude/skills/' + skill + '/SKILL.md', 'utf8'))
  })

  it('keeps the order of work and the contributor-protecting rules in the skills', () => {
    const create = readFileSync('.claude/skills/modwerk-new-module/SKILL.md', 'utf8'), update = readFileSync('.claude/skills/modwerk-update-module/SKILL.md', 'utf8')
    expect(create.indexOf('Check what exists')).toBeLessThan(create.indexOf('Plan, then wait for the developer\'s OK'))
    expect(create.indexOf('Plan, then wait for the developer\'s OK')).toBeLessThan(create.indexOf('Scaffold and build'))
    expect(create).toContain('suggest extending it')
    expect(create).toContain('never patches a stock site another module or the base patches')
    expect(create).toContain('on their unit (recommended')
    expect(create).toContain('#your-development-setup')
    expect(create).toContain('a device reviewer or repository maintainer reviews and merges its first release')
    expect(readFileSync('docs/DEVELOPER_WORKFLOW.md', 'utf8')).toContain('### Who reviews a first release')
    // The rule, not its sentence: AGENTS.md sends a first release to its reviewers' section, and someone approves it there.
    expect(readFileSync('AGENTS.md', 'utf8')).toMatch(/\[Device reviewers\]\(docs\/DEVELOPER_WORKFLOW\.md#who-reviews-a-first-release\)[^.]*\bapprove/)
    expect(readFileSync('docs/DEVELOPER_WORKFLOW.md', 'utf8')).toContain('deviceReviewers')
    expect(create).toContain('verify the live version and a saved download')
    for (const skill of [create, update]) expect(skill).toMatch(/Record only (what was observed|the results they report)/)
    expect(update).toContain('ask-the-author-first')
    expect(update).toContain('never check them for them')
    expect(update).toContain('Missing, failed or untested required checks block automatic publication')
    expect(update).toContain('`Related to #<number>`, never a closing keyword')
    expect(update).toContain('A push or merge alone never resolves a report')
    expect(update).toContain('notifies the module\'s followers, by email too unless they opted out')
    expect(readFileSync('.claude/skills/modwerk-pr-ready/SKILL.md', 'utf8')).toContain('npm run pr:ready -- --author <login>')
    expect(updatePrompt('digitakt')).not.toContain('look at what Modwerk already has')
  })

  it('keeps the rules the prompts no longer carry in the files they send the agent to', () => {
    const agents = readFileSync('AGENTS.md', 'utf8'), workflow = readFileSync('docs/DEVELOPER_WORKFLOW.md', 'utf8')
    expect(agents).toContain('instead of building a duplicate')
    expect(agents).toContain('Refuse a module that breaks the [modding guidelines](MODDING_GUIDELINES.md)')
    expect(readFileSync('MODDING_GUIDELINES.md', 'utf8')).toContain('Port someone\'s module only with their permission')
    expect(workflow).toContain('## Check what already exists')
    expect(workflow).toContain('## Refuse infringing work')
    expect(readFileSync('docs/module-guides/README.md', 'utf8')).toContain('## Cross-compatibility')
    expect(workflow).toContain('## Your development setup')
    expect(workflow).toContain('## Make it mergeable')
    expect(workflow).toContain('### Fixes and improvements')
    expect(readFileSync('.github/workflows/pr-flags.yml', 'utf8')).toContain('Improvement:*) label=enhancement')
    expect(readFileSync('.github/workflows/pr-flags.yml', 'utf8')).toContain('Workflow:*) label=workflow')
    expect(readFileSync('.github/pull_request_template.md', 'utf8')).toContain('**What was wrong or hard:**')
    expect(agents).toContain('npm run pr:ready')
    expect(agents).toContain('what the guides lacked or got wrong')
    expect(agents).toContain('Never commit firmware')
    expect(readFileSync('docs/ADD_A_MACHINE.md', 'utf8')).toContain("## Aim for the Octatrack's interface")
    expect(workflow).toContain('--device-socket')
    expect(workflow).toContain('Building a USB interface for the machine is recommended')
    expect(agents).toContain('Emulators (')
    expect(agents).toContain('[Fixes and improvements](docs/DEVELOPER_WORKFLOW.md#fixes-and-improvements)')
    expect(readFileSync('docs/MODULE_AUTHOR_UPDATES.md', 'utf8')).toContain('Automatically merge and publish my module update after checks pass.')
  })

  it('opens every prompt with a setup check: coding agents skip it, chat assistants guide a newcomer', () => {
    const prompts = [
      starterPrompt('octatrack', startersFor('octatrack')[0], '', 'octo-dev', 'https://github.com/acme/modwerk'),
      updatePrompt('digitakt', 'digi-eq', '', '', 'https://github.com/acme/modwerk', 'octo-dev'),
      ...DEVICES.filter(needsIntegration).map(device => starterPrompt(device.id, startersFor(device.id)[0], '', 'octo-dev', 'https://github.com/acme/modwerk')),
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

  it('gives the Rytm and the Four their own starters: the digital path, no SRC machine slot, and the machine’s stack section first', () => {
    for (const machine of ['analog-rytm-mkii', 'analog-four-mkii'] as const) {
      const starters = startersFor(machine)
      expect(starters.map(starter => starter.id)).not.toContain('machine')
      const prompt = starterPrompt(machine, starters[0])
      expect(prompt).toContain('digital path only')
      expect(prompt).not.toContain('core_machines, ids 4–127')
      expect(prompt).not.toContain('fast SRAM')
      expect(prompt).toContain('- sdk/machines/' + machine + '/README.md (its Modwerk stack section first)')
    }
    expect(starterPrompt('digitakt', startersFor('digitakt')[0])).toContain('- sdk/machines/digitakt/README.md (its Modwerk stack section first)')
    expect(starterPrompt('octatrack', startersFor('octatrack')[0])).not.toContain('Modwerk stack section')
  })

  it('sends the Zoom pedals down their own road: the ZDL docs and plan, MIDISTOMP where it runs, Ziddle only for development, no stock code', () => {
    const zoom = DEVICES.filter(device => device.family === 'zoom' && !isZd2Pedal(device))
    expect(zoom.length).toBeGreaterThan(0)
    for (const device of zoom) {
      const prompt = starterPrompt(device.id, startersFor(device.id)[0])
      expect(prompt).toContain('- docs/ZOOM_MULTISTOMP.md')
      expect(prompt).toContain('- docs/ZDL_MODULE_CONTRACT.md')
      // A pedal still coming up follows the MS-70CDR's road, not the MS-70CDR's own plan.
      expect(prompt).toContain(device.sdk ? 'docs/ZOOM_MULTISTOMP.md#plan' : 'docs/ZOOM_MULTISTOMP.md#another-zdl-pedal')
      // MIDISTOMP's releases are the MS-70CDR's OS: no flashing them onto another pedal (modding guidelines).
      if (device.id === 'zoom-ms-50g' || device.id === 'zoom-ms-60b') expect(prompt).toContain('never flash one onto this pedal')
      expect(prompt).toContain('no stock Zoom code')
      expect(prompt).toContain('never hardware evidence, and the site never offers it to musicians')
      expect(prompt).toContain('load ZD2 effects and are not covered here')
      expect(prompt).not.toContain('exact rebuild, recovery/boot, hooks/core')
      expect(prompt).toContain(device.id === 'zoom-g1on' ? 'does not run on this pedal' : 'The base is Luca Matturro\'s MIDISTOMP')
    }
    expect(readFileSync('docs/ZOOM_MULTISTOMP.md', 'utf8')).toContain('## Plan')
    expect(readFileSync('docs/ZOOM_MULTISTOMP.md', 'utf8')).toContain('## Another ZDL pedal')
    // A ZD2 pedal reads its own report, not the ZDL plan, base or contract.
    const zd2 = starterPrompt('zoom-g1-four', startersFor('zoom-g1-four')[0])
    expect(zd2).toContain('- docs/ZOOM_ZD2.md')
    expect(zd2).not.toContain('docs/ZOOM_MULTISTOMP.md')
    expect(zd2).not.toContain('docs/ZDL_MODULE_CONTRACT.md')
    expect(zd2).not.toContain('MIDISTOMP (MIT)')
    expect(zd2).toContain('no stock Zoom code')
    expect(zd2).toContain('which runs on this pedal')
    // The clean-room route is shown on the G1 FOUR only; the other ZD2 pedals say it is unproven there.
    for (const id of ['zoom-ms-200d-plus', 'zoom-g5n'] as const) {
      const other = starterPrompt(id, startersFor(id)[0])
      expect(other).toContain('unproven on this pedal')
      expect(other).not.toContain('which runs on this pedal')
      expect(starterReading(id, startersFor(id)[0])).toContain('docs/ZOOM_PATCH_PROTOCOL.md')
    }
    expect(readFileSync('docs/ZOOM_ZD2.md', 'utf8')).toContain('## Next steps')
    expect(starterPrompt('lxr-02', startersFor('lxr-02')[0])).not.toContain('Ziddle')
  })

  it('sets up any instrument with one prompt: chat assistants only guide, coding agents install the skills', () => {
    const prompt = setupPrompt('https://github.com/acme/modwerk')
    expect(prompt.startsWith('Set up my computer for Modwerk development: https://github.com/acme/modwerk,')).toBe(true)
    // The chat guard sits at the top and the reminder at the end: Gemini ignored a guard in the middle.
    expect(prompt.indexOf('If you are a chat assistant')).toBeLessThan(prompt.indexOf('1. Tools'))
    expect(prompt.endsWith('only the guidance in the second paragraph applies to you.')).toBe(true)
    expect(prompt).toContain('`gh repo fork acme/modwerk --clone`')
    expect(prompt).toContain('linking, not copying')
    expect(prompt).toContain('Leave out --allow-device-writes')
    expect(prompt).not.toMatch(/Jannik|Assfalg|Octatrack|Digitakt/i)
    for (const [, file, anchor] of prompt.matchAll(/(docs\/[A-Z_]+\.md)(?:#([a-z-]+))?/g)) {
      expect(existsSync(file), file).toBe(true)
      if (anchor) expect(readFileSync(file, 'utf8').toLowerCase()).toContain('## ' + anchor.replaceAll('-', ' '))
    }
    expect(readFileSync('docs/DEVELOPER_WORKFLOW.md', 'utf8')).toContain('modwerk-source-tools')
  })

  it('lists every skill on the page, as a developer, maintainer or owner skill', () => {
    const listed = [...DEVELOPER_SKILLS.map(skill => skill.name), ...MAINTAINER_SKILLS, ...OWNER_SKILLS]
    expect([...listed].sort()).toEqual(readdirSync('.claude/skills').filter(name => existsSync('.claude/skills/' + name + '/SKILL.md')).sort())
    for (const name of OWNER_SKILLS) expect(readFileSync('.claude/skills/' + name + '/SKILL.md', 'utf8').match(/^description: .*$/m)?.[0]).toMatch(/owner/i)
  })

  it('names the module, the change, the report and the login in the update prompt', () => {
    const prompt = updatePrompt('digitakt', 'sdk/digitakt/modules/digi-eq', 'Fix a filter click', 'https://github.com/repeat98/modwerk/issues/123')
    expect(prompt).toContain('Fix issue https://github.com/repeat98/modwerk/issues/123')
    expect(prompt).toContain('Digitakt mk1')
    expect(prompt).toContain('Fix a filter click')
    expect(prompt).not.toContain('module:new')
    expect(prompt).toContain('My GitHub login is <your-github-login>.')
    expect(updatePrompt('digitakt', 'digi-eq', '', '', undefined, '@octo-dev')).toContain('My GitHub login is octo-dev.')
    expect(prompt).toContain('/modwerk-update-module')
  })
})

describe('start developing page', () => {
  it('says that unlocking a machine without a core needs programming experience', () => {
    const html = renderToStaticMarkup(createElement(SubmissionPage, { machine: 'analog-heat' }))
    expect(html).toContain('Help unlock the Analog Heat')
    expect(html).toContain('Programming experience needed.')
    expect(html).not.toContain('Make a mod for your machine.')
    expect(html).toContain('Start the integration')
  })

  it('puts the setup prompt first, then one module prompt, with long previews and hand setup collapsed', () => {
    const html = renderToStaticMarkup(createElement(SubmissionPage))
    expect(html).toContain('Make a mod for your machine.')
    expect(html).toContain('Claude Code or Codex')
    expect(html.match(/Copy setup prompt/g)).toHaveLength(1)
    expect(html).toContain('/modwerk-contribute')
    expect(html).not.toContain('/modwerk-maintain')
    expect(html).toContain('/fork"')
    expect(html).toContain('Copy prompt')
    expect(html.match(/Copy prompt/g)).toHaveLength(1)
    expect(html.match(/Show the prompt/g)).toHaveLength(2)
    expect(html).toContain('DEVELOPER_WORKFLOW.md#your-development-setup')
    expect(html).not.toContain('<details open')
    // The board stays collapsed, below the help links, so Discord is not pushed down the page.
    expect(html.indexOf('Join Discord')).toBeLessThan(html.indexOf('<details class="agent-board">'))
    expect(html.indexOf('Set up your computer')).toBeLessThan(html.indexOf('Describe your idea'))
    expect(html.indexOf('Describe your idea')).toBeLessThan(html.indexOf('Build, test, release'))
    expect(html.indexOf('Build, test, release')).toBeLessThan(html.indexOf('Commands in your agent'))
    // The steps follow the skill: plan, build, test on the unit, pull request, live.
    expect(html.indexOf('Agree the plan')).toBeLessThan(html.indexOf('Test on your unit'))
    expect(html.indexOf('Test on your unit')).toBeLessThan(html.indexOf('Open the pull request'))
    expect(html.indexOf('Open the pull request')).toBeLessThan(html.indexOf('Community review'))
    expect(html.indexOf('Community review')).toBeLessThan(html.indexOf('Check it live'))
  })

  it('preselects the machine an overview link names and shows its road', () => {
    const html = renderToStaticMarkup(createElement(SubmissionPage, { machine: 'syntakt' }))
    expect(html).toMatch(/<option value="syntakt" selected="">/)
    expect(html).toContain('Instrument integration')
    expect(html).toContain('<strong>Core with hooks</strong><span>Next, started.')
    expect(html).toContain('0 of 7 pieces done')
    expect(html).not.toContain('Build, test, release')
  })

  it('treats a machine with an SDK guide but no finished core as one to unlock', () => {
    const html = renderToStaticMarkup(createElement(SubmissionPage, { machine: 'analog-rytm-mki' }))
    expect(html).toContain('Help unlock the')
    expect(html).toContain('Instrument integration')
    expect(html).not.toContain('Build, test, release')
  })

  it.each(['miniverb', 'digitakt-digihealth', 'digitone-digihealth'])('prefills the correct update path for %s', moduleId => {
    const html = renderToStaticMarkup(createElement(SubmissionPage, { moduleId }))
    expect(html).toContain('Describe the change')
    expect(html).toContain('Fix, test, release')
    expect(html).toContain('Module ID or source link')
    expect(html).not.toContain('npm run module:new')
    expect(html).toContain('Test on your unit')
    expect(html).toContain('then close the report')
  })
})
