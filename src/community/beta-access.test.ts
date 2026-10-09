import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { hasBetaAccess } from './beta-access'
import { emptySession } from './context'
import { ForumRoleBadge } from './ForumIdentity'
import { ModuleCard } from '../components/ModuleCard'
import { MODULES } from '../catalog/modules'

const member = { id: 'member', username: '00schneider', displayName: '00schneider', verified: true }
describe('beta tester class', () => {
  it('requires verified session access, never a username', () => {
    expect(hasBetaAccess(emptySession)).toBe(false)
    expect(hasBetaAccess({ ...emptySession, user: member })).toBe(false)
    expect(hasBetaAccess({ ...emptySession, user: { ...member, betaTester: true } })).toBe(true)
    expect(hasBetaAccess({ ...emptySession, user: { ...member, verified: false, betaTester: true } })).toBe(false)
    expect(hasBetaAccess({ ...emptySession, admin: true, user: member })).toBe(true)
  })
  it('keeps the developer badge alongside beta tester membership', () => {
    const html = renderToStaticMarkup(createElement(ForumRoleBadge, { role: 'developer', betaTester: true }))
    expect(html).toContain('Developer'); expect(html).toContain('Beta tester')
  })
  it('marks Air Chorus cards as Beta without changing ordinary module cards', () => {
    const card = (id: string) => renderToStaticMarkup(createElement(ModuleCard, { module: MODULES.find(module => module.id === id)!, selected: false, baseline: null, compared: false, canCompare: true, onToggle() {}, onCompare() {} }))
    expect(card('airwindows-chorus')).toContain('module-beta-badge">Beta')
    expect(card('miniverb')).not.toContain('module-beta-badge')
  })
})
