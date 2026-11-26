// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// The maintenance bot's trusted policy (docs/MAINTENANCE_BOT.md). The model only proposes; this file decides what
// each proposal may do and when. It runs from main in a job the model never touches, and the bot cannot change it:
// a pull request that edits this folder is never merged without the owner's OK.
import { createHash } from 'node:crypto'

export const OWNER = 'repeat98'
/**
 * Hours an action waits for the owner's Stop before it runs. Someone who asked for help hears back within the hour
 * (owner, 26 November 2026); the owner's own pull request merges after `ownMerge`.
 */
export const WINDOW_HOURS = { merge: 12, ownMerge: 1, decision: 24, close: 12, comment: 1, review: 1, board_reply: 1, board_close: 12, discord_reply: 1, forum_reply: 1, shout_reply: 1 }
const KINDS = new Set(['label', 'comment', 'review', 'merge', 'close', 'decline', 'board_reply', 'board_close', 'board_release', 'discord_reply', 'forum_reply', 'shout_reply', 'approve_run'])
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
/** Documentation under sdk/ cannot change what runs; an AGENTS.md there steers agents and stays protected. */
const isSdkDoc = file => /^sdk\/.*\.md$/.test(file) && !/(^|\/)AGENTS\.md$/.test(file)
/** What a pull request's checks run from. A first-time contributor's checks start by themselves unless the diff touches these. */
const CI_PATHS = [/^\.github\//, /^scripts\//, /^package(-lock)?\.json$/, /^\.npmrc$/, /^(vite|vitest|eslint)\.config\.[a-z]+$/, /^tsconfig[^/]*\.json$/]
/** A recommended answer that waives a rule is never posted without the owner's Approve, whatever the model marked. */
const WAIVES = /\b(waiv\w*|exception\w*|exempt\w*)\b/i
/**
 * A base for any device merges only after its review, never on a timer and whoever opened it (owner, 26 November
 * 2026): a pull request from or into a `base/…` branch, or one that changes a base's built files. A base's
 * sources are under sdk/ outside the module folders, which SENSITIVE already covers.
 */
const BASE_BRANCH = /^base\//
const BASE_FILES = [/^public\/(?:base|[a-z0-9-]+-base-packages)\//, /^src\/engine\/assets\/[a-z0-9-]+-base[^/]*$/]
/** Paths whose merge publishes modules on the site: a release the owner approves every time. */
const PUBLISHES = [/\/modules\//, /^sdk\/imports\//, /^sdk\/catalog\.json$/, /^src\/catalog\//, /^src\/community\/module-changelogs\//]
const LINK = /https?:\/\/[^\s)>\]]+/g
const LINK_HOSTS = /^https:\/\/(github\.com\/repeat98\/modwerk(\/|$|#)|modwerk\.[a-z]+(\/|$)|octamod\.[a-z]+(\/|$))/

/** A to-do's command: a /modwerk-* skill, answering a board thread, or a red run on main (both number 0). The Worker checks the same shape. */
export const TODO_COMMAND = /^(\/modwerk-[a-z-]{2,30}(?: [^\n]{1,100})?|npm run board -- reply [0-9a-f-]{36}|gh run view \d{1,20} --log-failed)$/
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

const waives = proposal => proposal.exception === true || WAIVES.test([proposal.summary, proposal.reason, proposal.body].join(' '))

/**
 * Decides one proposal against the target's live state. `target` is what the executor read from GitHub:
 * { number, isPull, author, state, draft, head, comments, files, firstTime, checksGreen }.
 * Returns { tier, windowHours, id, payload } or { reject }.
 */
export function classify(proposal, target, existingLabels = new Set()) {
  const kind = proposal?.kind
  if (!KINDS.has(kind)) return { reject: 'kind "' + kind + '" is not something the bot may do' }
  const board = kind.startsWith('board_'), site = kind === 'forum_reply' || kind === 'shout_reply', chat = kind === 'discord_reply' || site
  if (!target || target.state !== 'open') return { reject: (chat ? 'that message was answered or is gone' : board ? 'that board thread or claim' : '#' + proposal.number) + (chat ? '' : ' is not open') }
  const summary = String(proposal.summary ?? '').trim().replace(/\s+/g, ' ').slice(0, 90), reason = String(proposal.reason ?? '').trim().slice(0, 800)
  if (!summary) return { reject: 'it has no summary' }
  // Every action pins the state it was proposed against; the executor drops it if the target moved on.
  const pin = { head: target.head ?? '', comments: target.comments }
  const base = { summary: (kind === 'forum_reply' ? 'Forum: ' : kind === 'shout_reply' ? 'Shoutbox: ' : chat ? 'Discord: ' : board ? 'Board: ' : '#' + target.number + ' ') + summary, reason }
  const sensitive = (target.files ?? []).filter(file => !isSdkDoc(file) && SENSITIVE.some(pattern => pattern.test(file)))
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
      // Asking a reporter for missing details is routine. An answer only the owner can give (an OK for a port, a
      // shared hook) is the bot's recommendation: it waits a day for a Stop, and for the owner's Approve when it
      // grants an exception to a rule or touches the unit's safety. Every other reply waits for a Stop.
      const asks = kind === 'comment' && !target.isPull && proposal.intent === 'ask_details', decision = kind === 'comment' && proposal.intent === 'decision'
      const event = kind === 'review' ? (proposal.event === 'REQUEST_CHANGES' ? 'REQUEST_CHANGES' : 'COMMENT') : undefined
      const payload = { kind, number: target.number, body: proposal.body.trim(), event, pin }
      const tier = asks ? 'notify' : decision && waives(proposal) ? 'ask' : 'window'
      return { ...base, tier, windowHours: tier === 'window' ? WINDOW_HOURS[decision ? 'decision' : kind] : 0, id: actionId(kind, target.number, pin.comments, pin.head, decision ? 'decision' : ''), payload }
    }
    case 'merge': {
      if (!target.isPull) return { reject: 'only a pull request merges' }
      if (target.draft) return { reject: 'it is a draft' }
      if (!target.checksGreen) return { reject: 'its checks are not green' }
      if (proposal.head !== target.head) return { reject: 'it was reviewed at another commit' }
      // A merge runs in the owner's name (the site only publishes owner merges), so someone else's release always
      // asks the owner. The owner marked their own pull request ready, so it merges after a short window.
      const own = target.author === OWNER
      const publishes = (target.files ?? []).some(file => PUBLISHES.some(pattern => pattern.test(file)))
      const isBase = BASE_BRANCH.test(target.baseRef ?? '') || BASE_BRANCH.test(target.headRef ?? '') || (target.files ?? []).some(file => BASE_FILES.some(pattern => pattern.test(file)))
      const why = isBase ? 'a base merges only after its review' : publishes && !own ? 'merging it publishes modules on the site' : sensitive.length ? 'it touches protected files (' + sensitive[0] + (sensitive.length > 1 ? ' and ' + (sensitive.length - 1) + ' more' : '') + ')' : target.firstTime ? 'it is a first-time contributor’s' : ''
      const method = (target.files ?? []).some(file => file.startsWith('src/catalog/') || /\/modules\//.test(file)) ? 'merge' : 'squash'
      const payload = { kind, number: target.number, head: target.head, method, pin }
      return { ...base, reason: [reason, why && 'Asking because ' + why + '.'].filter(Boolean).join('\n'), tier: why ? 'ask' : 'window', windowHours: why ? 0 : WINDOW_HOURS[own ? 'ownMerge' : 'merge'], id: actionId(kind, target.number, target.head), payload }
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
    // The agent board (docs/AGENT_BOARD.md). `target` is { kind: 'thread', id, author, replies, state } or { kind: 'claim', id, holder, state }.
    case 'board_reply': case 'board_close': {
      if (target.kind !== 'thread') return { reject: 'that is not a board thread' }
      const pinned = { replies: target.replies }
      if (kind === 'board_close') {
        // Ending someone else's thread is the owner's call; the owner's own waits for a Stop.
        const own = target.author === OWNER
        return { ...base, tier: own ? 'window' : 'ask', windowHours: own ? WINDOW_HOURS.board_close : 0, id: actionId(kind, target.id, target.replies), payload: { kind, thread: target.id, pin: pinned } }
      }
      const problem = String(proposal.body ?? '').length > 500 ? 'it is over the board’s 500 characters' : checkText(proposal.body, target.author)
      if (problem) return { reject: 'the board reply was held back because ' + problem }
      // An agent that asked TARS gets TARS's answer at once; an answer in the owner's name waits for a Stop (a day
      // when only the owner can give it), and one that grants an exception waits for the owner's Approve.
      const decision = proposal.intent === 'decision', asTars = target.to === 'tars', tier = asTars ? 'notify' : decision && waives(proposal) ? 'ask' : 'window'
      return { ...base, tier, windowHours: tier === 'window' ? WINDOW_HOURS[decision ? 'decision' : 'board_reply'] : 0, id: actionId(kind, target.id, target.replies, decision && !asTars ? 'decision' : ''), payload: { kind, thread: target.id, body: proposal.body.trim(), as: asTars ? 'tars' : 'owner', pin: pinned } }
    }
    // TARS on Discord (docs/DISCORD_BOT.md, docs/DISCORD_VOICE.md): one reply to a message nobody answered, never a ping.
    case 'discord_reply': {
      if (target.kind !== 'discord') return { reject: 'that is not a Discord message' }
      if (target.bot) return { reject: 'it answers a bot' }
      const body = String(proposal.body ?? '').trim()
      const problem = body.length > 1500 ? 'it is over 1500 characters' : /(?<![\w`])@\w/.test(body) ? 'it mentions someone' : checkText(body, '')
      if (problem) return { reject: 'the Discord reply was held back because ' + problem }
      return { ...base, tier: 'window', windowHours: WINDOW_HOURS.discord_reply, id: actionId(kind, target.channel, target.id), payload: { kind, channel: target.channel, message: target.id, body, pin: {} } }
    }
    // TARS in the site's forum and shoutbox: the same rules as Discord, and it may greet the person by name.
    case 'forum_reply': case 'shout_reply': {
      if (target.kind !== (kind === 'forum_reply' ? 'forum' : 'shout')) return { reject: 'that is not a ' + (kind === 'forum_reply' ? 'forum thread' : 'shout') }
      const body = String(proposal.body ?? '').trim(), limit = kind === 'forum_reply' ? 4000 : 600
      const problem = body.length > limit ? 'it is over ' + limit + ' characters' : checkText(body, target.author)
      if (problem) return { reject: 'the reply was held back because ' + problem }
      const payload = kind === 'forum_reply' ? { kind, thread: target.id, after: target.lastPost, body, pin: {} } : { kind, shout: target.id, body, pin: {} }
      return { ...base, tier: 'window', windowHours: WINDOW_HOURS[kind], id: actionId(kind, target.id, target.lastPost ?? ''), payload }
    }
    // A first-time contributor's checks wait for a maintainer to start them. A fork's run gets no secrets and a
    // read-only token, so they start at once; a diff that changes what the checks run from is the owner's tap.
    // The executor approves only runs at the pinned head.
    case 'approve_run': {
      if (!target.isPull) return { reject: 'only a pull request has runs to approve' }
      if (!target.waitingRuns) return { reject: 'no run waits for approval' }
      const ci = (target.files ?? []).filter(file => CI_PATHS.some(pattern => pattern.test(file)))
      return { ...base, reason: [reason, ci.length && 'Asking because it changes what the checks run from (' + ci[0] + ').'].filter(Boolean).join('\n'), tier: ci.length ? 'ask' : 'notify', windowHours: 0, id: actionId(kind, target.number, target.head), payload: { kind, number: target.number, pin } }
    }
    case 'board_release':
      if (target.kind !== 'claim') return { reject: 'that is not a board claim' }
      // Taking a claim from its holder is always the owner's call.
      return { ...base, tier: 'ask', windowHours: 0, id: actionId(kind, target.id), payload: { kind, claim: target.id, pin: {} } }
  }
}
