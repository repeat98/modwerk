import { readForumReplyDraft, saveForumReplyDraft } from './forum-reply-draft'
import { FORUM_CATEGORIES, type ForumCategory } from './forum-contract'

export type ForumThreadDraft = { title: string; body: string; category: ForumCategory; machine: string; moduleId: string }
// The new thread uses the reply drafts' tab storage under an id no thread has (thread ids are UUIDs or module-…).
const NEW_THREAD = 'new-thread'

/** The member's unpublished thread in this tab; nothing for an empty or damaged draft. */
export function readForumThreadDraft(memberId: string): ForumThreadDraft | undefined {
  try {
    const draft = JSON.parse(readForumReplyDraft(NEW_THREAD, memberId) || 'null') as Record<string, unknown> | null
    if (draft && ['title', 'body', 'machine', 'moduleId'].every(key => typeof draft[key] === 'string') && Object.hasOwn(FORUM_CATEGORIES, String(draft.category))) return draft as ForumThreadDraft
  } catch { /* A damaged draft starts an empty thread. */ }
}
/** Keeps the thread while it has a title or text; without either (or a draft) it clears. */
export function saveForumThreadDraft(memberId: string, draft?: ForumThreadDraft) {
  saveForumReplyDraft(NEW_THREAD, memberId, draft && (draft.title.trim() || draft.body.trim()) ? JSON.stringify(draft) : '')
}
