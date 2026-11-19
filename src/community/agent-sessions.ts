// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Shared agent sessions (docs/AGENT_SESSIONS.md): a developer may send the owner the conversation of one coding-agent
// session, so the owner sees where contributing gets in the way. Only the conversation travels: the developer's prompts,
// the agent's replies and which tools ran and whether they failed. Tool output, thinking, long code blocks, hex dumps,
// secrets and home paths stay on the developer's computer. The terminal client (scripts/agent-session.mjs) and the
// Worker (server/agent-sessions.ts) both use this file, so the Worker refuses what the client would have refused.
// Plain type annotations only: Node runs this file directly from the client.

export const SESSION_CONSENT_VERSION = '2026-11-19'
export const SESSION_FORMAT = 1
export const SESSION_RETENTION_DAYS = 90
export const SESSION_NOTE_LIMIT = 1000
export const SESSION_ENTRY_LIMIT = 8000
export const SESSION_TEXT_LIMIT = 3_000_000 // characters of kept text, before compression
export const SESSION_GZIP_LIMIT = 1_000_000 // bytes the Worker accepts
export const SESSION_AGENTS = ['claude-code', 'codex'] as const
export type SessionAgent = typeof SESSION_AGENTS[number]
export type SessionEntry = { who: 'developer' | 'agent' | 'tool'; text: string; at?: string; failed?: true }
export type SessionRemoved = { toolOutputs: number; thinking: number; codeBlocks: number; hexLines: number; blobs: number; secrets: number; skipped: number; trimmed: number }
export type SessionDocument = { format: 1; agent: SessionAgent; branch?: string; startedAt?: string; endedAt?: string; note: string; entries: SessionEntry[]; removed: SessionRemoved }
export type ScrubContext = { user?: string; host?: string; home?: string }

const ENTRY_TEXT_LIMIT = 20_000
const CODE_BLOCK_LINES = 12
const emptyRemoved = (): SessionRemoved => ({ toolOutputs: 0, thinking: 0, codeBlocks: 0, hexLines: 0, blobs: 0, secrets: 0, skipped: 0, trimmed: 0 })
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /\b(?:re|whsec|rk|pk|sk)_[A-Za-z0-9]{24,}\b/g,
  /\b[a-f0-9]{64}\b/gi, // board and admin tokens, and SHA-256 hashes, which look the same
]
// A password after its name, whatever it looks like; a token or key only when its value looks like one, so prose such as
// "token: expired" stays readable.
const ASSIGNED_PASSWORD = /\b((?:[A-Z0-9_]*_)?(?:password|passwd|pwd|secret)[A-Z0-9_]*)(["']?[ \t]*[:=][ \t]*["']?)([^\s"',;&]{4,})/gi
const ASSIGNED_TOKEN = /\b((?:[A-Z0-9_]*_)?(?:token|api[_-]?key|access[_-]?key|auth(?!or)|cookie)[A-Z0-9_]*)(["']?[ \t]*[:=][ \t]*(?:Bearer[ \t]+)?["']?)((?=[^\s"',;&]*\d)[^\s"',;&]{8,}|[^\s"',;&]{20,})/gi
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}/g
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
const IPV4 = /\b(?!127\.0\.0\.1\b)(?!0\.0\.0\.0\b)(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g
const HOME = /(?:\/mnt\/[a-z]\/Users\/[^/\s]+|\/home\/[^/\s]+|\/Users\/[^/\s]+|[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s]+)/g
/** One line of a hex dump: an offset, then eight or more byte pairs, or sixteen byte pairs on their own. */
const HEX_LINE = /^[ \t]*(?:(?:0x)?[0-9a-f]{4,16}[: \t][ \t]*(?:[0-9a-f]{2}[ \t,]+){7,}[0-9a-f]{2}\b|(?:(?:0x)?[0-9a-f]{2}[ \t,]+){15,}(?:0x)?[0-9a-f]{2}\b).*$/gim
const HEX_RUN = /(?:0x[0-9a-f]{1,8}\s*,\s*){8,}0x[0-9a-f]{1,8}/gi
const BLOB = /[A-Za-z0-9+/=_-]{120,}|\b[0-9a-f]{65,}\b/gi
const FENCE = /```[^\n]*\n[\s\S]*?(?:```|$)/g
/** Disassembled stock code: a ColdFire/68k or DSP56300 mnemonic, optionally after an address, with a register, an
 * immediate or a hex operand. Lower case, as disassemblers print it, so English prose starting with "add" never counts. */
