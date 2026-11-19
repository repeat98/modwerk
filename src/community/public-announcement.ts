import { communityBase } from '../hosting'
import type { BellItem } from './notification-contract'
import { notificationLines } from './notification-text'

/** Public cards show the complete operator-reviewed message, including its paragraph breaks. */
export function publicAnnouncementLine(item: BellItem) {
  return { ...notificationLines([item])[0], excerpt: item.excerpt }
}

const key = () => 'modwerk.public-announcements.dismissed:' + communityBase()
const dismissedThisVisit = new Set<string>()
function savedDismissals(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key()) ?? '[]')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && /^announcement-[a-f0-9]{32}$/.test(id)).slice(0, 50) : []
  } catch { return [] }
}
export function publicAnnouncementDismissed(id: string) {
  return dismissedThisVisit.has(key() + ':' + id) || savedDismissals().includes(id)
}
export function dismissPublicAnnouncement(id: string) {
  dismissedThisVisit.add(key() + ':' + id)
  try { localStorage.setItem(key(), JSON.stringify([id, ...savedDismissals().filter(saved => saved !== id)].slice(0, 50))) } catch { /* Optional news stays dismissed for this visit when storage is blocked. */ }
}
/** A prompt waits while the page is hidden or another dialog, menu or text field is in use. */
export const pageBusy = () => document.visibilityState !== 'visible' || !!document.querySelector('dialog[open], .notification-panel, .mobile-menu-panel, .library-machine-menu, .forum-shoutbox.is-floating, .signup-welcome, details.library-selection[open]') || !!document.activeElement?.matches('input, textarea, [contenteditable="true"]')
/** Only the newest broadcast gets a card. Dismissing it must never reveal an older backlog. */
export function latestPublicAnnouncement(items: BellItem[]) {
  const latest = items[0]
  return latest && !latest.seen && !publicAnnouncementDismissed(latest.id) ? latest : null
}
