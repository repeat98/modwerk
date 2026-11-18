// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import type { VisitSource } from '../src/community/usage-contract'

export type MailKind = 'news' | 'activity' | 'welcome' | 'beta'
/** A finished message's links to the site, each tagged `utm_source=mail-<kind>` so the site's visit counts can credit the
 * mail (src/community/visit-source.ts). Links elsewhere, API links (unsubscribe), images and links already tagged stay
 * as they are; nothing about the recipient goes into the link. Account mail (verify, reset) is never tagged. */
export function tagMailLinks<T extends { html?: string; text?: string }>(message: T, appUrl: string | undefined, kind: MailKind): T {
  let app: URL
  try { app = new URL(appUrl ?? '') } catch { return message }
  const source: VisitSource = `mail-${kind}`
  const tag = (raw: string) => {
    let url: URL
    try { url = new URL(raw) } catch { return raw }
    if (url.origin !== app.origin || url.pathname.startsWith('/api/') || url.searchParams.has('utm_source')) return raw
    url.searchParams.set('utm_source', source)
    return url.href
  }
  return {
    ...message,
    ...(message.html === undefined ? {} : { html: message.html.replace(/(\shref=")([^"]+)"/g, (_, attribute: string, value: string) => attribute + tag(value.replaceAll('&amp;', '&')).replaceAll('&', '&amp;') + '"') }),
    // Plain text: a bare address ends at whitespace or a closing bracket; trailing sentence punctuation stays outside it.
    ...(message.text === undefined ? {} : { text: message.text.replace(/https?:\/\/[^\s<>()[\]"']+/g, match => { const end = /[.,;:!?]+$/.exec(match)?.[0] ?? ''; return tag(match.slice(0, match.length - end.length)) + end }) }),
  }
}
