import { useEffect, useState, type KeyboardEvent, type RefObject } from 'react'
import { api } from './api'
import { useCommunity } from './context'
import { ForumAvatar } from './ForumIdentity'
import { mentionQueryAt, splitMentions } from './forum-contract'

export type MentionCandidate = { username: string; displayName: string; avatar: string | null }

/** Plain text with every @name turned into a link to that member's profile. */
export function MentionText({ text }: { text: string }) {
  return <>{splitMentions(text).map((part, index) => part.type === 'mention' ? <a key={index} className="forum-mention" href={'#forum/profile/' + encodeURIComponent(part.value)}>@{part.value}</a> : part.value)}</>
}

const cache = new Map<string, MentionCandidate[]>()
/** Member names for the @name being typed; `query` is null while nothing is being typed. Guests get no suggestions.
 * Results are read from the cache during render; the effect only fetches what is missing. */
export function useMentionSuggestions(query: string | null) {
  const { session } = useCommunity(), [, bump] = useState(0), [cursor, setCursor] = useState({ key: '', index: 0, dismissed: false })
  const key = query === null || !session.user?.verified ? null : query.toLowerCase()
  useEffect(() => {
    if (key === null || cache.has(key)) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void api<MentionCandidate[]>('/forum/members?q=' + encodeURIComponent(key)).then(value => { cache.set(key, value); if (!cancelled) bump(value => value + 1) }).catch(() => { if (!cancelled) { cache.set(key, []); bump(value => value + 1) } })
    }, 120)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [key])
  const items = key === null || (cursor.key === key && cursor.dismissed) ? [] : cache.get(key) ?? []
  const active = cursor.key === key ? Math.min(cursor.index, Math.max(items.length - 1, 0)) : 0
  const setActive = (index: number) => setCursor({ key: key ?? '', index, dismissed: false })
  /** The keys a suggestion list owns. Returns true when the key was used, so the caller skips its own handling. */
  function onKey(event: { key: string }, pick: (candidate: MentionCandidate) => void) {
    if (!items.length) return false
    if (event.key === 'ArrowDown') { setActive((active + 1) % items.length); return true }
    if (event.key === 'ArrowUp') { setActive((active - 1 + items.length) % items.length); return true }
    if (event.key === 'Enter' || event.key === 'Tab') { pick(items[active]); return true }
    if (event.key === 'Escape') { setCursor({ key: key ?? '', index: 0, dismissed: true }); return true }
    return false
  }
  return { items, active, setActive, onKey }
}

export function MentionSuggestions({ id, items, active, onPick, onHover }: { id: string; items: MentionCandidate[]; active: number; onPick: (candidate: MentionCandidate) => void; onHover: (index: number) => void }) {
  if (!items.length) return null
  // Mouse down, not click, so the input keeps its focus and caret.
  return <ul id={id} className="forum-mention-list" role="listbox" aria-label="Members to mention">{items.map((item, index) => <li key={item.username} id={id + '-' + index} role="option" aria-selected={index === active} onMouseEnter={() => onHover(index)} onMouseDown={event => { event.preventDefault(); onPick(item) }}><ForumAvatar username={item.username} avatar={item.avatar} /><span><strong>@{item.username}</strong><small>{item.displayName}</small></span></li>)}</ul>
}

/** Suggestions for a plain textarea: follows the caret and replaces the typed @prefix with the chosen name. */
export function useTextareaMentions(ref: RefObject<HTMLTextAreaElement | null>, value: string, setValue: (next: string) => void, id: string) {
  const [caret, setCaret] = useState(0)
  const at = mentionQueryAt(value, Math.min(caret, value.length))
  const suggestions = useMentionSuggestions(at ? at.query : null)
  function pick(candidate: MentionCandidate) {
    if (!at) return
    const insert = '@' + candidate.username + ' ', position = at.start + insert.length
    setValue(value.slice(0, at.start) + insert + value.slice(at.start + at.query.length + 1))
    setCaret(position)
    requestAnimationFrame(() => { const element = ref.current; if (element) { element.focus(); element.setSelectionRange(position, position) } })
  }
  const track = () => { const element = ref.current; if (element) setCaret(element.selectionStart ?? 0) }
  return {
    list: <MentionSuggestions id={id} items={suggestions.items} active={suggestions.active} onPick={pick} onHover={suggestions.setActive} />,
    /** Call first in onKeyDown; true means the key went to the suggestion list. */
    onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) { if (suggestions.onKey(event, pick)) { event.preventDefault(); return true } return false },
    onSelect: track, onKeyUp: track, onClick: track,
    aria: suggestions.items.length ? { 'aria-controls': id, 'aria-expanded': true, 'aria-autocomplete': 'list' as const, 'aria-activedescendant': id + '-' + suggestions.active } : {},
  }
}
