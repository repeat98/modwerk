import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CommunityContext, emptySession } from './context'
import { ForumPage } from './ForumPage'
import { ModuleIssueNotice } from './ModuleIssueNotice'
import { ForumThreadView } from './ForumThreadView'
import { communityModule, moduleIssueHref, moduleThreadId } from './modules'
import { newConfiguration, type Configuration } from '../config/workspace'

function renderForum(route: string, member = true, configurations: Configuration[] = [], configuration?: Configuration) {
  const session = member ? { available: true, admin: false, user: { id: 'member', displayName: 'Member', username: 'member', verified: true } } : emptySession
  return renderToStaticMarkup(createElement(CommunityContext.Provider, { value: { session, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} } }, createElement(ForumPage, { route, configurations, configuration, onCopy: () => {} })))
}

describe('shared configuration links', () => {
  it('opens the sharing form for a Zoom set and links back to the pedal workspace', () => {
    const set = newConfiguration('Stereo loop set', ['loop'], false, undefined, 'zoom-ms-70cdr')
    const html = renderForum('forum/new?category=configs&machine=zoom-ms-70cdr', true, [set])
    expect(html).toContain('<h2>Stereo loop set</h2>')
    expect(html).toContain('href="#zoom-ms-70cdr/pedal/set"')
  })

  it('opens shared configurations with a usable machine when the link names none', () => {
    const set = newConfiguration('Studio set', ['miniverb'])
    const html = renderForum('forum/new?category=configs', true, [set])
    expect(html).toContain('<h2>Studio set</h2>')
  })

  it('defaults to the same set as the machine workspace', () => {
    const first = { ...newConfiguration('Older Digitakt set', ['digihealth'], false, undefined, 'digitakt'), updatedAt: '2026-11-17T12:00:00.000Z' }
    const recent = { ...newConfiguration('Current Digitakt set', ['digihealth'], false, undefined, 'digitakt'), updatedAt: '2026-11-18T12:00:00.000Z' }
    const octatrack = newConfiguration('Octatrack set')
    const route = 'forum/new?category=configs&machine=digitakt', configurations = [first, recent, octatrack]
    expect(renderForum(route, true, configurations, octatrack)).toContain('<h2>Current Digitakt set</h2>')
    expect(renderForum(route, true, configurations, first)).toContain('<h2>Older Digitakt set</h2>')
  })
})

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
    expect(communityModule('synth')).toMatchObject({ id: 'synth', moduleId: 'synth', href: '#module/fm-synth', sourcePath: 'sdk/octatrack/modules/synth' })
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
