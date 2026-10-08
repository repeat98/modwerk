import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CommunityContext, emptySession } from './context'
import { ForumPage } from './ForumPage'
import { ModuleIssueNotice } from './ModuleIssueNotice'
import { ForumThreadView } from './ForumThreadView'
import { communityModule, moduleIssueHref, moduleThreadId } from './modules'

function renderForum(route: string, member = true) {
  const session = member ? { available: true, admin: false, user: { id: 'member', displayName: 'Member', username: 'member', verified: true } } : emptySession
  return renderToStaticMarkup(createElement(CommunityContext.Provider, { value: { session, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} } }, createElement(ForumPage, { route, configurations: [], onCopy: () => {} })))
}

describe('module issue entry points', () => {
  it('keeps bug reports out of discussion categories and offers the selected module’s report form', () => {
    const html = renderForum('forum/new?category=modules&module=miniverb')
    expect(html).not.toContain('value="issues"')
    expect(html).not.toContain('Steps to reproduce')
    expect(html).toContain('class="button button-quiet module-issue-action"')
    expect(html).toContain('Publish thread')
    expect(html).toContain('Keep discussions for questions, tips, ideas and feedback.')
  })

  it.each(['miniverb', 'synth', 'digitakt-digihealth', 'digitone-digihealth'])('turns old bug composer links for %s into the dedicated report entry point', id => {
    for (const member of [true, false]) {
      const html = renderForum('forum/new?category=issues&module=' + id, member)
      expect(html).toContain('Report a module issue')
      expect(html).toContain('href="' + moduleIssueHref(id) + '"')
      expect(html).not.toContain('Publish thread')
      expect(html).not.toContain('Reproduction details')
      expect(html).not.toContain('<form')
    }
  })

  it('offers bug reports from the archive to visitors without suggesting a discussion', () => {
    const html = renderForum('forum?category=issues&module=miniverb', false)
    expect(html).toContain('href="#forum/new?category=issues&amp;module=miniverb"')
    expect(html).not.toContain('Start a thread')
  })

  it('lets old bug links for machines without modules choose an affected module', () => {
    const html = renderForum('forum/new?category=issues&machine=syntakt')
    expect(html).toContain('value="miniverb"')
    expect(html).toContain('value="digitakt-digihealth"')
    expect(html).not.toContain('Publish thread')
  })

  it('shows the issue reporting action in embedded discussions while the service is loading', () => {
    const html = renderToStaticMarkup(createElement(ForumThreadView, { id: 'module-miniverb', embedded: true }))
    expect(html).toContain('class="button button-quiet module-issue-action"')
    expect(html).toContain('Keep discussions for questions, tips, ideas and feedback.')
  })

  it('uses FM Synth links while retaining existing community and configuration IDs', () => {
    expect(communityModule('synth')).toMatchObject({ id: 'synth', moduleId: 'synth', href: '#module/fm-synth', sourcePath: 'sdk/octabam/modules/synth' })
    expect(moduleIssueHref('synth')).toBe('#module/fm-synth?report=1')
    expect(moduleThreadId('synth')).toBe('module-synth')
  })

  it('links module sets and reviewed contributions to their own issue forms', () => {
    expect(moduleIssueHref('remix-miniverb-solo')).toBe('#module-set/miniverb-solo?report=1')
    expect(moduleIssueHref('community-example')).toBe('#community-module/community-example?report=1')
    const html = renderToStaticMarkup(createElement(ModuleIssueNotice, { moduleId: 'digitone-digihealth' }))
    expect(html).toContain('href="#digitone/module/digihealth?report=1"')
  })
})
