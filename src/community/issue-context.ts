// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
/**
 * Structured issue reports, shared by the report form and the Worker so both
 * enforce the same rules. With this many modules and configurations a free-text
 * report rarely reproduces; every report therefore carries the configuration it
 * was built from. An attached OCTAMOD.LOG records that configuration itself, so
 * the report takes it from the log. Without a log the reporter names the
 * configuration: a saved one from this browser, or the modules by hand.
 */
import type { OtLogSummary } from './ot-log'

export const OT_MODELS = { mk2: 'Octatrack MKII', mk1: 'Octatrack MKI', unknown: 'Not sure' } as const
export const FLASH_STATES = { card: 'Running Modwerk firmware from the card', usb: 'Running modules loaded over USB', flashed: 'Running a Modwerk build', 'not-flashed': 'Not flashed yet (website/build problem)', stock: 'Back on the stock OS' } as const
/** Maintainers ask an Octatrack reporter whether it was a card build or a USB sync, so the form asks; `flashed` stays readable for older reports and is what Digitakt and Digitone flash. */
export const OT_FLASH_CHOICES = ['card', 'usb', 'not-flashed', 'stock'] as const
export const DIGI_FLASH_CHOICES = ['flashed', 'not-flashed', 'stock'] as const
export const LOG_MISSING_REASONS = {
  'logger-not-in-build': 'I am using an older build without logging',
  'device-does-not-boot': 'The Octatrack does not boot',
  'card-unreadable': 'The card or OCTAMOD.LOG cannot be read',
  'not-flashed': 'The problem happens before flashing',
  other: 'Other reason',
} as const
export type OtModel = keyof typeof OT_MODELS
export type FlashState = keyof typeof FLASH_STATES
export type LogMissingReason = keyof typeof LOG_MISSING_REASONS
export type OctatrackIssueContext = {
  machine?: 'octatrack'
  model: OtModel
  flash: FlashState
  os: string
  modules: { id: string; version: string }[]
  keepStockFx2: boolean | null
  /** SHA-256 of the image this browser built; never the image itself. */
  build: string
}
export type DigiIssueContext = Omit<OctatrackIssueContext, 'machine' | 'model' | 'keepStockFx2'> & {
  machine: 'digitakt' | 'digitone'; model: string; keepStockFx2: null; moduleVersion: string
}
export type IssueContext = OctatrackIssueContext | DigiIssueContext
export function isDigiIssue(context: IssueContext): context is DigiIssueContext { return context.machine === 'digitakt' || context.machine === 'digitone' }
export type LogMissing = { reason: LogMissingReason; note: string }

const MODULE_ID = /^[a-z0-9][a-z0-9-]{0,47}$/, VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.]{1,24})?$/

export class IssueInputError extends Error {}
function fail(message: string): never { throw new IssueInputError(message) }
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

/** The modules, base OS and FX2 setting the device wrote into its log; a v1 log has no FX2 setting. */
export function configurationFromLog(summary: Pick<OtLogSummary, 'version' | 'modules' | 'os' | 'stockFx2'>) {
  return { modules: summary.modules.map(item => ({ id: item.id, version: item.version })), os: summary.os, keepStockFx2: summary.version === 2 ? summary.stockFx2 : null }
}

export const CONFIGURATION_REQUIRED = 'Choose the configuration the Octatrack runs, or attach OCTAMOD.LOG.'

/** With a log, the configuration comes from the log; without one the report must name at least one module. */
export function validateIssueContext(value: unknown, log: Pick<OtLogSummary, 'version' | 'modules' | 'os' | 'stockFx2'> | null = null): OctatrackIssueContext {
  if (!isRecord(value)) fail('Report context is missing.')
  const { model, flash, os, modules, keepStockFx2, build } = value
  if (typeof model !== 'string' || !Object.hasOwn(OT_MODELS, model)) fail('Choose your Octatrack model.')
  // `flashed` is still accepted: a tab opened before the card/USB split sends it.
  if (typeof flash !== 'string' || !Object.hasOwn(FLASH_STATES, flash)) fail('Choose what the Octatrack is running.')
  if (typeof os !== 'string' || !/^[0-9A-Za-z.]{1,16}$/.test(os)) fail('The base OS version is unreadable.')
  if (!Array.isArray(modules) || modules.length > 64) fail('The configuration module list is unreadable.')
  const seen = new Set<string>()
  const list = modules.map(item => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.version !== 'string' || !MODULE_ID.test(item.id) || !VERSION.test(item.version) || seen.has(item.id)) fail('The configuration module list is unreadable.')
    seen.add(item.id)
    return { id: item.id, version: item.version }
  })
  if (keepStockFx2 !== null && typeof keepStockFx2 !== 'boolean') fail('The FX2 chooser setting is unreadable.')
  if (typeof build !== 'string' || !/^(?:[0-9a-f]{64})?$/.test(build)) fail('The build fingerprint is unreadable.')
  if (log) {
    const recorded = configurationFromLog(log)
    return { model: model as OtModel, flash: flash as FlashState, os: recorded.os, modules: recorded.modules, keepStockFx2: recorded.keepStockFx2 ?? keepStockFx2, build }
  }
  if (!list.length) fail(CONFIGURATION_REQUIRED)
  return { model: model as OtModel, flash: flash as FlashState, os, modules: list, keepStockFx2, build }
}

/** A log is required unless the reporter says why there is none; the reason must fit the report. */
export function validateLogMissing(value: unknown, context: OctatrackIssueContext): LogMissing {
  if (!isRecord(value) || typeof value.reason !== 'string' || !(value.reason in LOG_MISSING_REASONS)) fail('Attach OCTAMOD.LOG, or choose why you cannot.')
  const reason = value.reason as LogMissingReason
  const note = typeof value.note === 'string' ? value.note.trim() : ''
  if (note.length > 500) fail('Keep the reason under 500 characters.')
  if (reason === 'other' && note.length < 10) fail('Describe in a few words why you cannot attach OCTAMOD.LOG.')
  if (reason === 'not-flashed' && (context.flash === 'flashed' || context.flash === 'card' || context.flash === 'usb')) fail('You said the Octatrack runs a Modwerk build. Attach OCTAMOD.LOG, or choose another reason.')
  return { reason, note }
}
