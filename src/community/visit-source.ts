// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { VISIT_SOURCES, type VisitSource } from './usage-contract'

/** Domains by source, most specific first: a host matches a domain or any subdomain of it. */
const DOMAINS: [VisitSource, RegExp][] = [
  ['mail', /^(mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com|mail\.proton\.me|app\.fastmail\.com|webmail\..+)$/],
  ['gemini', /(^|\.)gemini\.google\.com$/],
  ['google', /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/],
  ['bing', /(^|\.)bing\.com$/],
  ['duckduckgo', /(^|\.)duckduckgo\.com$/],
  ['brave', /^search\.brave\.com$/],
  ['ecosia', /(^|\.)ecosia\.org$/],
  ['other-search', /(^|\.)(yahoo\.[a-z.]+|yandex\.[a-z.]+|qwant\.com|startpage\.com|kagi\.com|baidu\.com|naver\.com|search\.[a-z0-9-]+\.[a-z.]+)$/],
  ['chatgpt', /(^|\.)(chatgpt\.com|chat\.openai\.com)$/],
  ['claude', /(^|\.)claude\.ai$/],
  ['perplexity', /(^|\.)perplexity\.ai$/],
  ['copilot', /(^|\.)copilot\.microsoft\.com$/],
  ['reddit', /(^|\.)(reddit\.com|redd\.it)$/],
  ['youtube', /(^|\.)(youtube\.com|youtu\.be)$/],
  ['instagram', /(^|\.)instagram\.com$/],
  ['facebook', /(^|\.)(facebook\.com|fb\.com|messenger\.com)$/],
  ['x', /(^|\.)(x\.com|twitter\.com|t\.co)$/],
  ['discord', /(^|\.)(discord\.com|discord\.gg|discordapp\.com)$/],
  ['github', /(^|\.)(github\.com|github\.io)$/],
  ['elektronauts', /(^|\.)elektronauts\.com$/],
  ['gearnews', /(^|\.)gearnews\.[a-z]{2,3}$/],
  ['synthtopia', /(^|\.)synthtopia\.com$/],
  ['cdm', /(^|\.)cdm\.link$/],
  ['musicradar', /(^|\.)musicradar\.com$/],
  ['synthanatomy', /(^|\.)synthanatomy\.com$/],
  ['bonedo', /(^|\.)bonedo\.de$/],
]
/** Android apps send `android-app://<package>` as the referrer. */
const APPS: [VisitSource, RegExp][] = [
  ['mail', /^com\.google\.android\.gm$/], ['google', /^com\.google\.android\.googlequicksearchbox$/], ['reddit', /^com\.reddit\./],
  ['youtube', /^com\.google\.android\.youtube$/], ['discord', /^com\.discord$/], ['instagram', /^com\.instagram\./], ['facebook', /^com\.facebook\./],
]
/** `utm_source` values that name a source differently from its id. */
const UTM_ALIASES: Record<string, VisitSource> = { email: 'mail', newsletter: 'mail', twitter: 'x', 'chat.openai.com': 'chatgpt', openai: 'chatgpt', yt: 'youtube', ig: 'instagram', fb: 'facebook' }

/** One fixed category for a page load, or null when the visit came from this site itself (nothing to count). */
export function visitSource(referrer: string, search: string, origin: string): VisitSource | null {
  let utm: string | null = null
  try { utm = new URLSearchParams(search).get('utm_source')?.trim().toLowerCase() || null } catch { /* no campaign tag */ }
  if (utm) return (VISIT_SOURCES as readonly string[]).includes(utm) ? utm as VisitSource : UTM_ALIASES[utm] ?? byHost(utm) ?? 'other'
  if (!referrer) return 'direct'
  let url: URL
  try { url = new URL(referrer) } catch { return 'other' }
  if (url.origin === origin) return null
  if (url.protocol === 'android-app:') return APPS.find(([, pattern]) => pattern.test(url.hostname))?.[0] ?? 'other'
  return byHost(url.hostname.toLowerCase().replace(/\.$/, '')) ?? 'other'
}
function byHost(host: string) {
  return DOMAINS.find(([, pattern]) => pattern.test(host.replace(/^(www|m|l|lm|old|out|np)\./, '')))?.[0] ?? null
}
