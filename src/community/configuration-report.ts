// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
/**
 * Reports about a whole configuration, shared by the report dialog and the Worker. A module report names one
 * module and goes to its authors. A configuration report is for a problem in the combination, where no single
 * module is known to be at fault, so it goes to the authors and maintainers of every catalog module in it.
 */
import { validateDigiIssueContext } from './digi-issue-context'
import { IssueInputError, validateIssueContext, type IssueContext } from './issue-context'
import { communityModule, machineModules } from './modules'
import type { OtLogSummary } from './ot-log'

/** GitHub handles mentioned on one report. Every author keeps full access on Modwerk whatever this cap leaves out. */
export const CONFIGURATION_REPORT_MAX_OWNERS = 25
export const CONFIGURATION_MODULES_REQUIRED = 'Choose a configuration with at least one catalog module.'

export type ReportedModule = { id: string; moduleId: string; name: string; version: string }
type LogConfiguration = Pick<OtLogSummary, 'version' | 'modules' | 'os' | 'stockFx2'>

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

/** The catalog modules among a machine's native module ids, by community id, at the versions given. Modules the catalog no longer lists have no author to notify and are left out. */
export function catalogModules(machine: string, modules: readonly { id: string; version: string }[]): ReportedModule[] {
  const catalog = machineModules(machine)
  return modules.flatMap(item => {
    const module = catalog.find(candidate => candidate.moduleId === item.id)
    return module ? [{ id: module.id, moduleId: module.moduleId, name: module.name, version: item.version }] : []
  })
}
/** The catalog modules of a validated context, at the versions the reporter ran. */
export const reportedModules = (context: IssueContext) => catalogModules(context.machine ?? 'octatrack', context.modules)

/** An Octatrack log records what the device ran, so it decides the modules; Digitakt and Digitone have no log. */
export function validateConfigurationReportContext(value: unknown, log: LogConfiguration | null = null): { context: IssueContext; modules: ReportedModule[] } {
  const machine = isRecord(value) && typeof value.machine === 'string' ? value.machine : 'octatrack'
  if (machine !== 'octatrack' && log) throw new IssueInputError('This machine accepts structured reports only. Files and firmware are not accepted.')
  const context = machine === 'octatrack' ? validateIssueContext(value, log) : validateDigiIssueContext(value, machine)
  const modules = reportedModules(context)
  if (!modules.length) throw new IssueInputError(CONFIGURATION_MODULES_REQUIRED)
  return { context, modules }
}

/** Authors and declared maintainers of every reported module, once each, in the order the configuration lists them. */
export function configurationOwners(modules: readonly Pick<ReportedModule, 'id'>[]): string[] {
  const seen = new Set<string>(), owners: string[] = []
  for (const { id } of modules) {
    const module = communityModule(id)
    for (const login of module ? [module.author, ...module.maintainers] : []) {
      const key = login.toLowerCase()
      if (!seen.has(key)) { seen.add(key); owners.push(login) }
    }
  }
  return owners
}

export const configurationSummary = (count: number) => count + (count === 1 ? ' module' : ' modules')
