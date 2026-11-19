import { moduleAvailabilityError } from '../catalog/availability'
import { atLimit, limitedCount, LIMIT_REACHED, overLimitMessage, SET_MODULE_LIMIT } from '../catalog/set-limit'
import { STOCK_EFFECT_NAMES } from '../catalog/stock-effects'
import { configurationDevice, type Configuration } from '../config/workspace'
import { estimateCombination, isDigiDevice } from '../devices/digi-mods'
import { DEVICES_BY_ID, deviceHref } from '../devices/registry'
import { Icon } from './Icon'

function selectionDetails(set: Configuration, betaAccess: boolean) {
  const device = configurationDevice(set)
  if (device === 'octatrack') {
    const limitIssue = overLimitMessage(set.moduleIds, 'sync') || (atLimit(set.moduleIds) ? LIMIT_REACHED : '')
    const removed = (set.removedStockFx ?? []).map(key => STOCK_EFFECT_NAMES[key] ?? key)
    return {
      resources: `${limitedCount(set.moduleIds)} of ${SET_MODULE_LIMIT} modules toward the set limit`,
      effects: removed.length ? `${removed.join(', ')} ${removed.length === 1 ? 'is' : 'are'} marked off in the stock FX menus.` : 'All stock FX kept.',
      issues: [
        moduleAvailabilityError(set.moduleIds, betaAccess),
        limitIssue,
        removed.length ? 'USB sync requires all stock FX.' : '',
      ].filter(Boolean),
    }
  }
  if (isDigiDevice(device)) {
    const estimate = estimateCombination(device, set.moduleIds)
    const kib = (bytes: number) => (bytes / 1024).toFixed(1)
    return {
      resources: `Estimated memory use is ${kib(estimate.usedBytes)} of ${kib(estimate.areaBytes)} KiB`,
      issues: [
        ...(!estimate.fits ? ['Over the shared memory limit. Remove a module.'] : []),
        ...estimate.clashes.map(clash => `${clash.mods.join(' and ')} cannot be used together (${clash.claim}).`),
      ],
    }
  }
}

export function LibrarySelection({ sets, betaAccess, phone }: { sets: readonly Configuration[]; betaAccess: boolean; phone: boolean }) {
  const entries = sets.flatMap(set => {
    if (!set.moduleIds.length && !set.removedStockFx?.length) return []
    const details = selectionDetails(set, betaAccess)
    return details ? [{ set, device: configurationDevice(set), ...details }] : []
  })
  const issueCount = entries.reduce((count, entry) => count + entry.issues.length, 0)
  const content = entries.map(({ set, device, resources, effects, issues }) => <div key={device} className="library-selection-device">
    <a href={deviceHref(device, 'configuration')} aria-label={`Review ${DEVICES_BY_ID[device].name} configuration ${set.name}`}>
      <span><strong>{DEVICES_BY_ID[device].name}</strong><small>{set.name}</small></span><Icon name="arrow" size={14} />
    </a>
    <p>{resources}</p>
    {effects && <p>{effects}</p>}
    {issues.length > 0 && <ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
  </div>)

  return <>
    <p className="sr-only" role="status">{entries.length ? entries.map(entry => [`${DEVICES_BY_ID[entry.device].name}, ${entry.resources}.`, entry.effects, ...entry.issues].filter(Boolean).join(' ')).join(' ') : 'No selections to check.'}</p>
    {entries.length > 0 && (phone ? <details className="library-selection">
      <summary>Selection details{issueCount > 0 && <> <span>{issueCount} {issueCount === 1 ? 'issue' : 'issues'}</span></>}</summary>
      <div className="library-selection-list">{content}</div>
    </details> : <section className="library-selection" aria-label="Selection details">
      <h2>Selection details</h2>
      <div className="library-selection-list">{content}</div>
    </section>)}
  </>
}
