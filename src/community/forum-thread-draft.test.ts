import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveForumReplyDraft } from './forum-reply-draft'
import { readForumThreadDraft, saveForumThreadDraft } from './forum-thread-draft'

const members = ['draft-member', 'other-member']
const draft = { title: 'Swing on the Octatrack', body: '**What I tried**\n\n' + 'More context. '.repeat(900), category: 'requests' as const, machine: 'octatrack', moduleId: '' }
beforeEach(() => {
  const items = new Map<string, string>()
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value), removeItem: (key: string) => items.delete(key) })
})
afterEach(() => { for (const member of members) saveForumThreadDraft(member); vi.unstubAllGlobals() })

describe('new thread drafts when leaving the composer', () => {
  it('restores title, text and selects for the member who wrote them only', () => {
    saveForumThreadDraft(members[0], draft)
    expect(readForumThreadDraft(members[0])).toEqual(draft)
    expect(readForumThreadDraft(members[1])).toBeUndefined()
    expect(readForumThreadDraft('')).toBeUndefined()
  })

  it('keeps no draft without a title or text, and clears after publishing', () => {
    saveForumThreadDraft(members[0], { ...draft, title: ' ', body: '' })
    expect(readForumThreadDraft(members[0])).toBeUndefined()
    saveForumThreadDraft(members[0], { ...draft, body: '' })
    expect(readForumThreadDraft(members[0])?.title).toBe(draft.title)
    saveForumThreadDraft(members[0])
    expect(readForumThreadDraft(members[0])).toBeUndefined()
    expect(sessionStorage.getItem('modwerk-forum-reply:' + JSON.stringify(['/api', members[0], 'new-thread']))).toBeNull()
  })

  it('drops a damaged or stale draft instead of failing', () => {
    saveForumReplyDraft('new-thread', members[0], '{"title":')
    expect(readForumThreadDraft(members[0])).toBeUndefined()
    saveForumReplyDraft('new-thread', members[0], JSON.stringify({ ...draft, category: 'retired-topic' }))
    expect(readForumThreadDraft(members[0])).toBeUndefined()
  })
})
