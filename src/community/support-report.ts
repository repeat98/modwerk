// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
/**
 * The member's own support report about the USB link: what the page shows after a failed sync, connection, install or
 * base update (Copy details, Save report), and what they can attach to a problem report they post. Built from the
 * link's recent events (link-trail.ts), which are the shared diagnostics' records (octatrack-diagnostics-contract.ts):
 * numbers, codes and hashes, never a module, set, project or file name. Nothing here sends anything; the member copies,
 * saves or attaches it. Shared by the page, the Worker (which checks an attachment and renders it for GitHub) and
 * `parseSupportFile`, which reads a saved file back the way `/modwerk-diagnostics` reads shared records.
 */
import { USB_AUDIO_LAYOUTS } from '../config/usb-audio'
import type { DiagnosticClient, OctatrackDiagnostic } from './octatrack-diagnostics-contract'

/** One event of the trail, with when the page saw it (ISO time). */
export type SupportEvent = Omit<OctatrackDiagnostic, 'id' | 'modules'> & { at: string }
/** The unit as the link knew it: the base's identity (with its version and USB Audio layout when the site knows them),
 * IDENTIFY's model text and the running set's digest. */
export interface SupportUnit { base: string; version?: string; layout?: string; model?: string; active?: string }
export interface SupportAttachment { schema: 1; unit?: SupportUnit; client?: DiagnosticClient; events: SupportEvent[] }
/** At most this many events go with a problem report; Copy details carries the newest SUPPORT_COPY_EVENTS. */
export const SUPPORT_ATTACHED_EVENTS = 50, SUPPORT_COPY_EVENTS = 20
/** The most a report's attached events may take in the request. */
export const SUPPORT_ATTACHMENT_BYTES = 48 * 1024
export const SUPPORT_LAYOUTS: readonly string[] = ['off', ...USB_AUDIO_LAYOUTS.map(layout => layout.id)]

const BROWSERS: Record<DiagnosticClient['browser'], string> = { chrome: 'Chrome', edge: 'Edge', opera: 'Opera', brave: 'Brave', samsung: 'Samsung Internet', firefox: 'Firefox', safari: 'Safari', other: 'Another browser' }
const SYSTEMS: Record<DiagnosticClient['os'], string> = { windows: 'Windows', macos: 'macOS', linux: 'Linux', chromeos: 'ChromeOS', android: 'Android', ios: 'iOS', other: 'another system' }
const short = (hash: string) => hash.slice(0, 8)
const layoutLabel = (layout: string) => layout === 'off' ? 'USB Audio off' : 'USB Audio · ' + (USB_AUDIO_LAYOUTS.find(item => item.id === layout)?.name ?? layout)
/** The base as the site names it, with its layout: "0.8.1 (USB Audio off) · 1a2b3c4d". */
export function supportBase(unit: SupportUnit) {
  return (unit.version ? unit.version + (unit.layout ? ' (' + layoutLabel(unit.layout) + ')' : '') + ' · ' : '') + short(unit.base)
}
const kb = (bytes: number) => bytes < 1024 ? bytes + ' bytes' : Math.round(bytes / 1024) + ' KB'

/** One event in a line: the time (UTC), the event and the link's phase, then whatever it carries. */
export function describeSupportEvent(entry: SupportEvent): string {
  const { at, event, phase } = entry, parts = [at.slice(11, 19), event, phase]
  if (entry.failure) parts.push(entry.failure)
  if (entry.error) parts.push('error ' + entry.error)
  if (entry.step) parts.push('at ' + entry.step)
  if (entry.result) parts.push('unit answered ' + entry.result)
  if (entry.refusal !== undefined) parts.push('refusal ' + entry.refusal)
  if (entry.kind) parts.push(entry.kind)
  if (entry.reconnect) parts.push('reconnect ' + entry.reconnect)
  if (entry.upload) parts.push(entry.upload.command + (entry.upload.chunkOffset !== undefined ? ' at byte ' + entry.upload.chunkOffset : '') + (entry.upload.remainingBytes !== undefined ? ', ' + entry.upload.remainingBytes + ' bytes outstanding' : ''))
  if (entry.usb) parts.push('EP0 ' + entry.usb.join(' '))
  if (entry.packages) parts.push(entry.packages.length + (entry.packages.length === 1 ? ' package, ' : ' packages, ') + kb(entry.packages.reduce((sum, item) => sum + item.bytes, 0)))
  if (entry.reading) parts.push(`self-test state ${entry.reading.state}, failed ${entry.reading.failed}, modules ${entry.reading.modules}, saved ${entry.reading.saved}`)
  if (entry.restore) parts.push(entry.restore.length + ' left out at start')
  if (entry.base) parts.push('base ' + short(entry.base))
  if (entry.active) parts.push('set ' + short(entry.active))
  return parts.join(' · ')
}

