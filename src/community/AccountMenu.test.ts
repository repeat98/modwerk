import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AccountMenu } from './AccountMenu'
import { CommunityContext } from './context'
import type { DeveloperSession, Session } from './api'

const member: Session = { available: true, admin: false, user: { id: 'member', displayName: 'Member', username: 'member', verified: true } }
function render(session: Session, route = 'all', developer: DeveloperSession | null = null) {
  return renderToStaticMarkup(createElement(CommunityContext.Provider, { value: { session, developer, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} } }, createElement(AccountMenu, { route })))
}

describe('sidebar account row', () => {
  it('links to sign in when nobody is signed in', () => {
    const html = render({ available: true, admin: false, user: null })
    expect(html).toContain('href="#account"')
    expect(html).toContain('Sign in / register')
    expect(html).not.toContain('aria-expanded')
  })
  it('treats an unverified member as signed out', () => {
    expect(render({ ...member, user: { ...member.user!, verified: false } })).toContain('Sign in / register')
  })
  it('shows the member with a closed menu button', () => {
    const html = render(member)
    expect(html).toContain('Member')
    expect(html).toContain('@member')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('Sign out')
  })
  it('names the admin and modder roles and marks account pages as current', () => {
    const html = render({ ...member, admin: true }, 'developer', { available: true, user: { login: 'member' } })
    expect(html).toContain('Admin · Modder')
    expect(html).toContain('sidebar-account-row active')
  })
})
