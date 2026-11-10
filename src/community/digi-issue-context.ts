// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { compareModuleVersions } from '../catalog/versions'
import { DEVICES_BY_ID } from '../devices/registry'
import { DIGI_FLASH_CHOICES, IssueInputError, type DigiIssueContext } from './issue-context'
import { nativeModule } from './modules'

/** New machines submit structured text only; the Octatrack log contract does not apply. */
export function validateDigiIssueContext(value: unknown, machine: string): DigiIssueContext {
  const fail = (message: string): never => { throw new IssueInputError(message) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('Report context is missing.')
  const item = value as Record<string, unknown>, profile = DEVICES_BY_ID[machine]
  if (!profile || !['digitakt','digitone'].includes(machine) || item.machine !== machine) return fail('The report belongs to a different machine.')
  if (Object.keys(item).some(key => !['machine','model','flash','os','moduleVersion','modules','keepStockFx2','build'].includes(key))) return fail('Unexpected report context field. Files and firmware are not accepted.')
  if (typeof item.model !== 'string' || !(profile.variants ?? [profile.name]).includes(item.model)) return fail('Choose your machine model.')
  if (!(DIGI_FLASH_CHOICES as readonly unknown[]).includes(item.flash)) return fail('Choose what the machine is running.')
  if (typeof item.os !== 'string' || !profile.firmware?.releases.includes(item.os)) return fail('Choose a supported base OS release.')
  const version = (value: unknown) => { if (typeof value !== 'string' || value.length > 80) return fail('Include the module version.'); try { compareModuleVersions(value,value) } catch { return fail('The module version is unreadable.') } return value }
  const moduleVersion = version(item.moduleVersion)
  if (!Array.isArray(item.modules) || item.modules.length > 64) return fail('The configuration module list is unreadable.')
  const seen = new Set<string>()
  const modules = item.modules.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('The configuration module list is unreadable.')
    const entry = value as Record<string, unknown>
    if (Object.keys(entry).some(key => !['id','version'].includes(key)) || typeof entry.id !== 'string' || !nativeModule(machine,entry.id) || seen.has(entry.id)) return fail('The configuration contains modules from another machine or unknown modules.')
    seen.add(entry.id)
    return {id:entry.id,version:version(entry.version)}
  })
  // These machines have no device log, so the reporter always names the configuration.
  if (!modules.length) return fail('Choose the configuration the machine runs: a saved one, or its modules.')
  if (item.keepStockFx2 !== null) return fail('Octatrack settings do not apply to this machine.')
  if (typeof item.build !== 'string' || !/^(?:[0-9a-f]{64})?$/.test(item.build)) return fail('The build fingerprint is unreadable.')
  return {machine:machine as DigiIssueContext['machine'],model:item.model,flash:item.flash as DigiIssueContext['flash'],os:item.os,moduleVersion,modules,keepStockFx2:null,build:item.build}
}
