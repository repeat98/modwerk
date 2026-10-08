import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDiscussionIssueDraft, moveDiscussionIssueDraft, readDiscussionIssueDraft, saveDiscussionIssueDraft } from './discussion-issue-draft'
import { CommunityContext } from './context'
import { IssueReport } from './IssueReport'
import { DigiIssueReport } from './DigiIssueReport'
import { ModuleDiscussionDialog } from './ModuleDiscussionDialog'

const ids = ['', 'miniverb', 'digitakt-digihealth', 'digitone-digihealth']
beforeEach(() => {
  const items = new Map<string, string>()
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value), removeItem: (key: string) => items.delete(key) })
})
afterEach(() => { for (const id of ids) clearDiscussionIssueDraft(id); vi.unstubAllGlobals() })
const session = { available: true, admin: false, user: { id: 'member', displayName: 'Member', username: 'member', verified: true } }
function renderReport(id: string) {
  const report = id === 'miniverb' ? createElement(IssueReport, { id, author: 'author' }) : createElement(DigiIssueReport, { id })
  return renderToStaticMarkup(createElement(CommunityContext.Provider, { value: { session, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} } }, report))
}

describe('discussion drafts in issue reports', () => {
  it('keeps drafts isolated between machines, retains them until success and clears only the reported module', () => {
    saveDiscussionIssueDraft('digitakt-digihealth', { title: 'Digitakt display', body: 'Digitakt details' })
    saveDiscussionIssueDraft('digitone-digihealth', { title: 'Digitone display', body: 'Digitone details' })
    expect(readDiscussionIssueDraft('digitakt-digihealth')).toEqual({ title: 'Digitakt display', body: 'Digitakt details' })
    expect(readDiscussionIssueDraft('digitakt-digihealth')?.body).toBe('Digitakt details')
    clearDiscussionIssueDraft('digitakt-digihealth')
    expect(readDiscussionIssueDraft('digitakt-digihealth')).toBeNull()
    expect(readDiscussionIssueDraft('digitone-digihealth')?.body).toBe('Digitone details')
  })

  it('moves an unassigned draft only after the user chooses the affected module', () => {
    saveDiscussionIssueDraft('', { title: 'Display problem', body: 'What went wrong' })
    expect(readDiscussionIssueDraft('miniverb')).toBeNull()
    moveDiscussionIssueDraft('', 'miniverb')
    expect(readDiscussionIssueDraft('')).toBeNull()
    expect(readDiscussionIssueDraft('miniverb')).toEqual({ title: 'Display problem', body: 'What went wrong' })
  })

  it('preserves the complete text when tab storage is unavailable', () => {
    vi.stubGlobal('sessionStorage', { getItem() { throw new Error('Blocked') }, setItem() { throw new Error('Blocked') }, removeItem() { throw new Error('Blocked') } })
    const body = 'A'.repeat(12000)
    saveDiscussionIssueDraft('miniverb', { title: '', body })
    expect(readDiscussionIssueDraft('miniverb')?.body).toBe(body)
  })

  it.each(['miniverb', 'digitakt-digihealth', 'digitone-digihealth'])('prefills %s with the title and full text while preserving the structured reporting fields', id => {
    const body = 'The control changes unexpectedly.\nPlease investigate.'
    saveDiscussionIssueDraft(id, { title: 'Unexpected control change', body })
    const html = renderReport(id)
    expect(html).toContain('value="Unexpected control change"')
    expect(html).toContain('name="actual"')
    expect(html).toContain(body + '</textarea>')
    expect(html).not.toContain('Your copied discussion draft')
    expect(html).toContain('Steps to reproduce')
    expect(html).toContain('Expected result')
  })

  it.each(['miniverb', 'digitakt-digihealth'])('asks %s reporters only for a title, what happened and the device', id => {
    const html = renderReport(id)
    expect(html.match(/<(?:input|textarea)[^>]*>/g)?.filter(tag => tag.includes(' required')).map(tag => tag.match(/name="(\w+)"/)?.[1])).toEqual(['title', 'actual'])
    expect(html).toMatch(/<details class="issue-report-more"><summary>Steps to reproduce <span>Optional/)
    expect(html).not.toContain('I can’t attach')
  })

  it('keeps long drafts intact for review instead of silently cutting them to the result limit', () => {
    const body = 'Full draft detail. '.repeat(600)
    saveDiscussionIssueDraft('miniverb', { title: '', body })
    const html = renderReport('miniverb')
    expect(html).toContain(body + '</textarea>')
    expect(html).toContain('Your copied discussion draft')
    expect(html).toContain('2,000 characters')
  })

  it('makes reporting the recommended modal action while allowing editing or a confirmed discussion', () => {
    const html = renderToStaticMarkup(createElement(ModuleDiscussionDialog, { onClose: () => {}, onPost: () => {}, onReportIssue: () => {} }))
    expect(html).toContain('Is something not working right?')
    expect(html).toContain('Your written draft will be copied into the issue report.')
    expect(html).toContain('everything else is optional')
    expect(html).toContain('class="button button-quiet module-issue-action"')
    expect(html).toContain('Report an issue</button>')
    expect(html).toContain('Post a discussion instead')
    expect(html).toContain('Keep editing')
  })
})
