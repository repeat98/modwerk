import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AVAILABLE_MODULES } from '../catalog/availability'
import { DEVICES, deviceSteps } from '../devices/registry'
import { DIGI_MODS } from '../devices/digi-mods'
import { developHighlight, DEVELOP_HIGHLIGHT_UNTIL, machineOverview } from './overview'
import { OverviewPage } from './OverviewPage'

const overview = machineOverview(AVAILABLE_MODULES)

describe('machine overview', () => {
  it('counts the same modules as the library, once per machine', () => {
    expect(overview.modules).toBe(AVAILABLE_MODULES.length + DIGI_MODS.length)
    expect(overview.machines.map(machine => machine.device.id).sort()).toEqual(DEVICES.map(device => device.id).sort())
    for (const machine of overview.machines) expect(machine.categories.reduce((sum, item) => sum + item.count, 0)).toBe(machine.count)
    expect(overview.categories.reduce((sum, item) => sum + item.count, 0)).toBe(overview.modules)
    expect(overview.machines.find(machine => machine.device.id === 'octatrack')!.count).toBe(AVAILABLE_MODULES.length)
    expect(overview.withMods + overview.withoutMods).toBe(DEVICES.length)
  })

  it('counts each creator once, across machines', () => {
    const logins = new Set([...AVAILABLE_MODULES.map(module => module.author.toLowerCase()), ...DIGI_MODS.map(mod => (mod.authorLogin ?? mod.author).toLowerCase())])
    expect(overview.creators).toBe(logins.size)
  })

  it('lists machines with mods first, then research by progress, then unexplored ones', () => {
    const kinds = overview.machines.map(machine => machine.kind)
    expect(kinds).toEqual([...kinds].sort((a, b) => ['mods', 'research', 'open'].indexOf(a) - ['mods', 'research', 'open'].indexOf(b)))
    const research = overview.machines.filter(machine => machine.kind === 'research').map(machine => machine.stepsDone)
    expect(research).toEqual([...research].sort((a, b) => b - a))
    for (const machine of overview.machines) {
      if (machine.kind === 'mods') expect(machine.next).toBeUndefined()
      else expect(machine.developHref).toBe('#submit?machine=' + machine.device.id)
    }
  })

  it('ends the Start developing highlight after its date', () => {
    expect(developHighlight(new Date(DEVELOP_HIGHLIGHT_UNTIL + 'T12:00:00Z'))).toBe(true)
    expect(developHighlight(new Date(new Date(DEVELOP_HIGHLIGHT_UNTIL + 'T12:00:00Z').getTime() + 864e5))).toBe(false)
  })
})

describe('overview page', () => {
  const html = renderToStaticMarkup(createElement(OverviewPage, { overview }))

  it('links every machine and invites development', () => {
    for (const machine of overview.machines) {
      expect(html).toContain('href="' + machine.href + '"')
      expect(html).toContain(machine.device.name)
    }
    expect(html).toContain('href="#submit"')
    expect(html).toContain('paste the starter prompt into your AI assistant')
    for (const item of overview.categories) expect(html).toContain('<b>' + item.count + '</b> ' + item.label.replace('&', '&amp;'))
    expect(html).toContain('Image credits')
    expect(html).toContain('elektronmods.com')
  })

  it('shows one phrase per machine, locks the machines without mods behind Start developing and puts the Start developing tile where they begin', () => {
    for (const machine of overview.machines) expect(html).toContain(machine.count ? machine.count + ' module' : machine.kind === 'research' ? machine.stepsDone + ' of ' + deviceSteps(machine.device).length + ' steps' : 'No research yet')
    for (const machine of overview.machines.filter(item => !item.count)) expect(html).toContain('href="' + machine.developHref + '"')
    const locked = overview.machines.filter(item => !item.count)
    expect((html.match(/Programming experience needed/g) ?? []).length).toBe(locked.filter(item => !item.coreReady).length)
    expect((html.match(/>Build the first mod</g) ?? []).length).toBe(locked.filter(item => item.coreReady).length)
    expect(html.indexOf('href="#submit"')).toBeLessThan(html.indexOf('href="' + overview.machines.find(machine => !machine.count)!.href + '"'))
    expect(html).toContain('<b>' + overview.modules + '</b> modules by <b>' + overview.creators + '</b> developers')
  })

  it('ends with an invitation to add a machine from any maker', () => {
    expect(html).toContain('Add your machine')
    expect(html).toContain('href="#forum?category=requests"')
    for (const machine of overview.machines) expect(html.indexOf('href="' + machine.href + '"')).toBeLessThan(html.indexOf('Add your machine'))
  })
})
