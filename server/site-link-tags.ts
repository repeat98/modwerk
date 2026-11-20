// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Plain imports only (no path aliases or runtime imports from src/): the Discord bot scripts load this file with Node.
import type { VisitSource } from '../src/community/usage-contract'

export type MailKind = 'news' | 'activity' | 'welcome' | 'beta'
/** One link, tagged `utm_source=<source>` when it points to the site, so the site's visit counts can credit where it was
 * posted (src/community/visit-source.ts). Links elsewhere, API links (unsubscribe) and links already tagged stay as they are. */
function tagLink(raw: string, app: URL, source: VisitSource) {
  let url: URL
  try { url = new URL(raw) } catch { return raw }
  if (url.origin !== app.origin || url.pathname.startsWith('/api/') || url.searchParams.has('utm_source')) return raw
  url.searchParams.set('utm_source', source)
  return url.href
}
const siteUrl = (appUrl: string | undefined) => { try { return new URL(appUrl ?? '') } catch { return null } }
/** Bare addresses in plain text or Discord markdown: an address ends at whitespace, a bracket or a quote, and trailing
 * sentence punctuation stays outside it. */
export function tagSiteText(text: string, appUrl: string | undefined, source: VisitSource) {
  const app = siteUrl(appUrl)
  if (!app) return text
  return text.replace(/https?:\/\/[^\s<>()[\]"']+/g, match => { const end = /[.,;:!?]+$/.exec(match)?.[0] ?? ''; return tagLink(match.slice(0, match.length - end.length), app, source) + end })
}
/** A finished mail's links to the site, tagged `mail-<kind>`; images and everything outside `href` stay as they are.
 * Nothing about the recipient goes into the link. Account mail (verify, reset) is never tagged. */
export function tagMailLinks<T extends { html?: string; text?: string }>(message: T, appUrl: string | undefined, kind: MailKind): T {
  const app = siteUrl(appUrl), source: VisitSource = `mail-${kind}`
  if (!app) return message
  return {
    ...message,
    ...(message.html === undefined ? {} : { html: message.html.replace(/(\shref=")([^"]+)"/g, (_, attribute: string, value: string) => attribute + tagLink(value.replaceAll('&amp;', '&'), app, source).replaceAll('&', '&amp;') + '"') }),
    ...(message.text === undefined ? {} : { text: tagSiteText(message.text, appUrl, source) }),
  }
}
/** A Discord message's links to the site, tagged `discord-bot`, unless that would take it past Discord's 2000 characters. */
export function tagDiscordLinks(content: string, appUrl = 'https://modwerk.app/') {
  const tagged = tagSiteText(content, appUrl, 'discord-bot')
  return tagged.length <= 2000 ? tagged : content
}