/** What the page shows with the events: what failed and its message (the member's own copy only, never attached). */
export interface SupportContext { what?: string; error?: string; created?: string }

/** The lines a person reads: the unit, the browser and the newest `count` events. */
export function supportLines(attachment: SupportAttachment, context: SupportContext = {}, count = attachment.events.length): string[] {
  const { unit, client } = attachment, events = count > 0 ? attachment.events.slice(-count) : []
  return ['Modwerk support details',
    ...(context.what ? ['What failed: ' + context.what] : []),
    ...(context.error ? ['Message: ' + context.error] : []),
    'Base: ' + (unit ? supportBase(unit) : 'not connected'),
    ...(unit?.model ? ['Octatrack: ' + unit.model] : []),
    ...(unit?.active ? ['Running set: ' + short(unit.active)] : []),
    ...(client ? ['Browser: ' + BROWSERS[client.browser] + (client.major ? ' ' + client.major : '') + ' on ' + SYSTEMS[client.os]] : []),
    ...(context.created ? ['Created: ' + context.created] : []),
    events.length ? `USB events, oldest first, times UTC (${events.length}${events.length < attachment.events.length ? ' of ' + attachment.events.length : ''}):` : 'No USB events since this page opened.',
    ...events.map(describeSupportEvent)]
}
/** Copy details: the readable lines with the newest SUPPORT_COPY_EVENTS events. */
export function supportText(attachment: SupportAttachment, context: SupportContext = {}) {
  return supportLines(attachment, context, SUPPORT_COPY_EVENTS).join('\n') + '\n'
}
/** The JSON lines a tool reads back: the unit and browser first, then one line per event. */
export function supportJsonLines(attachment: SupportAttachment): string[] {
  const { schema, unit, client, events } = attachment
  return [JSON.stringify({ modwerk: 'support', schema, ...(unit ? { unit } : {}), ...(client ? { client } : {}) }), ...events.map(event => JSON.stringify(event))]
}
/** Save report: every readable line, then the same as JSON lines. */
export function supportFile(attachment: SupportAttachment, context: SupportContext = {}) {
  return [...supportLines(attachment, context), '', 'For tools, the same as JSON lines:', ...supportJsonLines(attachment)].join('\n') + '\n'
}
export const supportFileName = (at: Date) => 'modwerk-support-' + at.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-') + '.txt'
/** A saved or pasted report read back: its JSON lines; the readable lines are skipped. Undefined without the first line. */
export function parseSupportFile(text: string): SupportAttachment | undefined {
  const records = text.split(/\r?\n/).filter(line => line.startsWith('{')).flatMap(line => { try { return [JSON.parse(line) as Record<string, unknown>] } catch { return [] } })
  const head = records.find(record => record.modwerk === 'support')
  if (!head || head.schema !== 1) return undefined
  return { schema: 1, ...(head.unit ? { unit: head.unit as SupportUnit } : {}), ...(head.client ? { client: head.client as DiagnosticClient } : {}),
    events: records.filter(record => record !== head && typeof record.at === 'string' && typeof record.event === 'string') as unknown as SupportEvent[] }
}
/** The attached events in a GitHub issue: collapsed, readable lines and JSON lines in one block. */
export function supportBlock(attachment: SupportAttachment): string[] {
  return ['<details><summary>USB events from the reporter’s browser (' + attachment.events.length + ')</summary>', '', '```text',
    ...supportLines(attachment), '', ...supportJsonLines(attachment), '```', '', '</details>', '']
}