const ASM_LINE = /^[ \t]*(?:[0-9a-fA-F]{4,8}:?[ \t]+(?:[0-9a-fA-F]{4}[ \t]+)*)?(?:move[aqm]?|lea|pea|jsr|bsr|b(?:ra|eq|ne|cc|cs|ge|gt|le|lt|hi|ls|mi|pl)|rts|rte|link|unlk|addq?|subq?|addi|subi|cmpi?|cmpa|tst|clr|lsl|lsr|asl|asr|andi?|ori?|eori?|muls|mulu|divs|divu|macl?|msacl?|jmp|jclr|jset|jsclr|jsset|rep|movep|movec|ext[bwl]?|swap|bset|bclr|btst)(?:\.[bwls])?[ \t]+[^\n]*?(?:%?\b[ad][0-7]\b|\bsp\b|\b[rnm][0-7]\b|\b[xy][01]\b|#|\$[0-9a-fA-F]|\b0x[0-9a-fA-F])/gm

function count(text: string, pattern: RegExp) { return (text.match(pattern) ?? []).length }

/** Removes what must not leave the developer's computer from one piece of text, and counts what it removed. */
export function scrubText(input: string, context: ScrubContext = {}, removed: SessionRemoved = emptyRemoved()): string {
  let text = input.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').replace(/<local-command-std(?:out|err)>[\s\S]*?<\/local-command-std(?:out|err)>/g, '')
  text = text.replace(FENCE, block => {
    const lines = block.split('\n').length - 2
    if (lines <= CODE_BLOCK_LINES) return block
    removed.codeBlocks++
    return `[code block removed: ${lines} lines]`
  })
  text = text.replace(HEX_LINE, () => { removed.hexLines++; return '[hex removed]' }).replace(HEX_RUN, () => { removed.hexLines++; return '[hex values removed]' })
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, () => { removed.secrets++; return '[secret removed]' })
  for (const pattern of [ASSIGNED_PASSWORD, ASSIGNED_TOKEN]) text = text.replace(pattern, (_all, key: string, joint: string) => { removed.secrets++; return key + joint + '[secret removed]' })
  text = text.replace(BEARER, (_all, scheme: string) => { removed.secrets++; return scheme + ' [secret removed]' })
  text = text.replace(BLOB, () => { removed.blobs++; return '[data removed]' })
  text = text.replace(EMAIL, '[email]').replace(HOME, '~').replace(IPV4, '[address]')
  // The home folder as Claude Code names its project folders (-home-alice-modwerk, C--Users-alice-Dev), which saved tool outputs' paths carry.
  if (context.home) { const folder = claudeProjectFolder(context.home); if (folder.replace(/-/g, '').length >= 4) text = text.split(folder).join('~') }
  if (context.user && context.user.length >= 3) text = text.replace(new RegExp(`\\b${escape(context.user)}\\b`, 'gi'), '[user]')
  if (context.host && context.host.length >= 3) text = text.replace(new RegExp(`\\b${escape(context.host)}\\b`, 'gi'), '[host]')
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

/** Why an entry still looks like firmware or stock code after scrubbing, or null. The client refuses to send such a
 * session and the Worker refuses to store one: the modding guidelines keep firmware and stock code off Modwerk's servers. */
export function firmwareReason(text: string): string | null {
  if (count(text, ASM_LINE) >= 6) return 'disassembly'
  if (count(text, /\b0x[0-9a-f]{2,8}\b/gi) >= 24) return 'many hex values'
  if (/(?:\b\d{1,5}\s*,\s*){32,}/.test(text)) return 'a long table of numbers'
  if (count(text, HEX_LINE) > 0) return 'a hex dump'
  return null
}
/** Whether a secret-shaped string survived scrubbing (the Worker refuses the session then). */
export function secretLike(text: string) { return SECRET_PATTERNS.some(pattern => new RegExp(pattern.source, pattern.flags).test(text)) }

export function firmwareFindings(entries: SessionEntry[]) {
  return entries.flatMap((entry, index) => { const reason = firmwareReason(entry.text); return reason ? [{ index, who: entry.who, reason }] : [] })
}

type Raw = Record<string, unknown>
const record = (value: unknown): value is Raw => !!value && typeof value === 'object' && !Array.isArray(value)
const str = (value: unknown) => typeof value === 'string' ? value : ''
const oneLine = (value: string, limit = 200) => { const line = value.replace(/\s+/g, ' ').trim(); return line.length > limit ? line.slice(0, limit - 1) + '…' : line }

/** What a tool call did, in one line: the command for a shell, the file for a file tool, nothing of what it wrote. */
export function describeTool(name: string, input: unknown): string {
  const args = record(input) ? input : {}
  const command = Array.isArray(args.command) ? args.command.map(String).join(' ') : str(args.command) || str(args.cmd)
  const description = str(args.description)
  if (command) return `${name}: ${description ? description + ' · ' : ''}${oneLine(command)}`
  const target = str(args.file_path) || str(args.notebook_path) || str(args.path) || str(args.pattern) || str(args.url) || str(args.skill) || str(args.subagent_type)
  return target ? `${name}: ${oneLine(description ? description + ' · ' + target : target)}` : description ? `${name}: ${oneLine(description)}` : name
}

/** One Claude Code transcript (`~/.claude/projects/<cwd>/<session>.jsonl`), one JSON object per line. */
export function readClaudeTranscript(lines: string[]): Omit<SessionDocument, 'note'> {
  const entries: SessionEntry[] = [], removed = emptyRemoved(), tools = new Map<string, SessionEntry>()
  let branch: string | undefined, startedAt: string | undefined, endedAt: string | undefined
  for (const line of lines) {
    let row: unknown
    try { row = JSON.parse(line) } catch { continue }
    if (!record(row) || (row.type !== 'user' && row.type !== 'assistant') || row.isSidechain === true || !record(row.message)) continue
    const at = str(row.timestamp) || undefined
    if (at) { startedAt ??= at; endedAt = at }
    if (str(row.gitBranch) && str(row.gitBranch) !== 'HEAD') branch = str(row.gitBranch)
    const content = row.message.content, blocks: Raw[] = typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content.filter(record) : []
    if (row.type === 'user') {
      for (const block of blocks) if (block.type === 'tool_result') {
        removed.toolOutputs++
        const tool = tools.get(str(block.tool_use_id)); if (tool && block.is_error === true) tool.failed = true
      }
      // Only what the developer typed: not skill bodies, hook output, task notifications or other injected turns.
      // A compaction summary is the agent's own recap of everything before it, file contents included.
      const human = !record(row.origin) || row.origin.kind === 'human'
      if (row.isMeta === true || row.isCompactSummary === true || row.isVisibleInTranscriptOnly === true || !human) { if (blocks.some(block => block.type === 'text')) removed.skipped++; continue }
      let text = blocks.filter(block => block.type === 'text').map(block => str(block.text)).join('\n')
      // A slash command arrives as tags: keep the command and its arguments.
      const command = /<command-name>([^<]*)<\/command-name>/.exec(text)
      if (command) text = (command[1].trim() + ' ' + (/<command-args>([^<]*)<\/command-args>/.exec(text)?.[1] ?? '')).trim()
      if (text.trim()) entries.push({ who: 'developer', text, ...(at ? { at } : {}) })
      if (blocks.some(block => block.type === 'image')) entries.push({ who: 'developer', text: '[image]', ...(at ? { at } : {}) })
      continue
    }
    for (const block of blocks) {
      if (block.type === 'text' && str(block.text).trim()) entries.push({ who: 'agent', text: str(block.text), ...(at ? { at } : {}) })
      else if (block.type === 'thinking' || block.type === 'redacted_thinking') removed.thinking++
      else if (block.type === 'tool_use') {
        const entry: SessionEntry = { who: 'tool', text: describeTool(str(block.name), block.input), ...(at ? { at } : {}) }
        entries.push(entry); tools.set(str(block.id), entry)
      }
    }
  }
  return { format: SESSION_FORMAT, agent: 'claude-code', ...(branch ? { branch } : {}), ...(startedAt ? { startedAt, endedAt } : {}), entries, removed }
}

/** One Codex rollout (`~/.codex/sessions/<y>/<m>/<d>/rollout-*.jsonl`). */
export function readCodexRollout(lines: string[]): Omit<SessionDocument, 'note'> & { cwd?: string } {
  const entries: SessionEntry[] = [], removed = emptyRemoved(), tools = new Map<string, SessionEntry>()
  let cwd: string | undefined, branch: string | undefined, startedAt: string | undefined, endedAt: string | undefined
  for (const line of lines) {
    let row: unknown
    try { row = JSON.parse(line) } catch { continue }
    if (!record(row) || !record(row.payload)) continue
    const at = str(row.timestamp) || undefined, item = row.payload
    if (at) { startedAt ??= at; endedAt = at }
    if (row.type === 'session_meta') { cwd = str(item.cwd) || cwd; if (record(item.git)) branch = str(item.git.branch) || branch; continue }
    if (row.type !== 'response_item') continue
    if (item.type === 'message') {
      const text = (Array.isArray(item.content) ? item.content.filter(record) : []).map(part => str(part.text)).join('\n')
      if (item.role === 'assistant' && text.trim()) entries.push({ who: 'agent', text, ...(at ? { at } : {}) })
      else if (item.role === 'user' && text.trim()) {
        if (/^\s*(?:<environment_context>|<user_instructions>|# AGENTS\.md instructions)/.test(text)) removed.skipped++
        else entries.push({ who: 'developer', text, ...(at ? { at } : {}) })
      }
    } else if (item.type === 'reasoning') removed.thinking++
    else if (item.type === 'function_call' || item.type === 'custom_tool_call' || item.type === 'local_shell_call') {
      let input: unknown = item.input ?? item.action
      if (typeof item.arguments === 'string') { try { input = JSON.parse(item.arguments) } catch { input = {} } }
      const entry: SessionEntry = { who: 'tool', text: describeTool(str(item.name) || 'shell', item.type === 'custom_tool_call' ? {} : input), ...(at ? { at } : {}) }
      entries.push(entry); tools.set(str(item.call_id), entry)
    } else if (item.type === 'function_call_output' || item.type === 'custom_tool_call_output') {
      removed.toolOutputs++
      const output = typeof item.output === 'string' ? item.output : JSON.stringify(item.output ?? '')
      const tool = tools.get(str(item.call_id))
      if (tool && /"exit_code"\s*:\s*[1-9]|Process exited with code [1-9]|exit code:? [1-9]/i.test(output)) tool.failed = true
    }
  }
  return { format: SESSION_FORMAT, agent: 'codex', ...(cwd ? { cwd } : {}), ...(branch ? { branch } : {}), ...(startedAt ? { startedAt, endedAt } : {}), entries, removed }
}

/** Scrubs every entry and the note, drops the entries the developer chose to leave out, and trims the middle of a session
 * too long to send, keeping its start and its end. */
export function prepareSession(read: Omit<SessionDocument, 'note'> & { cwd?: string }, note: string, context: ScrubContext = {}, skip: number[] = []): SessionDocument {
  const removed = { ...read.removed }
  let entries = read.entries.flatMap((entry, index) => {
    if (skip.includes(index)) { removed.skipped++; return [] }
    let text = scrubText(entry.text, context, removed)
    if (text.length > ENTRY_TEXT_LIMIT) text = text.slice(0, ENTRY_TEXT_LIMIT) + ' [cut]'
    return text ? [{ ...entry, text }] : []
  })
  const size = () => entries.reduce((sum, entry) => sum + entry.text.length + 40, 0)
  if (entries.length > SESSION_ENTRY_LIMIT || size() > SESSION_TEXT_LIMIT) {
    const head = entries.slice(0, 50)
    let tail = entries.slice(50)
    while (tail.length && (head.length + tail.length + 1 > SESSION_ENTRY_LIMIT || [...head, ...tail].reduce((sum, entry) => sum + entry.text.length + 40, 0) > SESSION_TEXT_LIMIT)) { tail = tail.slice(Math.ceil(tail.length / 10)) }
    removed.trimmed = entries.length - head.length - tail.length
    entries = [...head, { who: 'tool', text: `[${removed.trimmed} entries left out to fit the size limit]` }, ...tail]
  }
  const cleanNote = scrubText(note, context).slice(0, SESSION_NOTE_LIMIT)
  return { format: SESSION_FORMAT, agent: read.agent, ...(read.branch ? { branch: oneLine(scrubText(read.branch, context), 120) } : {}), ...(read.startedAt ? { startedAt: read.startedAt, endedAt: read.endedAt } : {}), note: cleanNote, entries, removed }
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/
/** The Worker's check of a session it is asked to store: the shape, the limits, and no firmware or secrets left. */
export function validateSession(value: unknown): { ok: true; session: SessionDocument } | { ok: false; error: string } {
  if (!record(value) || value.format !== SESSION_FORMAT) return { ok: false, error: 'Send a session in the current format (update your checkout).' }
  if (!SESSION_AGENTS.includes(value.agent as SessionAgent)) return { ok: false, error: 'Name the agent: ' + SESSION_AGENTS.join(' or ') + '.' }
  if (typeof value.note !== 'string' || value.note.length > SESSION_NOTE_LIMIT) return { ok: false, error: `Keep the note to ${SESSION_NOTE_LIMIT} characters.` }
  if (value.branch !== undefined && (typeof value.branch !== 'string' || value.branch.length > 120)) return { ok: false, error: 'The branch must be a short name.' }
  for (const key of ['startedAt', 'endedAt']) if (value[key] !== undefined && (typeof value[key] !== 'string' || !ISO.test(value[key] as string))) return { ok: false, error: 'Times must be UTC timestamps.' }
  if (!Array.isArray(value.entries) || !value.entries.length || value.entries.length > SESSION_ENTRY_LIMIT + 1) return { ok: false, error: 'A session holds 1 to ' + SESSION_ENTRY_LIMIT + ' entries.' }
  for (const entry of value.entries) {
    if (!record(entry) || !['developer', 'agent', 'tool'].includes(entry.who as string) || typeof entry.text !== 'string' || entry.text.length > ENTRY_TEXT_LIMIT + 10
      || (entry.at !== undefined && (typeof entry.at !== 'string' || !ISO.test(entry.at))) || (entry.failed !== undefined && entry.failed !== true)) return { ok: false, error: 'An entry is not in the session format.' }
  }
  if (!record(value.removed)) return { ok: false, error: 'Say what the client removed.' }
  const session = value as SessionDocument, texts = [session.note, ...session.entries.map(entry => entry.text)]
  const firmware = firmwareFindings(session.entries)
  if (firmware.length) return { ok: false, error: `Entries ${firmware.slice(0, 5).map(item => item.index).join(', ')} still look like firmware or stock code (${firmware[0].reason}). Leave them out with --skip and send again.` }
  if (texts.some(secretLike)) return { ok: false, error: 'A secret is still in the session. Update your checkout, which removes it, and send again.' }
  return { ok: true, session }
}

/** The folder Claude Code keeps a working directory's transcripts in: every character but letters and digits becomes '-'. */
export const claudeProjectFolder = (cwd: string) => cwd.replace(/[^A-Za-z0-9]/g, '-')
