// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// The maintenance bot's trusted policy (docs/MAINTENANCE_BOT.md). The model only proposes; this file decides what
// each proposal may do and when. It runs from main in a job the model never touches, and the bot cannot change it:
// a pull request that edits this folder is never merged without the owner's OK.
import { createHash } from 'node:crypto'

export const OWNER = 'repeat98'
/** Hours an action waits for the owner's Stop before it runs. */
export const WINDOW_HOURS = { merge: 12, close: 12, comment: 4, review: 4 }
const KINDS = new Set(['label', 'comment', 'review', 'merge', 'close', 'decline'])
const LABELS = /^(bug|documentation|duplicate|enhancement|question|invalid|wontfix|configuration|accessibility|good first issue|help wanted|needs-work|needs-info|priority:P[123]|module:[a-z0-9-]+)$/
/**
 * Paths a merge never touches without the owner's OK: CI and the bot itself, deploy and schema, sign-in and
 * security, dependencies, approvals and verification records, and everything in the SDK outside module folders
 * (bases, cores, the runtime, the toolchain and the codec).
 */
const SENSITIVE = [
  /^\.github\//, /^scripts\/maintenance-bot\//, /^migrations\//, /^wrangler[^/]*\.jsonc?$/, /^worker\.ts$/,
  /^server\/(auth|security|platform|developer-auth|github|transport)\.ts$/, /^package(-lock)?\.json$/, /^\.npmrc$/,
  /^public\/_headers$/, /^vite\.config\.ts$/, /^MODDING_GUIDELINES\.md$/, /^AGENTS\.md$/, /^\.claude\//, /^\.agents\//,
  /^sdk\/(?!octatrack\/modules\/|drafts\/|[a-z0-9-]+\/modules\/)/,
]
const LINK = /https?:\/\/[^\s)>\]]+/g
const LINK_HOSTS = /^https:\/\/(github\.com\/repeat98\/modwerk(\/|$|#)|modwerk\.[a-z]+(\/|$)|octamod\.[a-z]+(\/|$))/

export const actionId = (...parts) => createHash('sha256').update(parts.map(String).join('\u0000')).digest('hex').slice(0, 16)

/** Text the bot posts in public: plain, bounded, no mass mentions, links only to Modwerk. */
export function checkText(body, author) {
  if (typeof body !== 'string' || !body.trim()) return 'it has no text'
  if (body.length > 3000) return 'its text is over 3000 characters'
  const mentions = [...body.matchAll(/(?<![\w`])@([A-Za-z0-9-]+)/g)].map(match => match[1].toLowerCase())
  if (mentions.some(name => name !== String(author).toLowerCase() && name !== OWNER)) return 'it mentions someone other than the author'
  if ((body.match(LINK) ?? []).some(url => !LINK_HOSTS.test(url))) return 'it links outside Modwerk'
  return ''
}

/**
 * Decides one proposal against the target's live state. `target` is what the executor read from GitHub:
 * { number, isPull, author, state, draft, head, comments, files, firstTime, checksGreen }.
 * Returns { tier, windowHours, id, payload } or { reject }.
 */
export function classify(proposal, target, existingLabels = new Set()) {
  const kind = proposal?.kind
  if (!KINDS.has(kind)) return { reject: 'kind "' + kind + '" is not something the bot may do' }
  if (!target || target.state !== 'open') return { reject: '#' + proposal.number + ' is not open' }
  const summary = String(proposal.summary ?? '').trim().replace(/\s+/g, ' ').slice(0, 90), reason = String(proposal.reason ?? '').trim().slice(0, 800)
  if (!summary) return { reject: 'it has no summary' }
  // Every action pins the state it was proposed against; the executor drops it if the target moved on.
  const pin = { head: target.head ?? '', comments: target.comments }
  const base = { summary: '#' + target.number + ' ' + summary, reason }
  const sensitive = (target.files ?? []).filter(file => SENSITIVE.some(pattern => pattern.test(file)))
  switch (kind) {
    case 'label': {
      const add = [...new Set(proposal.add ?? [])].map(String), remove = [...new Set(proposal.remove ?? [])].map(String)
      if (!add.length && !remove.length) return { reject: 'it changes no label' }
      const bad = [...add, ...remove].find(name => !LABELS.test(name) || (add.includes(name) && !existingLabels.has(name)))
      if (bad) return { reject: 'label "' + bad + '" is not one the bot may set' }
      return { ...base, tier: 'notify', windowHours: 0, id: actionId(kind, target.number, add.sort(), remove.sort(), pin.comments, pin.head), payload: { kind, number: target.number, add, remove, pin } }
    }
    case 'comment': case 'review': {
      if (kind === 'review' && !target.isPull) return { reject: 'only a pull request takes a review' }
      const problem = checkText(proposal.body, target.author)
      if (problem) return { reject: 'the reply was held back because ' + problem }
      // Asking a reporter for missing details is routine; every other reply waits for a possible Stop.
      const asks = kind === 'comment' && !target.isPull && proposal.intent === 'ask_details'
      const event = kind === 'review' ? (proposal.event === 'REQUEST_CHANGES' ? 'REQUEST_CHANGES' : 'COMMENT') : undefined
      const payload = { kind, number: target.number, body: proposal.body.trim(), event, pin }
      return { ...base, tier: asks ? 'notify' : 'window', windowHours: asks ? 0 : WINDOW_HOURS[kind], id: actionId(kind, target.number, pin.comments, pin.head), payload }
    }
    case 'merge': {
      if (!target.isPull) return { reject: 'only a pull request merges' }
      if (target.draft) return { reject: 'it is a draft' }
      if (!target.checksGreen) return { reject: 'its checks are not green' }
      if (proposal.head !== target.head) return { reject: 'it was reviewed at another commit' }
      const why = sensitive.length ? 'it touches protected files (' + sensitive[0] + (sensitive.length > 1 ? ' and ' + (sensitive.length - 1) + ' more' : '') + ')' : target.firstTime ? 'it is a first-time contributor’s' : ''
      const method = (target.files ?? []).some(file => file.startsWith('src/catalog/') || /\/modules\//.test(file)) ? 'merge' : 'squash'
      const payload = { kind, number: target.number, head: target.head, method, pin }
      return { ...base, reason: [reason, why && 'Asking because ' + why + '.'].filter(Boolean).join('\n'), tier: why ? 'ask' : 'window', windowHours: why ? 0 : WINDOW_HOURS.merge, id: actionId(kind, target.number, target.head), payload }
    }
    case 'close': case 'decline': {
      const comment = String(proposal.body ?? '').trim()
      const problem = comment ? checkText(comment, target.author) : 'it gives no reason to the author'
      if (problem) return { reject: 'the closure was held back because ' + problem }
      // Turning down someone's pull request is always the owner's call; closing an issue waits for a Stop.
      const decline = target.isPull && target.author !== OWNER
      const stateReason = proposal.reason_code === 'not_planned' ? 'not_planned' : 'completed'
      const payload = { kind: 'close', number: target.number, isPull: target.isPull, body: comment, stateReason, pin }
      return { ...base, tier: decline ? 'ask' : 'window', windowHours: decline ? 0 : WINDOW_HOURS.close, id: actionId('close', target.number, pin.comments, pin.head), payload }
    }
  }
}
